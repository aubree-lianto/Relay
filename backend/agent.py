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

Your workflow:
1. Use parse_transcript(transcript) to extract structured patient data from the raw voice input.
2. If vitals were extracted, use validate_vitals to check for abnormal values.
3. Use check_missing_fields to identify gaps in the record.
4. Use compute_triage_score to assign CTAS (1-5) and infer Problem Code.
5. Use update_patient_record to store the final record (include ctas and problem_code).

Build the patient record as JSON with Ontario ACR fields:
- demographics: {last_name, first_name, age, sex, weight_kg}
- date_of_occurrence (YYYY/MM/DD), time_of_occurrence (HH:MM)
- chief_complaint, incident_history
- past_history: {cardiac, diabetes, respiratory, hypertension} (booleans)
- medications, allergies (NKA/CNO or list)
- treatment_prior_to_arrival
- physical_exam: {general_appearance, skin_colour, skin_condition}
- vitals: {pulse_rate, resp_rate, bp_systolic, bp_diastolic, spo2, temp}
- ctas (1-5), problem_code (Ontario code e.g. 51, 60, 21)
- estimated_arrival_minutes, pick_up_code (A-Z), remarks

Pass tool arguments as JSON strings. After all steps, summarize the Ontario ACR patient record and CTAS for hospital staff."""


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
    """Convert flat TranscriptParseResult to nested PatientRecord."""
    vitals = None
    if any(k in v for k in ["pulse_rate", "heart_rate", "spo2", "resp_rate"]):
        vitals = Vitals(
            pulse_rate=v.get("pulse_rate") or v.get("heart_rate"),
            resp_rate=v.get("resp_rate") or v.get("respiratory_rate"),
            bp_systolic=v.get("bp_systolic") or v.get("blood_pressure_systolic"),
            bp_diastolic=v.get("bp_diastolic") or v.get("blood_pressure_diastolic"),
            spo2=v.get("spo2"),
            temp=v.get("temp"),
        )
    demo = Demographics(
        last_name=v.get("last_name"),
        first_name=v.get("first_name"),
        age=v.get("age"),
        sex=v.get("sex"),
        weight_kg=v.get("weight_kg"),
    ) if any(v.get(k) for k in ["last_name", "first_name", "age", "sex", "weight_kg"]) else None
    phys = PhysicalExam(
        general_appearance=v.get("general_appearance"),
        skin_colour=v.get("skin_colour"),
        skin_condition=v.get("skin_condition"),
    ) if any(v.get(k) for k in ["general_appearance", "skin_colour", "skin_condition"]) else None
    past = None
    if any(v.get(k) for k in ["past_history_cardiac", "past_history_diabetes", "past_history_respiratory", "past_history_hypertension"]):
        past = RelevantPastHistory(
            cardiac=v.get("past_history_cardiac"),
            diabetes=v.get("past_history_diabetes"),
            respiratory=v.get("past_history_respiratory"),
            hypertension=v.get("past_history_hypertension"),
        )
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
        remarks=v.get("remarks"),
    )


def extract_response(messages: list) -> dict:
    """Extract structured triage response from agent messages."""
    patient_record = PatientRecord()
    ctas = 3
    ctas_reasoning = ""
    problem_code = None
    missing_fields = []
    validation_warnings = []

    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            try:
                data = json.loads(msg.content)
                if "ctas" in data or "triage_level" in data:
                    ctas = data.get("ctas", data.get("triage_level", 3))
                    ctas_reasoning = data.get("reasoning", "")
                    problem_code = data.get("problem_code")
                elif "missing_required" in data:
                    missing_fields = data.get("missing_required", []) + data.get("missing_preferred", [])
                elif "warnings" in data:
                    validation_warnings = data.get("warnings", [])
                elif "status" in data and data.get("status") == "ok":
                    pass
                elif "error" not in data and ("age" in data or "chief_complaint" in data or "last_name" in data):
                    patient_record = _parse_result_to_patient_record(data)
            except (json.JSONDecodeError, KeyError, TypeError):
                continue

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
