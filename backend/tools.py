"""Tools for the paramedic triage LangGraph agent."""

import json
import os
import uuid
from typing import Any

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from schemas import PatientRecord, TranscriptParseResult, Vitals

# In-memory patient store (shared with agent / main)
PATIENT_STORE: dict[str, dict[str, Any]] = {}

# Parser LLM for extract_transcript (lazy init)
_parser_llm = None


def _get_parser_llm():
    global _parser_llm
    if _parser_llm is None:
        _parser_llm = ChatOpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0,
        ).with_structured_output(TranscriptParseResult)
    return _parser_llm


# --- Tool arg schemas (for strict validation) ---


class ParseTranscriptInput(BaseModel):
    transcript: str = Field(..., description="Raw voice transcript from paramedic")


class ComputeTriageInput(BaseModel):
    patient_record_json: str = Field(
        ...,
        description="JSON string of the patient record (PatientRecord)",
    )


class UpdatePatientRecordInput(BaseModel):
    patient_record_json: str = Field(
        ...,
        description="JSON string of the patient record to store",
    )


class CheckMissingFieldsInput(BaseModel):
    patient_record_json: str = Field(
        ...,
        description="JSON string of the patient record to check",
    )


class ValidateVitalsInput(BaseModel):
    vitals_json: str = Field(
        ...,
        description="JSON string of vitals dict with keys: heart_rate, spo2, blood_pressure_systolic, blood_pressure_diastolic, respiratory_rate",
    )


# --- Tools ---


@tool(args_schema=ParseTranscriptInput)
def parse_transcript(transcript: str) -> str:
    """Extract structured patient data from a voice transcript.
    Use this when you receive raw paramedic speech and need to convert it
    into age, sex, symptoms, vitals, and ETA fields."""
    llm = _get_parser_llm()
    result = llm.invoke(
        f"""Extract structured patient information from this paramedic voice transcript.
        Return only the fields you can identify. Use null for missing values.

        Transcript:
        {transcript}

        Look for: age, sex, chief complaint, symptoms, heart rate, SpO2, blood pressure (systolic/diastolic),
        respiratory rate, estimated arrival time in minutes, and any notes."""
    )
    # Convert to dict for JSON serialization
    data = result.model_dump()
    return json.dumps(data, default=str)


@tool(args_schema=ComputeTriageInput)
def compute_triage_score(patient_record_json: str) -> str:
    """Compute ESI triage level (1-5) for a patient record.
    Level 1: Resuscitation, Level 2: Emergent, Level 3: Urgent, Level 4: Less urgent, Level 5: Non-urgent.
    Use after you have extracted or updated patient data."""
    try:
        data = json.loads(patient_record_json)
        record = PatientRecord(
            age=data.get("age"),
            sex=data.get("sex"),
            chief_complaint=data.get("chief_complaint"),
            symptoms=data.get("symptoms", []),
            vitals=Vitals(**data["vitals"]) if data.get("vitals") else None,
            estimated_arrival_minutes=data.get("estimated_arrival_minutes"),
            triage_level=data.get("triage_level"),
            notes=data.get("notes"),
        )
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        return json.dumps({"error": str(e), "triage_level": 3, "reasoning": "Default to urgent due to parse error"})

    # Simplified ESI-like logic
    level = 3  # default: urgent
    reasoning_parts = []

    symptoms = record.symptoms or []
    if record.chief_complaint:
        symptoms = list(symptoms) + [record.chief_complaint.lower()]

    critical_keywords = ["unresponsive", "cardiac arrest", "not breathing", "stroke", "severe bleeding"]
    emergent_keywords = ["chest pain", "shortness of breath", "severe pain", "allergic reaction", "overdose"]

    for kw in critical_keywords:
        if any(kw in s for s in symptoms):
            level = 1
            reasoning_parts.append(f"Critical symptom: {kw}")
            break

    if level == 3:
        for kw in emergent_keywords:
            if any(kw in s for s in symptoms):
                level = 2
                reasoning_parts.append(f"Emergent symptom: {kw}")
                break

    # Vitals-based adjustments
    v = record.vitals
    if v:
        if v.heart_rate and (v.heart_rate < 50 or v.heart_rate > 120):
            level = min(level, 2)
            reasoning_parts.append(f"Abnormal heart rate: {v.heart_rate}")
        if v.spo2 and v.spo2 < 92:
            level = min(level, 2)
            reasoning_parts.append(f"Low SpO2: {v.spo2}")
        if v.blood_pressure_systolic and v.blood_pressure_systolic > 180:
            level = min(level, 2)
            reasoning_parts.append(f"High BP: {v.blood_pressure_systolic}")

    # Less urgent
    if not symptoms and not record.chief_complaint:
        level = 4
        reasoning_parts.append("No acute symptoms reported")

    reasoning = "; ".join(reasoning_parts) if reasoning_parts else "Routine presentation"

    return json.dumps({
        "triage_level": level,
        "reasoning": reasoning,
    })


