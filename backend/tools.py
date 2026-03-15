"""Tools for the paramedic triage LangGraph agent.
Aligned with Ontario Ambulance Call Report (ACR).
"""
from __future__ import annotations

import json
import os
import uuid
from typing import Any

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from schemas import (
    Demographics,
    PatientRecord,
    PhysicalExam,
    RelevantPastHistory,
    TranscriptParseResult,
    Vitals,
)
from store import upsert_patient

# Parser LLM (lazy init)
_parser_llm = None

# Ontario ACR Problem Code mapping (chief complaint keywords -> code)
# Reference: https://www.lhsc.on.ca/media/2946/download
PROBLEM_CODE_MAP = {
    "cardiac arrest": "VSA",
    "vsa": "VSA",
    "ischemic": "51",
    "stemi": "57",
    "chest pain": "60",
    "palpitations": "53",
    "pulmonary edema": "54",
    "dyspnea": "21",
    "shortness of breath": "21",
    "respiratory arrest": "24",
    "stroke": "41",
    "tia": "41",
    "seizure": "46",
    "altered level": "43",
    "unconscious": "49",
    "hemorrhage": "31",
    "bleeding": "31",
    "hypotension": "33",
    "sepsis": "34",
    "abdominal pain": "61",
    "overdose": "81",
    "poisoning": "82",
    "diabetic": "83",
    "allergic reaction": "84",
    "anaphylaxis": "85",
    "trauma": "67",
    "musculoskeletal": "66",
    "nausea": "63",
    "vomiting": "63",
    "weakness": "92",
    "dizziness": "92",
}


def _get_parser_llm():
    global _parser_llm
    if _parser_llm is None:
        _parser_llm = ChatOpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0,
        ).with_structured_output(TranscriptParseResult)
    return _parser_llm


def _infer_problem_code(chief_complaint: str | None, symptoms: list[str]) -> str | None:
    """Map chief complaint / symptoms to Ontario ACR Problem Code."""
    text = (chief_complaint or "").lower() + " " + " ".join(s or "" for s in symptoms).lower()
    for keyword, code in PROBLEM_CODE_MAP.items():
        if keyword in text:
            return code
    return None


# --- Tool arg schemas ---


class ParseTranscriptInput(BaseModel):
    transcript: str = Field(..., description="Raw voice transcript from paramedic")


class ComputeTriageInput(BaseModel):
    patient_record_json: str = Field(..., description="JSON string of the patient record")


class UpdatePatientRecordInput(BaseModel):
    patient_record_json: str = Field(..., description="JSON string of the patient record to store")


class CheckMissingFieldsInput(BaseModel):
    patient_record_json: str = Field(..., description="JSON string of the patient record to check")


class ValidateVitalsInput(BaseModel):
    vitals_json: str = Field(
        ...,
        description="JSON with pulse_rate, resp_rate, bp_systolic, bp_diastolic, spo2, temp",
    )


# --- Tools ---


@tool(args_schema=ParseTranscriptInput)
def parse_transcript(transcript: str) -> str:
    """Extract structured patient data from a voice transcript for the Ontario Ambulance Call Report.
    Use when you receive raw paramedic speech and need to convert it into ACR fields."""
    llm = _get_parser_llm()
    result = llm.invoke(
        f"""Extract patient information from this paramedic voice transcript.
        Map to Ontario Ambulance Call Report (ACR) fields. Use null for missing values.

        Transcript:
        {transcript}

        Extract: last_name, first_name, age, sex, weight_kg, date_of_occurrence (YYYY/MM/DD),
        time_of_occurrence (HH:MM), chief_complaint, incident_history, symptoms (list if multiple),
        past history (cardiac, diabetes,
        respiratory, hypertension as booleans if mentioned), medications, allergies (NKA/CNO or list),
        treatment_prior_to_arrival, general_appearance, skin_colour, skin_condition, pulse_rate,
        resp_rate, bp_systolic, bp_diastolic, temp, spo2, estimated_arrival_minutes, pick_up_code (A-Z),
        remarks."""
    )
    return json.dumps(result.model_dump(), default=str)


