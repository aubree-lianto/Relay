# Paramedic Voice Triage System

A real-time emergency triage system that allows paramedics to relay patient information via voice while en route to the hospital. The system converts spoken input into structured patient data and streams live vitals to a hospital dashboard.

## Overview

During emergency transport, paramedics often need to communicate critical patient information quickly. This project enables hands-free triage reporting using voice input and real-time data streaming.

The system captures voice input from a paramedic, converts it into structured medical information using an LLM, and updates a live hospital dashboard.

## Architecture
```
Paramedic Voice
      │
      ▼
Amazon Alexa Skill
      │
      ▼
LLM Triage Parser (OpenAI / OpenRouter)
      │
      ├──► Structured Patient Record
      │
      ▼
FastAPI Backend ◄──── WebSocket Vitals Stream (simulated / Apple Watch)
      │
      ▼
Next.js Hospital Dashboard
```

## Features

### Voice-Based Patient Intake
Paramedics provide information verbally using an Amazon Alexa skill.

Example input:

> "Male patient, approximately 60 years old. Complaining of chest pain and shortness of breath."

The system converts the voice transcript into structured fields such as:

- Age
- Sex
- Symptoms
- Vital indicators
- Estimated arrival time

### AI-Powered Triage Parsing

Voice transcripts are processed using an LLM via:

- OpenAI API
- OpenRouter

The model extracts structured medical information and populates a patient intake form automatically.

### Real-Time Dashboard

A **Next.js** frontend displays incoming patient data for hospital staff. Updates are delivered through **FastAPI endpoints**, allowing the dashboard to refresh dynamically as new information arrives.

### Real-Time Vital Streaming (Simulated)

To simulate ambulance telemetry, the backend receives vitals streamed over **WebSockets**.

Example vitals stream:

- Heart rate
- Blood oxygen (SpO₂)
- Blood pressure
- Respiratory rate

For the hackathon demo, these vitals can be **synthetically generated** and streamed to the backend to mimic real medical equipment.

## Optional Feature: Wearable Vital Integration

If time permits, the system can integrate real wearable data.

An **Apple Watch** can be used to stream live vitals such as:

- Blood oxygen levels
- Heart rate

Using **HealthKit**, an iPhone app can read Apple Watch sensor data and forward it to the backend for real-time display on the hospital dashboard.

## Tech Stack

Frontend
- Next.js

Backend
- FastAPI
- WebSockets

Voice Interface
- Amazon Alexa
- ElevenLabs
- Voice Monkey

AI Processing
- OpenAI API
- OpenRouter

Wearable Integration (optional)
- Apple Watch
- HealthKit

## Semantic Memory (Moorcheh)

The triage agent uses [Moorcheh](https://moorcheh.ai/) for agentic semantic memory:

- **Store**: Each completed triage case (transcript, chief complaint, CTAS, vitals) is stored in Moorcheh
- **Retrieve**: Before processing a new transcript, similar past cases are retrieved to inform triage decisions
- **Graceful fallback**: Works without `MOORCHEH_API_KEY`; memory features are skipped when unset

Set `MOORCHEH_API_KEY` in `.env` to enable. Free tier at [console.moorcheh.ai](https://console.moorcheh.ai/).

## Persistent Storage

Patient records are stored in SQLite (`backend/triage.db`) and persist across restarts.

## Future Improvements

- Direct integration with ambulance medical monitors
- Automated triage risk scoring
- GPS tracking and ambulance ETA
- Electronic Health Record (EHR) integration
- ECG waveform streaming

## Demo Flow

1. Paramedic speaks patient information into Alexa.
2. Audio is transcribed and processed by an LLM.
3. Structured patient information is generated.
4. Backend updates the hospital dashboard.
5. Simulated or real vitals stream to the frontend in real time.

## Goal

Reduce communication friction between ambulances and emergency departments by enabling real-time, structured patient data delivery before hospital arrival.