@tool(args_schema=UpdatePatientRecordInput)
def update_patient_record(patient_record_json: str) -> str:
    """Store or update a patient record for the hospital dashboard.
    Call this after parsing and triage to persist the patient data."""
    try:
        data = json.loads(patient_record_json)
        patient_id = data.get("id") or str(uuid.uuid4())
        data["id"] = patient_id
        PATIENT_STORE[patient_id] = data
        return json.dumps({"status": "ok", "patient_id": patient_id})
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool(args_schema=CheckMissingFieldsInput)
def check_missing_fields(patient_record_json: str) -> str:
    """Check which required fields are missing from a patient record.
    Required for triage: age or approximate age, sex, chief_complaint or symptoms, vitals when available."""
    required = ["chief_complaint", "symptoms"]
    preferred = ["age", "sex", "estimated_arrival_minutes", "vitals"]

    try:
        data = json.loads(patient_record_json)
        missing_required = [f for f in required if not data.get(f)]
        if "symptoms" in missing_required and data.get("chief_complaint"):
            missing_required.remove("symptoms")
        if "chief_complaint" in missing_required and data.get("symptoms"):
            missing_required.remove("chief_complaint")

        missing_preferred = [f for f in preferred if not data.get(f)]
        return json.dumps({
            "missing_required": missing_required,
            "missing_preferred": missing_preferred,
        })
    except Exception as e:
        return json.dumps({"error": str(e), "missing_required": required, "missing_preferred": preferred})


@tool(args_schema=ValidateVitalsInput)
def validate_vitals(vitals_json: str) -> str:
    """Validate vital signs against normal ranges. Flags abnormal values.
    Input: JSON with heart_rate, spo2, blood_pressure_systolic, blood_pressure_diastolic, respiratory_rate."""
    try:
        v = json.loads(vitals_json)
        warnings = []

        hr = v.get("heart_rate")
        if hr is not None and (hr < 50 or hr > 120):
            warnings.append(f"Heart rate {hr} outside normal (50-120)")

        spo2 = v.get("spo2")
        if spo2 is not None and spo2 < 95:
            warnings.append(f"SpO2 {spo2}% below normal (95-100)")

        sys_bp = v.get("blood_pressure_systolic")
        if sys_bp is not None and (sys_bp < 90 or sys_bp > 180):
            warnings.append(f"Systolic BP {sys_bp} outside normal (90-180)")

        dia_bp = v.get("blood_pressure_diastolic")
        if dia_bp is not None and (dia_bp < 60 or dia_bp > 120):
            warnings.append(f"Diastolic BP {dia_bp} outside normal (60-120)")

        rr = v.get("respiratory_rate")
        if rr is not None and (rr < 8 or rr > 30):
            warnings.append(f"Respiratory rate {rr} outside normal (8-30)")

        valid = len(warnings) == 0
        return json.dumps({
            "valid": valid,
            "warnings": warnings,
        })
    except Exception as e:
        return json.dumps({"valid": False, "warnings": [str(e)]})


# All tools for the agent
TRIAGE_TOOLS = [
    parse_transcript,
    compute_triage_score,
    update_patient_record,
    check_missing_fields,
    validate_vitals,
]
tools_by_name = {t.name: t for t in TRIAGE_TOOLS}
