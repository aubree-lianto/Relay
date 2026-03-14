"""
Pydantic schemas aligned with the Ontario Ambulance Call Report (ACR).

Reference: https://www.lhsc.on.ca/media/2946/download
Ministry of Health and Long-Term Care - Form 1881-45 (2017/01)
"""

from typing import Optional

from pydantic import BaseModel, Field


# --- Vitals (Clinical Treatment/Procedures table) ---


class Vitals(BaseModel):
    """
    Vital signs - Ontario ACR Clinical Treatment/Procedures columns.
    Pulse Rate, Resp. Rate, B/P Sys/Dia, Temp, SpO2, EtCO2
    """

    pulse_rate: Optional[int] = Field(
        None,
        description="Pulse rate (bpm). Normal adult 60-100.",
    )
    resp_rate: Optional[int] = Field(
        None,
        description="Respiratory rate per minute. Normal adult 12-20.",
    )
    bp_systolic: Optional[int] = Field(
        None,
        description="Blood pressure systolic (mmHg).",
    )
    bp_diastolic: Optional[int] = Field(
        None,
        description="Blood pressure diastolic (mmHg).",
    )
    temp: Optional[float] = Field(
        None,
        description="Temperature (°C).",
    )
    spo2: Optional[float] = Field(
        None,
        description="SpO2 (%). Normal 95-100.",
    )
    etco2: Optional[float] = Field(
        None,
        description="EtCO2 (mmHg) if available.",
    )


# --- CTAS (Canadian Triage and Acuity Scale) ---
# 1 Resuscitation, 2 Emergent, 3 Urgent, 4 Less Urgent, 5 Non Urgent, 0 Obviously Dead/TOR


# --- Ontario Problem Codes (abbreviated - full list in ACR) ---
# Cardiac: 51 Ischemic, 53 Palpitations, 54 Pulmonary Edema, 57 STEMI
# Non-Traumatic: 60 Non Ischemic Chest Pain, 61 Abdominal Pain
# Breathing: 21 Dyspnea, 24 Respiratory Arrest
# Neurological: 41 Stroke/TIA, 46 Active Seizure
# Endocrine: 83 Diabetic Emergency, 85 Anaphylaxis


# --- Demographics (Ontario ACR Demographics section) ---


class Demographics(BaseModel):
    """ACR Demographics: Last Name, First Name, Age, Sex, Weight, DOB."""

    last_name: Optional[str] = None
    first_name: Optional[str] = None
    age: Optional[int] = Field(None, description="Age in years")
    sex: Optional[str] = Field(None, description="M/F/Other")
    weight_kg: Optional[float] = Field(None, description="Weight in kg")
    date_of_birth: Optional[str] = Field(None, description="YYYY/MM/DD")


# --- Clinical Information ---


class TraumaInfo(BaseModel):
    """ACR Trauma Problem Site/Type: Location, Type, Mechanism (up to 3)."""

    location: Optional[str] = None  # e.g. "15" Chest, "16" Abdomen
    type_code: Optional[str] = None  # e.g. "34" Blunt
    mechanism: Optional[str] = None  # e.g. "53" Fall Same Level


class RelevantPastHistory(BaseModel):
    """ACR Relevant Past History checkboxes."""

    previously_healthy: Optional[bool] = None
    cardiac: Optional[bool] = None
    respiratory: Optional[bool] = None
    hypertension: Optional[bool] = None
    diabetes: Optional[bool] = None
    stroke_tia: Optional[bool] = None
    seizure: Optional[bool] = None
    psychiatric: Optional[bool] = None
    cancer: Optional[bool] = None
    anaphylaxis: Optional[bool] = None
    other_details: Optional[str] = None


class PhysicalExam(BaseModel):
    """ACR Physical Exam - General Appearance, Skin Colour, Skin Condition."""

    general_appearance: Optional[str] = None
    skin_colour: Optional[str] = Field(
        None,
        description="Flushed, Pale, Cyanosis, Jaundice, Unremarkable",
    )
    skin_condition: Optional[str] = Field(
        None,
        description="Dry, Clammy, Diaphoretic, Unremarkable",
    )


# --- Main Patient Record (Ontario ACR) ---


