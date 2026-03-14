"use client";

import { useEffect, useRef, useState } from "react";

// --- Types ---

interface Vitals {
  heart_rate?: number;
  spo2?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  respiratory_rate?: number;
}

interface PatientRecord {
  first_name?: string;
  last_name?: string;
  age?: number;
  sex?: string;
  weight_kg?: number;
  date_of_birth?: string;
  chief_complaint?: string;
  incident_history?: string;
  allergies?: string;
  medications?: string[];
  relevant_past_history?: string[];
  general_appearance?: string;
  skin_colour?: string;
  skin_condition?: string;
  gcs?: number;
  pain_scale?: number;
  vitals?: Vitals;
  estimated_arrival_minutes?: number;
  triage_level?: number;
  notes?: string;
  receiving_facility?: string;
}

interface TriageResponse {
  patient_record: PatientRecord;
  triage_level: number;
  triage_reasoning: string;
  missing_fields: string[];
  validation_warnings: string[];
}

// --- Mock data (used when backend is unreachable) ---

const MOCK_RESPONSE: TriageResponse = {
  patient_record: {
    age: 65,
    sex: "male",
    chief_complaint: "chest pain",
    incident_history: "Patient reports sudden onset chest pain radiating to left arm, onset 20 minutes ago.",
    symptoms: ["shortness of breath", "diaphoresis"],
    vitals: {
      heart_rate: 102,
      spo2: 94,
      blood_pressure_systolic: 158,
      blood_pressure_diastolic: 95,
      respiratory_rate: 22,
    },
    estimated_arrival_minutes: 8,
    triage_level: 2,
    notes: "Patient on ASA and nitrates. History of cardiac disease.",
    medications: ["ASA", "Nitrates"],
    relevant_past_history: ["Cardiac"],
    general_appearance: "Diaphoretic, moderate distress",
    pain_scale: 7,
  } as PatientRecord,
  triage_level: 2,
  triage_reasoning: "Emergent: chest pain with diaphoresis, abnormal HR and SpO2",
  missing_fields: ["last_name", "first_name", "date_of_birth", "weight_kg", "allergies"],
  validation_warnings: [
    "Heart rate 102 above normal range (50–120)",
    "SpO2 94% below normal (95–100)",
    "Systolic BP 158 elevated",
  ],
};

// --- Constants ---

const MEDICATIONS = ["Nitrates", "ASA", "Salbutamol", "Furosemide", "Insulin", "Other"];
const PAST_HISTORY = ["Cardiac", "Respiratory", "Seizure", "Diabetes", "Hypertension", "Other"];

const TRIAGE_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-red-600",    text: "text-white",      label: "Resuscitation" },
  2: { bg: "bg-orange-500", text: "text-white",      label: "Emergent" },
  3: { bg: "bg-yellow-400", text: "text-zinc-900",   label: "Urgent" },
  4: { bg: "bg-sky-500",    text: "text-white",      label: "Less Urgent" },
  5: { bg: "bg-green-500",  text: "text-white",      label: "Non-Urgent" },
};

// --- Component ---

