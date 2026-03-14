import asyncio
import random
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

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
