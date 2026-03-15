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
from agent import run_triage, agent as triage_agent
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
    """Run triage agent and stream each node execution back over WebSocket."""
    await websocket.accept()
    try:
        data = await websocket.receive_text()
        payload = json.loads(data)
        transcript = payload.get("transcript", "")

        await websocket.send_json({"type": "status", "step": "starting"})

        initial_state = {
            "transcript": transcript,
            "patient_record": {},
            "validation_warnings": [],
            "missing_fields": [],
            "ctas": 3,
            "ctas_reasoning": "",
            "problem_code": None
        }

        current_state = initial_state.copy()

        # Stream the exact nodes being executed by LangGraph
        async for output in triage_agent.astream(initial_state, stream_mode="updates"):
            for node_name, state_update in output.items():
                current_state.update(state_update)
                await websocket.send_json({
                    "type": "tool_result",
                    "tool": node_name,
                    "data": state_update,
                })
                # Add a tiny visual delay so the user can easily perceive the rapid processing steps
                await asyncio.sleep(0.4)

        # Send final extracted summary
        await websocket.send_json({
            "type": "final",
            "patient_record": current_state.get("patient_record", {}),
            "ctas": current_state.get("ctas"),
            "ctas_reasoning": current_state.get("ctas_reasoning"),
            "missing_fields": current_state.get("missing_fields", []),
            "validation_warnings": current_state.get("validation_warnings", []),
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
        result = run_triage(request.transcript)

        return TriageProcessResponse(
            patient_record=result.get("patient_record", {}),
            ctas=result.get("ctas", 3),
            ctas_reasoning=result.get("ctas_reasoning", ""),
            problem_code=result.get("problem_code"),
            missing_fields=result.get("missing_fields", []),
            validation_warnings=result.get("validation_warnings", []),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patients")
def list_patients():
    """List all patient records stored by the triage agent."""
    return {"patients": list(PATIENT_STORE.values())}
