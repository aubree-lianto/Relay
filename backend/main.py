import asyncio
import random
from dotenv import load_dotenv
load_dotenv()

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
    return {
        "heart_rate": random.randint(60, 110),
        "spo2": round(random.uniform(92, 100), 1),
        "blood_pressure_systolic": random.randint(110, 160),
        "blood_pressure_diastolic": random.randint(70, 100),
        "respiratory_rate": random.randint(12, 25),
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
        patient_record.triage_level = result["triage_level"]

        return TriageProcessResponse(
            patient_record=patient_record,
            triage_level=result["triage_level"],
            triage_reasoning=result["triage_reasoning"],
            missing_fields=result["missing_fields"],
            validation_warnings=result["validation_warnings"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patients")
def list_patients():
    """List all patient records stored by the triage agent."""
    return {"patients": list(PATIENT_STORE.values())}
