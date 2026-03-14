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

from schemas import PatientRecord, Vitals
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

SYSTEM_PROMPT = """You are a paramedic triage assistant. You receive voice transcripts from paramedics en route to the hospital and produce structured patient records for the emergency department.

Your workflow:
1. Use parse_transcript(transcript) to extract structured patient data from the raw voice input.
2. If vitals were extracted, use validate_vitals to check for abnormal values.
3. Use check_missing_fields to identify gaps in the record.
4. Use compute_triage_score to assign an ESI level (1-5).
5. Use update_patient_record to store the final record (include triage_level in the record).

Build the patient record as a JSON object with: age, sex, chief_complaint, symptoms (list), vitals (object with heart_rate, spo2, blood_pressure_systolic, blood_pressure_diastolic, respiratory_rate), estimated_arrival_minutes, triage_level, notes.

Pass tool arguments as JSON strings when required. After completing all steps, summarize the patient record and triage level for the hospital staff."""


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


def extract_response(messages: list) -> dict:
    """Extract structured triage response from agent messages."""
    patient_record = PatientRecord()
    triage_level = 3
    triage_reasoning = ""
    missing_fields = []
    validation_warnings = []

    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            try:
                data = json.loads(msg.content)
                if "triage_level" in data:
                    triage_level = data["triage_level"]
                    triage_reasoning = data.get("reasoning", "")
                elif "missing_required" in data:
                    missing_fields = data.get("missing_required", []) + data.get("missing_preferred", [])
                elif "warnings" in data:
                    validation_warnings = data.get("warnings", [])
                elif "status" in data and data.get("status") == "ok":
                    pass  # update_patient_record success
                elif "error" not in data and ("age" in data or "chief_complaint" in data or "symptoms" in data):
                    # parse_transcript result (flat structure)
                    v = data
                    vitals = None
                    if any(k in v for k in ["heart_rate", "spo2", "blood_pressure_systolic"]):
                        vitals = Vitals(
                            heart_rate=v.get("heart_rate"),
                            spo2=v.get("spo2"),
                            blood_pressure_systolic=v.get("blood_pressure_systolic"),
                            blood_pressure_diastolic=v.get("blood_pressure_diastolic"),
                            respiratory_rate=v.get("respiratory_rate"),
                        )
                    patient_record = PatientRecord(
                        age=v.get("age"),
                        sex=v.get("sex"),
                        chief_complaint=v.get("chief_complaint"),
                        symptoms=v.get("symptoms", []),
                        vitals=vitals,
                        estimated_arrival_minutes=v.get("estimated_arrival_minutes"),
                        notes=v.get("notes"),
                    )
            except (json.JSONDecodeError, KeyError, TypeError):
                continue

    return {
        "patient_record": patient_record,
        "triage_level": triage_level,
        "triage_reasoning": triage_reasoning,
        "missing_fields": missing_fields,
        "validation_warnings": validation_warnings,
    }
