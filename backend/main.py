import asyncio
import random
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from schemas import TriageProcessRequest, TriageProcessResponse
from agent import run_triage, extract_response
from store import list_patients
from memory import get_similar_cases, store_triage_case

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def generate_vitals():
    """Generate vitals matching Ontario ACR. Includes both Ontario and frontend-friendly field names."""
    pulse = random.randint(60, 110)
    resp = random.randint(12, 25)
    bp_sys = random.randint(110, 160)
    bp_dia = random.randint(70, 100)
    spo2 = round(random.uniform(92, 100), 1)
    temp = round(random.uniform(36.5, 37.5), 1)
    return {
        "pulse_rate": pulse,
        "resp_rate": resp,
        "bp_systolic": bp_sys,
        "bp_diastolic": bp_dia,
        "spo2": spo2,
        "temp": temp,
        # Frontend aliases (AmbulanceMap, triage page)
        "heart_rate": pulse,
        "respiratory_rate": resp,
        "blood_pressure_systolic": bp_sys,
        "blood_pressure_diastolic": bp_dia,
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
        # Retrieve similar past cases from Moorcheh semantic memory
        similar_cases = get_similar_cases(request.transcript, top_k=3)

        state = run_triage(request.transcript, similar_cases=similar_cases)
        messages = state.get("messages", [])
        result = extract_response(messages)

        patient_record = result["patient_record"]
        ctas = result["ctas"]
        problem_code = result.get("problem_code")

        # Store in Moorcheh semantic memory for future retrieval
        pr = patient_record.model_dump() if hasattr(patient_record, "model_dump") else patient_record
        demo = pr.get("demographics") or {}
        vitals = pr.get("vitals") or {}
        vitals_str = ", ".join(
            f"{k}={v}" for k, v in vitals.items() if v is not None
        ) or "not recorded"
        store_triage_case(
            patient_id=pr.get("id", ""),
            transcript=request.transcript,
            chief_complaint=pr.get("chief_complaint"),
            ctas=ctas,
            problem_code=problem_code,
            vitals_summary=vitals_str,
            remarks=pr.get("remarks"),
        )

        return TriageProcessResponse(
            patient_record=patient_record,
            ctas=ctas,
            ctas_reasoning=result["ctas_reasoning"],
            problem_code=problem_code,
            missing_fields=result["missing_fields"],
            validation_warnings=result["validation_warnings"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patients")
def get_patients():
    """List all patient records stored by the triage agent."""
    return {"patients": list_patients()}
