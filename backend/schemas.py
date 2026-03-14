"""Pydantic schemas for the paramedic triage system."""

from typing import Optional

from pydantic import BaseModel, Field


class Vitals(BaseModel):
    """Patient vital signs."""

    heart_rate: Optional[int] = Field(None, description="Heart rate in beats per minute (60-120 normal)")
    spo2: Optional[float] = Field(None, description="Blood oxygen saturation % (95-100 normal)")
    blood_pressure_systolic: Optional[int] = Field(None, description="Systolic BP in mmHg (90-140 normal)")
    blood_pressure_diastolic: Optional[int] = Field(None, description="Diastolic BP in mmHg (60-90 normal)")
    respiratory_rate: Optional[int] = Field(None, description="Breaths per minute (12-20 normal)")


class PatientRecord(BaseModel):
    """Structured patient record for triage."""

    age: Optional[int] = Field(None, description="Patient age in years")
    sex: Optional[str] = Field(None, description="Patient sex (male/female/unknown)")
    chief_complaint: Optional[str] = Field(None, description="Primary reason for emergency care")
    symptoms: Optional[list[str]] = Field(default_factory=list, description="List of reported symptoms")
    vitals: Optional[Vitals] = Field(None, description="Current vital signs if reported")
    estimated_arrival_minutes: Optional[int] = Field(None, description="ETA to hospital in minutes")
    triage_level: Optional[int] = Field(None, description="ESI triage level 1-5 (1=most urgent)")
    notes: Optional[str] = Field(None, description="Additional clinical notes")


class TranscriptParseResult(BaseModel):
    """Result of parsing a voice transcript into structured patient data."""

    age: Optional[int] = None
    sex: Optional[str] = None
    chief_complaint: Optional[str] = None
    symptoms: list[str] = Field(default_factory=list)
    heart_rate: Optional[int] = None
    spo2: Optional[float] = None
    blood_pressure_systolic: Optional[int] = None
    blood_pressure_diastolic: Optional[int] = None
    respiratory_rate: Optional[int] = None
    estimated_arrival_minutes: Optional[int] = None
    notes: Optional[str] = None


class TriageProcessRequest(BaseModel):
    """Request body for the triage process endpoint."""

    transcript: str = Field(..., description="Voice transcript of paramedic report")


class TriageProcessResponse(BaseModel):
    """Response from the triage process endpoint."""

    patient_record: PatientRecord
    triage_level: int
    triage_reasoning: str
    missing_fields: list[str]
    validation_warnings: list[str]
