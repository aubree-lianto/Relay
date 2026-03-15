"""LangGraph triage agent for paramedic voice transcripts."""

import json
import os
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from langchain_openai import ChatOpenAI

from schemas import Demographics, PatientRecord, PhysicalExam, RelevantPastHistory, Vitals
from tools import TRIAGE_TOOLS

# --- State ---


class MessagesState(TypedDict):
    """Agent state: messages list with add_messages reducer."""

    messages: Annotated[list[BaseMessage], add_messages]


# --- LLM ---

llm = ChatOpenAI(
    model="gpt-4o-mini",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0,
).bind_tools(TRIAGE_TOOLS)


# --- System prompt ---

SYSTEM_PROMPT = """You are a paramedic triage assistant for Ontario. You receive voice transcripts and produce patient records aligned with the Ontario Ambulance Call Report (ACR).

Always follow these steps IN ORDER — do not skip any:
1. Call parse_transcript with the raw transcript.
2. Call validate_vitals with the vitals JSON from step 1.
3. Call check_missing_fields with the full patient record JSON from step 1.
4. Call compute_triage_score with the full patient record JSON from step 1.
5. Call update_patient_record with the complete final record (see format below).

When calling update_patient_record, pass a FLAT JSON string with ALL fields you can extract.
Use null only if the information was truly not mentioned. Extract everything possible from the transcript.

Required JSON format for update_patient_record:
{
  "last_name": null,
  "first_name": null,
  "age": <integer or null>,
  "sex": "<M or F or Other or null>",
  "weight_kg": null,
  "chief_complaint": "<main complaint as a short phrase>",
  "incident_history": "<full narrative: onset, mechanism, progression, associated symptoms>",
  "symptoms": ["<symptom1>", "<symptom2>"],
  "past_history_cardiac": <true or false or null>,
  "past_history_hypertension": <true or false or null>,
  "past_history_diabetes": <true or false or null>,
  "past_history_respiratory": <true or false or null>,
  "past_history_seizure": <true or false or null>,
  "past_history_psychiatric": <true or false or null>,
  "past_history_stroke_tia": <true or false or null>,
  "medications": "<comma-separated medication names, or NKA>",
  "allergies": "<NKA or CNO or specific allergy list>",
  "treatment_prior_to_arrival": "<treatments given before arrival, or null>",
  "general_appearance": "<description of patient appearance>",
  "skin_colour": "<Pale or Flushed or Cyanosis or Jaundice or Unremarkable>",
  "skin_condition": "<Diaphoretic or Dry or Clammy or Unremarkable>",
  "pulse_rate": <integer or null>,
  "resp_rate": <integer or null>,
  "bp_systolic": <integer or null>,
  "bp_diastolic": <integer or null>,
  "spo2": <number or null>,
  "temp": <number or null>,
  "gcs": <integer 3-15 or null>,
  "pain_scale": <integer 0-10 or null>,
  "estimated_arrival_minutes": <integer or null>,
  "pick_up_code": null,
  "remarks": "<any additional notes not captured above>",
  "ctas": <integer 1-5>,
  "problem_code": "<Ontario ACR problem code e.g. 60, 21, 51>"
}

Example: for "Male, 58yo, chest pain radiating to left arm, BP 162/94, pulse 108, diaphoretic, ASA and nitro, hypertension, cardiac history, ETA 6 min" you should extract:
age=58, sex="M", chief_complaint="chest pain", incident_history="chest pain radiating to left arm onset 15 min ago, diaphoretic, SOB", past_history_cardiac=true, past_history_hypertension=true, medications="ASA, Nitroglycerin", skin_colour="Pale", skin_condition="Diaphoretic", pulse_rate=108, bp_systolic=162, bp_diastolic=94, spo2=91, estimated_arrival_minutes=6, ctas=2."""


# --- Nodes ---


def llm_node(state: MessagesState) -> dict:
    """Invoke the LLM with messages."""
    messages = state["messages"]
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT)] + list(messages))
    return {"messages": [response]}