class PatientRecord(BaseModel):
    """
    Patient record aligned with Ontario Ambulance Call Report (ACR).

    Fields are ordered to match the form sections where possible.
    Voice intake captures what paramedics can report en route.
    """

    # Demographics
    demographics: Optional[Demographics] = None

    # Clinical Information
    date_of_occurrence: Optional[str] = Field(None, description="YYYY/MM/DD")
    time_of_occurrence: Optional[str] = Field(None, description="HH:MM")
    chief_complaint: Optional[str] = Field(None, description="ACR Chief Complaint")
    incident_history: Optional[str] = Field(None, description="ACR Incident History")
    trauma: Optional[TraumaInfo] = None

    # Relevant Past History
    past_history: Optional[RelevantPastHistory] = None

    # Medications (ACR: Nitrates, Insulin, ASA, etc.)
    medications: Optional[str] = None

    # Allergies: NKA, CNO, or list
    allergies: Optional[str] = Field(None, description="NKA, CNO, or specific allergies")

    # Treatment Prior to Arrival
    treatment_prior_to_arrival: Optional[str] = Field(
        None,
        description="None, Bystander, Physician, Fire, etc.",
    )

    # Physical Exam
    physical_exam: Optional[PhysicalExam] = None

    # Vitals (Clinical Treatment table)
    vitals: Optional[Vitals] = None

    # Triage
    ctas: Optional[int] = Field(
        None,
        description="CTAS 1-5 (0=Obviously Dead). 1 Resuscitation, 2 Emergent, 3 Urgent, 4 Less Urgent, 5 Non Urgent",
    )
    problem_code: Optional[str] = Field(
        None,
        description="Ontario ACR Problem Code (e.g. 51 Ischemic, 60 Non Ischemic Chest Pain, 21 Dyspnea)",
    )

    # Transport
    estimated_arrival_minutes: Optional[int] = Field(None, description="ETA to hospital (minutes)")
    pick_up_code: Optional[str] = Field(
        None,
        description="ACR Pick-up Code A-Z (R=House, S=Street, H=Hospital, etc.)",
    )

    # General
    remarks: Optional[str] = Field(None, description="ACR Remarks")


# --- Backward compatibility: flat accessors for existing code ---
# PatientRecord can also be used with simplified flat fields for voice parsing


class TranscriptParseResult(BaseModel):
    """
    Result of parsing a voice transcript.
    Maps to Ontario ACR fields - flat structure for LLM extraction.
    """

    # Demographics
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    weight_kg: Optional[float] = None

    # Clinical
    date_of_occurrence: Optional[str] = None
    time_of_occurrence: Optional[str] = None
    chief_complaint: Optional[str] = None
    incident_history: Optional[str] = None
    symptoms: list[str] = Field(default_factory=list, description="List of symptoms if multiple")

    # Past history (keywords)
    past_history_cardiac: Optional[bool] = None
    past_history_diabetes: Optional[bool] = None
    past_history_respiratory: Optional[bool] = None
    past_history_hypertension: Optional[bool] = None

    # Medications, Allergies
    medications: Optional[str] = None
    allergies: Optional[str] = None

    # Treatment prior
    treatment_prior_to_arrival: Optional[str] = None

    # Physical
    general_appearance: Optional[str] = None
    skin_colour: Optional[str] = None
    skin_condition: Optional[str] = None

    # Vitals (Ontario naming)
    pulse_rate: Optional[int] = None
    resp_rate: Optional[int] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    temp: Optional[float] = None
    spo2: Optional[float] = None

    # Transport
    estimated_arrival_minutes: Optional[int] = None
    pick_up_code: Optional[str] = None

    remarks: Optional[str] = None


class TriageProcessRequest(BaseModel):
    """Request body for the triage process endpoint."""

    transcript: str = Field(..., description="Voice transcript of paramedic report")


class TriageProcessResponse(BaseModel):
    """Response from the triage process endpoint."""

    patient_record: PatientRecord
    ctas: int = Field(..., description="CTAS level 1-5 (0=Obviously Dead)")
    ctas_reasoning: str = Field(..., description="Why this CTAS level was assigned")
    problem_code: Optional[str] = Field(None, description="Ontario ACR Problem Code")
    missing_fields: list[str] = Field(default_factory=list)
    validation_warnings: list[str] = Field(default_factory=list)