@tool(args_schema=ComputeTriageInput)
def compute_triage_score(patient_record_json: str) -> str:
    """Compute CTAS (Canadian Triage and Acuity Scale) for a patient record.
    CTAS: 1 Resuscitation, 2 Emergent, 3 Urgent, 4 Less Urgent, 5 Non Urgent, 0 Obviously Dead.
    Use after you have extracted or updated patient data.
    Also infers Ontario ACR Problem Code from chief complaint."""
    try:
        data = json.loads(patient_record_json)
        chief = data.get("chief_complaint")
        if not chief and data.get("demographics"):
            demo = data["demographics"]
            chief = demo.get("chief_complaint") if isinstance(demo, dict) else None
        symptoms = data.get("symptoms", []) or []
        if isinstance(symptoms, str):
            symptoms = [symptoms]
        vitals_data = data.get("vitals") or {}

        # Build vitals from nested or flat
        pulse = vitals_data.get("pulse_rate") or data.get("pulse_rate")
        resp = vitals_data.get("resp_rate") or data.get("resp_rate")
        spo2 = vitals_data.get("spo2")
        bp_sys = vitals_data.get("bp_systolic") or data.get("bp_systolic")
        if isinstance(bp_sys, dict):
            bp_sys = bp_sys.get("systolic")

        # CTAS logic (aligned with Ontario)
        level = 3
        reasoning_parts = []

        complaint_text = (chief or "").lower()
        symptom_text = " ".join(s or "" for s in symptoms).lower()
        combined = complaint_text + " " + symptom_text

        # Level 1: Resuscitation
        critical = ["unresponsive", "cardiac arrest", "not breathing", "vsa", "respiratory arrest", "obviously dead"]
        for kw in critical:
            if kw in combined:
                level = 1
                reasoning_parts.append(f"Resuscitation: {kw}")
                break

        if level == 3:
            # Level 2: Emergent
            emergent = ["chest pain", "shortness of breath", "dyspnea", "stroke", "severe pain", "anaphylaxis", "overdose", "severe bleeding"]
            for kw in emergent:
                if kw in combined:
                    level = 2
                    reasoning_parts.append(f"Emergent: {kw}")
                    break

        # Vitals-based
        if pulse is not None and (pulse < 50 or pulse > 120):
            level = min(level, 2)
            reasoning_parts.append(f"Abnormal pulse: {pulse}")
        if spo2 is not None and spo2 < 92:
            level = min(level, 2)
            reasoning_parts.append(f"Low SpO2: {spo2}")
        if bp_sys is not None and bp_sys > 180:
            level = min(level, 2)
            reasoning_parts.append(f"High BP: {bp_sys}")

        if not complaint_text and not symptoms:
            level = 4
            reasoning_parts.append("No acute symptoms")

        problem_code = _infer_problem_code(chief, symptoms)
        reasoning = "; ".join(reasoning_parts) if reasoning_parts else "Routine presentation"

        return json.dumps({
            "ctas": level,
            "reasoning": reasoning,
            "problem_code": problem_code,
        })
    except Exception as e:
        return json.dumps({
            "error": str(e),
            "ctas": 3,
            "reasoning": "Default to Urgent due to parse error",
            "problem_code": None,
        })


@tool(args_schema=UpdatePatientRecordInput)
def update_patient_record(patient_record_json: str) -> str:
    """Store a patient record for the hospital dashboard.
    Call after parsing and triage to persist the Ontario ACR data."""
    try:
        data = json.loads(patient_record_json)
        patient_id = data.get("id") or str(uuid.uuid4())
        data["id"] = patient_id
        upsert_patient(patient_id, data)
        return json.dumps({"status": "ok", "patient_id": patient_id})
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool(args_schema=CheckMissingFieldsInput)
def check_missing_fields(patient_record_json: str) -> str:
    """Check which Ontario ACR required fields are missing.
    Required: chief_complaint (or incident_history), demographics/age or sex when available."""
    required = ["chief_complaint"]
    preferred = ["age", "sex", "vitals", "estimated_arrival_minutes", "date_of_occurrence", "time_of_occurrence"]

    try:
        data = json.loads(patient_record_json)
        missing_required = []
        for f in required:
            val = data.get(f)
            if not val and f == "chief_complaint" and data.get("incident_history"):
                continue
            if not val:
                missing_required.append(f)

        # Check nested demographics
        demo = data.get("demographics") or {}
        age = data.get("age") or demo.get("age")
        sex = data.get("sex") or demo.get("sex")
        vitals = data.get("vitals")
        eta = data.get("estimated_arrival_minutes")

        missing_preferred = []
        if not age:
            missing_preferred.append("age")
        if not sex:
            missing_preferred.append("sex")
        if not vitals and not any(k in str(data) for k in ["pulse_rate", "heart_rate", "spo2"]):
            missing_preferred.append("vitals")
        if not eta:
            missing_preferred.append("estimated_arrival_minutes")

        return json.dumps({
            "missing_required": missing_required,
            "missing_preferred": missing_preferred,
        })
    except Exception as e:
        return json.dumps({"error": str(e), "missing_required": required, "missing_preferred": preferred})


@tool(args_schema=ValidateVitalsInput)
def validate_vitals(vitals_json: str) -> str:
    """Validate vital signs against normal ranges (Ontario ACR reference).
    Input: JSON with pulse_rate, resp_rate, bp_systolic, bp_diastolic, spo2, temp."""
    try:
        v = json.loads(vitals_json)
        # Accept both Ontario names and legacy
        pulse = v.get("pulse_rate") or v.get("heart_rate")
        resp = v.get("resp_rate") or v.get("respiratory_rate")
        bp_sys = v.get("bp_systolic") or v.get("blood_pressure_systolic")
        bp_dia = v.get("bp_diastolic") or v.get("blood_pressure_diastolic")
        spo2 = v.get("spo2")

        warnings = []
        if pulse is not None and (pulse < 50 or pulse > 120):
            warnings.append(f"Pulse rate {pulse} outside normal (50-120)")
        if resp is not None and (resp < 8 or resp > 30):
            warnings.append(f"Respiratory rate {resp} outside normal (8-30)")
        if bp_sys is not None and (bp_sys < 90 or bp_sys > 180):
            warnings.append(f"Systolic BP {bp_sys} outside normal (90-180)")
        if bp_dia is not None and (bp_dia < 60 or bp_dia > 120):
            warnings.append(f"Diastolic BP {bp_dia} outside normal (60-120)")
        if spo2 is not None and spo2 < 95:
            warnings.append(f"SpO2 {spo2}% below normal (95-100)")

        return json.dumps({"valid": len(warnings) == 0, "warnings": warnings})
    except Exception as e:
        return json.dumps({"valid": False, "warnings": [str(e)]})


TRIAGE_TOOLS = [
    parse_transcript,
    compute_triage_score,
    update_patient_record,
    check_missing_fields,
    validate_vitals,
]
tools_by_name = {t.name: t for t in TRIAGE_TOOLS}