def should_continue(state: dict) -> Literal["tools", "__end__"]:
    """Route to tools or end based on last message."""
    messages = state["messages"]
    last = messages[-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return "__end__"


# --- Graph ---

tools_node = ToolNode(TRIAGE_TOOLS)

graph_builder = StateGraph(MessagesState)

graph_builder.add_node("llm", llm_node)
graph_builder.add_node("tools", tools_node)

graph_builder.add_edge(START, "llm")
graph_builder.add_conditional_edges("llm", should_continue, {"tools": "tools", "__end__": END})
graph_builder.add_edge("tools", "llm")

agent = graph_builder.compile()


# --- Invoke helper ---


def run_triage(transcript: str, config: RunnableConfig | None = None) -> dict:
    """Run the triage agent on a transcript. Returns the final state."""
    messages = [HumanMessage(content=f"Process this paramedic transcript:\n\n{transcript}")]
    return agent.invoke({"messages": messages}, config=config or {})


def _parse_result_to_patient_record(v: dict) -> PatientRecord:
    """Convert flat parse result dict to nested PatientRecord."""
    # Vitals
    vitals = None
    if any(v.get(k) for k in ["pulse_rate", "spo2", "resp_rate", "bp_systolic"]):
        vitals = Vitals(
            pulse_rate=v.get("pulse_rate"),
            resp_rate=v.get("resp_rate"),
            bp_systolic=v.get("bp_systolic"),
            bp_diastolic=v.get("bp_diastolic"),
            spo2=v.get("spo2"),
            temp=v.get("temp"),
        )

    # Demographics
    demo = None
    if any(v.get(k) for k in ["last_name", "first_name", "age", "sex", "weight_kg"]):
        demo = Demographics(
            last_name=v.get("last_name"),
            first_name=v.get("first_name"),
            age=v.get("age"),
            sex=v.get("sex"),
            weight_kg=v.get("weight_kg"),
        )

    # Physical exam
    phys = None
    if any(v.get(k) for k in ["general_appearance", "skin_colour", "skin_condition"]):
        phys = PhysicalExam(
            general_appearance=v.get("general_appearance"),
            skin_colour=v.get("skin_colour"),
            skin_condition=v.get("skin_condition"),
        )

    # Past history — check both flat keys and nested dict
    past = None
    past_src = v.get("past_history") if isinstance(v.get("past_history"), dict) else v
    past_keys = ["cardiac", "hypertension", "diabetes", "respiratory", "seizure", "psychiatric", "stroke_tia"]
    if any(past_src.get(f"past_history_{k}") or past_src.get(k) for k in past_keys):
        past = RelevantPastHistory(
            cardiac=past_src.get("past_history_cardiac") or past_src.get("cardiac"),
            hypertension=past_src.get("past_history_hypertension") or past_src.get("hypertension"),
            diabetes=past_src.get("past_history_diabetes") or past_src.get("diabetes"),
            respiratory=past_src.get("past_history_respiratory") or past_src.get("respiratory"),
            seizure=past_src.get("past_history_seizure") or past_src.get("seizure"),
            psychiatric=past_src.get("past_history_psychiatric") or past_src.get("psychiatric"),
            stroke_tia=past_src.get("past_history_stroke_tia") or past_src.get("stroke_tia"),
        )

    # Build remarks — append gcs/pain_scale if present
    remarks = v.get("remarks") or ""
    if v.get("gcs") is not None:
        remarks = (remarks + f" GCS {v['gcs']}").strip()
    if v.get("pain_scale") is not None:
        remarks = (remarks + f" Pain {v['pain_scale']}/10").strip()

    return PatientRecord(
        demographics=demo,
        date_of_occurrence=v.get("date_of_occurrence"),
        time_of_occurrence=v.get("time_of_occurrence"),
        chief_complaint=v.get("chief_complaint"),
        incident_history=v.get("incident_history"),
        past_history=past,
        medications=v.get("medications"),
        allergies=v.get("allergies"),
        treatment_prior_to_arrival=v.get("treatment_prior_to_arrival"),
        physical_exam=phys,
        vitals=vitals,
        estimated_arrival_minutes=v.get("estimated_arrival_minutes"),
        pick_up_code=v.get("pick_up_code"),
        remarks=remarks or None,
    )


def extract_response(messages: list) -> dict:
    """Extract structured triage response from agent messages."""
    patient_record = PatientRecord()
    ctas = 3
    ctas_reasoning = ""
    problem_code = None
    missing_fields = []
    validation_warnings = []

    # Walk messages oldest-first; later messages overwrite earlier ones
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        try:
            data = json.loads(msg.content)
        except (json.JSONDecodeError, TypeError):
            continue

        if "error" in data:
            continue

        # compute_triage_score result
        if "ctas" in data and "reasoning" in data:
            ctas = int(data["ctas"])
            ctas_reasoning = data.get("reasoning", "")
            problem_code = data.get("problem_code")

        # check_missing_fields result
        elif "missing_required" in data or "missing_preferred" in data:
            missing_fields = (
                data.get("missing_required", []) + data.get("missing_preferred", [])
            )

        # validate_vitals result
        elif "warnings" in data and "valid" in data:
            validation_warnings = data.get("warnings", [])

        # update_patient_record result (status ok — data is in the stored record)
        elif data.get("status") == "ok":
            pass

        # parse_transcript result — flat dict with patient fields
        elif any(k in data for k in ["age", "chief_complaint", "pulse_rate", "incident_history"]):
            patient_record = _parse_result_to_patient_record(data)

    patient_record.ctas = ctas
    patient_record.problem_code = problem_code

    return {
        "patient_record": patient_record,
        "ctas": ctas,
        "ctas_reasoning": ctas_reasoning,
        "problem_code": problem_code,
        "missing_fields": missing_fields,
        "validation_warnings": validation_warnings,
    }
