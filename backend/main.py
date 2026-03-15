import asyncio
import concurrent.futures
import json
import random
import traceback
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import ToolMessage

from schemas import TriageProcessRequest, TriageProcessResponse
from agent import run_triage, extract_response
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


@app.websocket("/ws/triage")
async def triage_stream(websocket: WebSocket):
    """Run triage agent in a thread and stream each tool result back over WebSocket."""
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        payload = json.loads(data)
        transcript = payload.get("transcript", "")

        await websocket.send_json({"type": "status", "step": "parsing"})

        # Run the synchronous LangGraph agent in a thread so the event loop stays alive
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            state = await loop.run_in_executor(pool, run_triage, transcript)

        messages = state.get("messages", [])

        # Stream each tool result
        for msg in messages:
            if isinstance(msg, ToolMessage):
                try:
                    result_data = json.loads(msg.content)
                except (json.JSONDecodeError, TypeError):
                    result_data = {"raw": str(msg.content)}
                await websocket.send_json({
                    "type": "tool_result",
                    "tool": msg.name,
                    "data": result_data,
                })

        # Send final extracted summary
        result = extract_response(messages)
        await websocket.send_json({
            "type": "final",
            "ctas": result["ctas"],
            "ctas_reasoning": result["ctas_reasoning"],
            "missing_fields": result["missing_fields"],
            "validation_warnings": result["validation_warnings"],
        })

        await websocket.send_json({"type": "status", "step": "done"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


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


@app.get("/patients")
def list_patients():
    """List all patient records stored by the triage agent."""
    return {"patients": list(PATIENT_STORE.values())}
