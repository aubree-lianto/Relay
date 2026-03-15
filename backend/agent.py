import json
import os
import uuid
from typing import Annotated, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from schemas import Demographics, PatientRecord, PhysicalExam, RelevantPastHistory, Vitals, TranscriptParseResult
from tools import _get_parser_llm, _infer_problem_code, PATIENT_STORE, PROBLEM_CODE_MAP

# --- State ---

class TriageState(TypedDict):
    """Linear pipeline state for processing a paramedic transcript."""
    transcript: str
    patient_record: dict
    validation_warnings: list[str]
    missing_fields: list[str]
    ctas: int
    ctas_reasoning: str
    problem_code: str | None


# --- Nodes ---

def parse_transcript_node(state: TriageState) -> dict:
    """Extract structured patient data from the voice transcript."""
    llm = _get_parser_llm()
    result = llm.invoke(
        f"""Extract ALL patient information from this paramedic voice transcript.
        Map every detail to Ontario Ambulance Call Report (ACR) fields. Use null only if truly not mentioned.

        Transcript:
        {state["transcript"]}

        Extract these fields:
        - Demographics: last_name, first_name, age (integer), sex (M/F/Other), weight_kg
        - Timing: date_of_occurrence (YYYY/MM/DD), time_of_occurrence (HH:MM)
        - Clinical: chief_complaint (short phrase), incident_history (full narrative of onset/context/symptoms), symptoms (list)
        - Past history booleans (true/false/null): past_history_cardiac, past_history_hypertension, past_history_diabetes, past_history_respiratory, past_history_seizure, past_history_psychiatric, past_history_stroke_tia
        - Medications (comma-separated string), allergies (NKA/CNO/list), treatment_prior_to_arrival
        - Physical exam: general_appearance (free text), skin_colour (Pale/Flushed/Cyanosis/Jaundice/Unremarkable), skin_condition (Diaphoretic/Dry/Clammy/Unremarkable)
        - Vitals: pulse_rate (int), resp_rate (int), bp_systolic (int), bp_diastolic (int), spo2 (float), temp (float)
        - Assessment: gcs (int 3-15), pain_scale (int 0-10)
        - Transport: estimated_arrival_minutes (int), pick_up_code (A-Z letter), remarks (anything else)

        Infer skin findings from descriptions: "diaphoretic" → skin_condition=Diaphoretic, "pale" → skin_colour=Pale, "short of breath" → symptoms includes dyspnea."""
    )
    # result is a pydantic model (TranscriptParseResult) since we use .with_structured_output()
    return {"patient_record": result.model_dump(exclude_unset=True)}


def validate_vitals_node(state: TriageState) -> dict:
    """Validate vital signs against normal ranges."""
    warnings = []
    v = state.get("patient_record", {})
    
    pulse = v.get("pulse_rate")
    resp = v.get("resp_rate")
    bp_sys = v.get("bp_systolic")
    bp_dia = v.get("bp_diastolic")
    spo2 = v.get("spo2")

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

    return {"validation_warnings": warnings}


def check_missing_components_node(state: TriageState) -> dict:
    """Check which vital fields are missing from the parsed patient run report."""
    data = state.get("patient_record", {})
    required = ["chief_complaint"]
    preferred = ["age", "sex", "estimated_arrival_minutes"]

    missing_required = []
    missing_preferred = []
    for f in required:
        val = data.get(f)
        if not val and f == "chief_complaint" and data.get("incident_history"):
            continue
        if not val:
            missing_required.append(f)

    for f in preferred:
        if not data.get(f):
            missing_preferred.append(f)

    if not any(data.get(k) for k in ["pulse_rate", "bp_systolic", "spo2", "resp_rate"]):
         missing_preferred.append("vitals")

    return {"missing_fields": missing_required + missing_preferred}


def compute_triage_node(state: TriageState) -> dict:
    """Compute ESI/CTAS Triage score based on objective deterministic values."""
    data = state.get("patient_record", {})
    chief = data.get("chief_complaint")
    symptoms = data.get("symptoms", []) or []
    if isinstance(symptoms, str):
        symptoms = [symptoms]
        
    pulse = data.get("pulse_rate")
    spo2 = data.get("spo2")
    bp_sys = data.get("bp_systolic")
    
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

    # Vitals-based deterministic escalation
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
    
    # We add this directly into nested data so Next.JS component structure can still find it occasionally
    data["ctas"] = level
    data["problem_code"] = problem_code

    return {
        "ctas": level,
        "ctas_reasoning": reasoning,
        "problem_code": problem_code,
        "patient_record": data
    }


def save_record_node(state: TriageState) -> dict:
    """Save finalized state to patient store."""
    data = state.get("patient_record", {})
    patient_id = data.get("id") or str(uuid.uuid4())
    data["id"] = patient_id
    PATIENT_STORE[patient_id] = data
    return {"patient_record": data}


# --- Graph Construction ---

graph_builder = StateGraph(TriageState)

graph_builder.add_node("parse", parse_transcript_node)
graph_builder.add_node("validate", validate_vitals_node)
graph_builder.add_node("missing", check_missing_components_node)
graph_builder.add_node("triage", compute_triage_node)
graph_builder.add_node("save", save_record_node)

graph_builder.add_edge(START, "parse")
graph_builder.add_edge("parse", "validate")
graph_builder.add_edge("validate", "missing")
graph_builder.add_edge("missing", "triage")
graph_builder.add_edge("triage", "save")
graph_builder.add_edge("save", END)

agent = graph_builder.compile()

# --- Legacy helpers maintained for external use / compat ---

def run_triage(transcript: str, config=None) -> dict:
    """Run the linear triage agent pipeline via synchronous invocation."""
    return agent.invoke({
        "transcript": transcript,
        "patient_record": {},
        "validation_warnings": [],
        "missing_fields": [],
        "ctas": 3,
        "ctas_reasoning": "",
        "problem_code": None
    }, config=config or {})
