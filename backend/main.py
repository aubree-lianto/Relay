import asyncio
import json
import random
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import ToolMessage

from schemas import TriageProcessRequest, TriageProcessResponse
from agent import run_triage, extract_response, agent as triage_agent
from tools import PATIENT_STORE

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_vitals():
    """Generate vitals matching Ontario ACR Clinical Treatment table columns."""
    return {
        "pulse_rate": random.randint(60, 110),
        "resp_rate": random.randint(12, 25),
        "bp_systolic": random.randint(110, 160),
        "bp_diastolic": random.randint(70, 100),
        "spo2": round(random.uniform(92, 100), 1),
        "temp": round(random.uniform(36.5, 37.5), 1),
    }


@app.websocket("/ws/vitals")
async def vitals_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            vitals = generate_vitals()
            await websocket.send_json(vitals)
            await asyncio.sleep(2)
    except Exception:
        await websocket.close()


@app.post("/triage/process", response_model=TriageProcessResponse)
def triage_process(request: TriageProcessRequest):
    """Process a paramedic voice transcript and return structured patient data with triage level."""
    try:
        state = run_triage(request.transcript)
        messages = state.get("messages", [])
        result = extract_response(messages)

        patient_record = result["patient_record"]
        return TriageProcessResponse(
            patient_record=patient_record,
            ctas=result["ctas"],
            ctas_reasoning=result["ctas_reasoning"],
            problem_code=result.get("problem_code"),
            missing_fields=result["missing_fields"],
            validation_warnings=result["validation_warnings"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/triage")
async def triage_stream(websocket: WebSocket):
    """Stream triage agent tool results in real time as each step completes."""
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        payload = json.loads(data)
        transcript = payload.get("transcript", "")

        await websocket.send_json({"type": "status", "step": "parsing"})

        from langchain_core.messages import HumanMessage
        messages = [HumanMessage(content=f"Process this paramedic transcript:\n\n{transcript}")]

        # Stream each step of the agent graph
        async for event in triage_agent.astream_events(
            {"messages": messages}, version="v2"
        ):
            kind = event.get("event")
            # Tool finished — emit its result
            if kind == "on_tool_end":
                tool_name = event.get("name", "")
                output = event.get("data", {}).get("output", "")
                try:
                    result = json.loads(output) if isinstance(output, str) else output
                except (json.JSONDecodeError, TypeError):
                    result = {"raw": str(output)}
                await websocket.send_json({
                    "type": "tool_result",
                    "tool": tool_name,
                    "data": result,
                })

        await websocket.send_json({"type": "status", "step": "done"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@app.get("/patients")
def list_patients():
    """List all patient records stored by the triage agent."""
    return {"patients": list(PATIENT_STORE.values())}