export default function TriagePage() {
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TriageResponse | null>(null);
  const [form, setForm] = useState<PatientRecord>({});
  const [usingMock, setUsingMock] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Populate form when response arrives
  useEffect(() => {
    if (!response) return;
    setForm(response.patient_record);
  }, [response]);

  const isMissing = (field: string) => response?.missing_fields.includes(field) ?? false;

  function startRecording() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Try Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setTranscript(text);
      submitTranscript(text);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognition.start();
    setRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  async function submitTranscript(text: string) {
    setLoading(true);
    setUsingMock(false);
    try {
      const res = await fetch("http://localhost:8000/triage/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error("Backend error");
      const data: TriageResponse = await res.json();
      setResponse(data);
    } catch {
      setResponse(MOCK_RESPONSE);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }

  function loadMock() {
    setTranscript("Male patient, 65 years old, chest pain and shortness of breath, on ASA and nitrates, cardiac history, arriving in 8 minutes.");
    setResponse(MOCK_RESPONSE);
    setUsingMock(true);
  }

  const triageColor = response ? TRIAGE_COLORS[response.triage_level] : null;

  return (
    <main className="min-h-screen bg-zinc-950 text-white font-mono">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── Left panel ── */}
        <aside className="lg:w-80 lg:sticky lg:top-6 lg:self-start flex flex-col gap-4">

          {/* Triage badge */}
          {triageColor && (
            <div className={`rounded-lg p-4 ${triageColor.bg}`}>
              <div className={`text-xs uppercase tracking-widest mb-1 ${triageColor.text} opacity-80`}>
                CTAS Level
              </div>
              <div className={`text-4xl font-bold ${triageColor.text}`}>
                {response!.triage_level}
              </div>
              <div className={`text-sm font-semibold ${triageColor.text}`}>
                {triageColor.label}
              </div>
              <div className={`text-xs mt-2 ${triageColor.text} opacity-70`}>
                {response!.triage_reasoning}
              </div>
            </div>
          )}

          {/* ETA */}
          {form.estimated_arrival_minutes != null && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
              <div className="text-xs text-zinc-400 uppercase tracking-widest mb-1">ETA</div>
              <div className="text-3xl font-bold text-white">
                {form.estimated_arrival_minutes} <span className="text-base text-zinc-400">min</span>
              </div>
            </div>
          )}

          {/* Voice input */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
            <div className="text-xs text-zinc-400 uppercase tracking-widest">Voice Input</div>
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={loading}
              className={`w-full py-3 rounded-lg font-bold text-sm uppercase tracking-widest transition-all ${
                recording
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-600"
              }`}
            >
              {recording ? "● Recording..." : loading ? "Processing..." : "● Record"}
            </button>
            <button
              onClick={loadMock}
              className="w-full py-2 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Load Mock Data
            </button>
            {transcript && (
              <div className="text-xs text-zinc-300 bg-zinc-800 rounded p-3 leading-relaxed">
                {transcript}
              </div>
            )}
            {usingMock && (
              <div className="text-xs text-amber-400 text-center">Using mock data — backend offline</div>
            )}
          </div>

          {/* Warnings */}
          {response && response.validation_warnings.length > 0 && (
            <div className="bg-zinc-900 border border-red-900 rounded-lg p-4">
              <div className="text-xs text-red-400 uppercase tracking-widest mb-2">Warnings</div>
              <ul className="space-y-1">
                {response.validation_warnings.map((w, i) => (
                  <li key={i} className="text-xs text-red-300 flex gap-2">
                    <span className="text-red-500">▲</span>{w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* ── Right panel: form ── */}
        <div className="flex-1 flex flex-col gap-4">

          {/* Demographics */}
          <Section title="Demographics">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" missing={isMissing("first_name")}>
                <Input value={form.first_name ?? ""} onChange={v => setForm(f => ({ ...f, first_name: v }))} />
              </Field>
              <Field label="Last Name" missing={isMissing("last_name")}>
                <Input value={form.last_name ?? ""} onChange={v => setForm(f => ({ ...f, last_name: v }))} />
              </Field>
              <Field label="Age" missing={isMissing("age")}>
                <Input value={form.age?.toString() ?? ""} onChange={v => setForm(f => ({ ...f, age: Number(v) || undefined }))} />
              </Field>
              <Field label="Sex" missing={isMissing("sex")}>
                <select
                  value={form.sex ?? ""}
                  onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="unknown">Unknown</option>
                </select>
              </Field>
              <Field label="Weight (kg)" missing={isMissing("weight_kg")}>
                <Input value={form.weight_kg?.toString() ?? ""} onChange={v => setForm(f => ({ ...f, weight_kg: Number(v) || undefined }))} />
              </Field>
              <Field label="Date of Birth" missing={isMissing("date_of_birth")}>
                <Input value={form.date_of_birth ?? ""} onChange={v => setForm(f => ({ ...f, date_of_birth: v }))} placeholder="YYYY-MM-DD" />
              </Field>
            </div>
          </Section>

          {/* Clinical */}
          <Section title="Clinical Information">
            <div className="flex flex-col gap-3">
              <Field label="Chief Complaint" missing={isMissing("chief_complaint")}>
                <Input value={form.chief_complaint ?? ""} onChange={v => setForm(f => ({ ...f, chief_complaint: v }))} />
              </Field>
              <Field label="Incident History" missing={isMissing("incident_history")}>
                <textarea
                  value={form.incident_history ?? ""}
                  onChange={e => setForm(f => ({ ...f, incident_history: e.target.value }))}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none resize-none"
                />
              </Field>
              <Field label="Allergies" missing={isMissing("allergies")}>
                <Input value={form.allergies ?? ""} onChange={v => setForm(f => ({ ...f, allergies: v }))} placeholder="NKA / list allergies" />
              </Field>
            </div>
          </Section>

          {/* Medications */}
          <Section title="Medications">
            <div className="flex flex-wrap gap-2">
              {MEDICATIONS.map(med => (
                <CheckPill
                  key={med}
                  label={med}
                  checked={(form.medications ?? []).includes(med)}
                  onChange={checked =>
                    setForm(f => ({
                      ...f,
                      medications: checked
                        ? [...(f.medications ?? []), med]
                        : (f.medications ?? []).filter(m => m !== med),
                    }))
                  }
                />
              ))}
            </div>
          </Section>

          {/* Past History */}
          <Section title="Relevant Past History">
            <div className="flex flex-wrap gap-2">
              {PAST_HISTORY.map(h => (
                <CheckPill
                  key={h}
                  label={h}
                  checked={(form.relevant_past_history ?? []).includes(h)}
                  onChange={checked =>
                    setForm(f => ({
                      ...f,
                      relevant_past_history: checked
                        ? [...(f.relevant_past_history ?? []), h]
                        : (f.relevant_past_history ?? []).filter(x => x !== h),
                    }))
                  }
                />
              ))}
            </div>
          </Section>

          {/* Physical Exam */}
          <Section title="Physical Exam">
            <div className="grid grid-cols-2 gap-3">
              <Field label="General Appearance" missing={isMissing("general_appearance")} className="col-span-2">
                <Input value={form.general_appearance ?? ""} onChange={v => setForm(f => ({ ...f, general_appearance: v }))} />
              </Field>
              <Field label="Skin Colour" missing={isMissing("skin_colour")}>
                <Input value={form.skin_colour ?? ""} onChange={v => setForm(f => ({ ...f, skin_colour: v }))} />
              </Field>
              <Field label="Skin Condition" missing={isMissing("skin_condition")}>
                <Input value={form.skin_condition ?? ""} onChange={v => setForm(f => ({ ...f, skin_condition: v }))} />
              </Field>
              <Field label="GCS (1–15)" missing={isMissing("gcs")}>
                <Input value={form.gcs?.toString() ?? ""} onChange={v => setForm(f => ({ ...f, gcs: Number(v) || undefined }))} />
              </Field>
              <Field label="Pain Scale (0–10)" missing={isMissing("pain_scale")}>
                <Input value={form.pain_scale?.toString() ?? ""} onChange={v => setForm(f => ({ ...f, pain_scale: Number(v) || undefined }))} />
              </Field>
            </div>
          </Section>

          {/* Vitals */}
          <Section title="Vitals">
            <div className="grid grid-cols-3 gap-3">
              <VitalDisplay label="Heart Rate" value={form.vitals?.heart_rate} unit="bpm" warn={response?.validation_warnings.some(w => w.toLowerCase().includes("heart rate"))} />
              <VitalDisplay label="SpO₂" value={form.vitals?.spo2} unit="%" warn={response?.validation_warnings.some(w => w.toLowerCase().includes("spo2"))} />
              <VitalDisplay label="Resp Rate" value={form.vitals?.respiratory_rate} unit="br/min" warn={false} />
              <VitalDisplay label="BP Systolic" value={form.vitals?.blood_pressure_systolic} unit="mmHg" warn={response?.validation_warnings.some(w => w.toLowerCase().includes("systolic") || w.toLowerCase().includes("bp"))} />
              <VitalDisplay label="BP Diastolic" value={form.vitals?.blood_pressure_diastolic} unit="mmHg" warn={false} />
            </div>
          </Section>

          {/* Administration */}
          <Section title="Administration">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Receiving Facility" missing={isMissing("receiving_facility")}>
                <Input value={form.receiving_facility ?? ""} onChange={v => setForm(f => ({ ...f, receiving_facility: v }))} />
              </Field>
              <Field label="CTAS Level" missing={false}>
                <div className={`px-3 py-2 rounded text-sm font-bold ${triageColor ? `${triageColor.bg} ${triageColor.text}` : "bg-zinc-800 text-zinc-400"}`}>
                  {response ? `${response.triage_level} — ${triageColor?.label}` : "—"}
                </div>
              </Field>
              <Field label="Remarks" missing={false} className="col-span-2">
                <textarea
                  value={form.notes ?? ""}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none resize-none"
                />
              </Field>
            </div>
          </Section>

        </div>
      </div>
    </main>
  );
}

// ── Sub-components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <h2 className="text-xs text-zinc-400 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  missing,
  children,
  className = "",
}: {
  label: string;
  missing: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={`block text-xs uppercase tracking-widest mb-1 ${missing ? "text-amber-400" : "text-zinc-400"}`}>
        {label}{missing && " *"}
      </label>
      <div className={missing ? "[&>*]:border-amber-500" : ""}>{children}</div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none placeholder-zinc-600"
    />
  );
}

function CheckPill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wide border transition-colors ${
        checked
          ? "bg-white text-zinc-900 border-white"
          : "bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-400 hover:text-zinc-200"
      }`}
    >
      {checked && "✓ "}{label}
    </button>
  );
}

function VitalDisplay({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value?: number;
  unit: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded p-3 border ${warn ? "border-red-700 bg-red-950" : "border-zinc-700 bg-zinc-800"}`}>
      <div className={`text-xs uppercase tracking-widest mb-1 ${warn ? "text-red-400" : "text-zinc-400"}`}>
        {label}
      </div>
      <div className={`text-xl font-bold font-mono ${warn ? "text-red-300" : "text-white"}`}>
        {value != null ? `${value}` : <span className="text-zinc-600">—</span>}
        {value != null && <span className={`text-xs ml-1 ${warn ? "text-red-400" : "text-zinc-400"}`}>{unit}</span>}
      </div>
    </div>
  );
}
