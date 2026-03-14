"use client";

import { useEffect, useState } from "react";
import VoiceInput from "../components/VoiceInput";

// --- Types (aligned with backend schemas.py) ---

interface Vitals {
  pulse_rate?: number;
  spo2?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  resp_rate?: number;
  temp?: number;
}

interface Demographics {
  first_name?: string;
  last_name?: string;
  age?: number;
  sex?: string;
  weight_kg?: number;
  date_of_birth?: string;
}

interface PastHistory {
  cardiac?: boolean;
  respiratory?: boolean;
  diabetes?: boolean;
  hypertension?: boolean;
  seizure?: boolean;
  psychiatric?: boolean;
}

interface PhysicalExam {
  general_appearance?: string;
  skin_colour?: string;
  skin_condition?: string;
}

interface PatientRecord {
  demographics?: Demographics;
  chief_complaint?: string;
  incident_history?: string;
  medications?: string;
  allergies?: string;
  past_history?: PastHistory;
  physical_exam?: PhysicalExam;
  vitals?: Vitals;
  estimated_arrival_minutes?: number;
  ctas?: number;
  remarks?: string;
}

interface TriageResponse {
  patient_record: PatientRecord;
  ctas: number;
  ctas_reasoning: string;
  missing_fields: string[];
  validation_warnings: string[];
}

// --- Mock data (aligned with new backend shape) ---

const MOCK_RESPONSE: TriageResponse = {
  patient_record: {
    demographics: { age: 65, sex: "M" },
    chief_complaint: "chest pain",
    incident_history: "Sudden onset chest pain radiating to left arm, onset 20 minutes ago. Diaphoretic.",
    medications: "ASA, Nitrates",
    allergies: "NKA",
    past_history: { cardiac: true, diabetes: false, hypertension: true },
    physical_exam: { general_appearance: "Diaphoretic, moderate distress", skin_colour: "Pale", skin_condition: "Diaphoretic" },
    vitals: { pulse_rate: 102, spo2: 94, bp_systolic: 158, bp_diastolic: 95, resp_rate: 22, temp: 37.1 },
    estimated_arrival_minutes: 8,
    ctas: 2,
    remarks: "Patient alert, on home ASA and nitrates.",
  },
  ctas: 2,
  ctas_reasoning: "Emergent: chest pain with diaphoresis, abnormal HR and SpO2",
  missing_fields: ["last_name", "first_name", "date_of_birth", "weight_kg"],
  validation_warnings: [
    "Pulse rate 102 above normal range (60–100)",
    "SpO2 94% below normal (95–100)",
    "Systolic BP 158 elevated",
  ],
};

// --- Constants ---

const PAST_HISTORY_KEYS: (keyof PastHistory)[] = [
  "cardiac", "respiratory", "diabetes", "hypertension", "seizure", "psychiatric",
];

const TRIAGE_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: "bg-red-600",    text: "text-white",    label: "Resuscitation" },
  2: { bg: "bg-orange-500", text: "text-white",    label: "Emergent" },
  3: { bg: "bg-yellow-400", text: "text-zinc-900", label: "Urgent" },
  4: { bg: "bg-sky-500",    text: "text-white",    label: "Less Urgent" },
  5: { bg: "bg-green-500",  text: "text-white",    label: "Non-Urgent" },
};

// --- Component ---

export default function TriagePage() {
  const [response, setResponse] = useState<TriageResponse | null>(null);
  const [form, setForm] = useState<PatientRecord>({});

  useEffect(() => {
    if (!response) return;
    setForm(response.patient_record);
  }, [response]);

  const isMissing = (field: string) => response?.missing_fields.includes(field) ?? false;
  const demo = form.demographics ?? {};
  const phys = form.physical_exam ?? {};
  const past = form.past_history ?? {};
  const triageColor = response ? TRIAGE_COLORS[response.ctas] : null;

  const setDemo = (patch: Partial<Demographics>) =>
    setForm(f => ({ ...f, demographics: { ...f.demographics, ...patch } }));
  const setPhys = (patch: Partial<PhysicalExam>) =>
    setForm(f => ({ ...f, physical_exam: { ...f.physical_exam, ...patch } }));
  const setPast = (key: keyof PastHistory, val: boolean) =>
    setForm(f => ({ ...f, past_history: { ...f.past_history, [key]: val } }));

  return (
    <main className="min-h-screen bg-zinc-950 text-white font-mono">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── Left panel ── */}
        <aside className="lg:w-80 lg:sticky lg:top-6 lg:self-start flex flex-col gap-4">

          {/* CTAS badge */}
          {triageColor && (
            <div className={`rounded-lg p-4 ${triageColor.bg}`}>
              <div className={`text-xs uppercase tracking-widest mb-1 ${triageColor.text} opacity-80`}>CTAS Level</div>
              <div className={`text-4xl font-bold ${triageColor.text}`}>{response!.ctas}</div>
              <div className={`text-sm font-semibold ${triageColor.text}`}>{triageColor.label}</div>
              <div className={`text-xs mt-2 ${triageColor.text} opacity-70`}>{response!.ctas_reasoning}</div>
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <VoiceInput onResult={setResponse} />
            <button
              onClick={() => setResponse(MOCK_RESPONSE)}
              className="w-full mt-3 py-2 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Load Mock Data
            </button>
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

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col gap-4">

          {/* Demographics */}
          <Section title="Demographics">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" missing={isMissing("first_name")}>
                <Input value={demo.first_name ?? ""} onChange={v => setDemo({ first_name: v })} />
              </Field>
              <Field label="Last Name" missing={isMissing("last_name")}>
                <Input value={demo.last_name ?? ""} onChange={v => setDemo({ last_name: v })} />
              </Field>
              <Field label="Age" missing={isMissing("age")}>
                <Input value={demo.age?.toString() ?? ""} onChange={v => setDemo({ age: Number(v) || undefined })} />
              </Field>
              <Field label="Sex" missing={isMissing("sex")}>
                <select
                  value={demo.sex ?? ""}
                  onChange={e => setDemo({ sex: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
                >
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Weight (kg)" missing={isMissing("weight_kg")}>
                <Input value={demo.weight_kg?.toString() ?? ""} onChange={v => setDemo({ weight_kg: Number(v) || undefined })} />
              </Field>
              <Field label="Date of Birth" missing={isMissing("date_of_birth")}>
                <Input value={demo.date_of_birth ?? ""} onChange={v => setDemo({ date_of_birth: v })} placeholder="YYYY/MM/DD" />
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
              <Field label="Medications" missing={isMissing("medications")}>
                <Input value={form.medications ?? ""} onChange={v => setForm(f => ({ ...f, medications: v }))} placeholder="ASA, Nitrates, etc." />
              </Field>
              <Field label="Allergies" missing={isMissing("allergies")}>
                <Input value={form.allergies ?? ""} onChange={v => setForm(f => ({ ...f, allergies: v }))} placeholder="NKA / CNO / list" />
              </Field>
            </div>
          </Section>

          {/* Past History */}
          <Section title="Relevant Past History">
            <div className="flex flex-wrap gap-2">
              {PAST_HISTORY_KEYS.map(key => (
                <CheckPill
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  checked={past[key] === true}
                  onChange={val => setPast(key, val)}
                />
              ))}
            </div>
          </Section>

          {/* Physical Exam */}
          <Section title="Physical Exam">
            <div className="grid grid-cols-2 gap-3">
              <Field label="General Appearance" missing={isMissing("general_appearance")} className="col-span-2">
                <Input value={phys.general_appearance ?? ""} onChange={v => setPhys({ general_appearance: v })} />
              </Field>
              <Field label="Skin Colour" missing={isMissing("skin_colour")}>
                <Input value={phys.skin_colour ?? ""} onChange={v => setPhys({ skin_colour: v })} />
              </Field>
              <Field label="Skin Condition" missing={isMissing("skin_condition")}>
                <Input value={phys.skin_condition ?? ""} onChange={v => setPhys({ skin_condition: v })} />
              </Field>
            </div>
          </Section>

          {/* Vitals */}
          <Section title="Vitals">
            <div className="grid grid-cols-3 gap-3">
              <VitalDisplay label="Pulse Rate" value={form.vitals?.pulse_rate} unit="bpm"
                warn={response?.validation_warnings.some(w => w.toLowerCase().includes("pulse"))} />
              <VitalDisplay label="SpO₂" value={form.vitals?.spo2} unit="%"
                warn={response?.validation_warnings.some(w => w.toLowerCase().includes("spo2"))} />
              <VitalDisplay label="Resp Rate" value={form.vitals?.resp_rate} unit="br/min" warn={false} />
              <VitalDisplay label="BP Systolic" value={form.vitals?.bp_systolic} unit="mmHg"
                warn={response?.validation_warnings.some(w => w.toLowerCase().includes("systolic") || w.toLowerCase().includes("bp"))} />
              <VitalDisplay label="BP Diastolic" value={form.vitals?.bp_diastolic} unit="mmHg" warn={false} />
              <VitalDisplay label="Temp" value={form.vitals?.temp} unit="°C" warn={false} />
            </div>
          </Section>

          {/* Administration */}
          <Section title="Administration">
            <div className="grid grid-cols-2 gap-3">
              <Field label="CTAS Level" missing={false}>
                <div className={`px-3 py-2 rounded text-sm font-bold ${triageColor ? `${triageColor.bg} ${triageColor.text}` : "bg-zinc-800 text-zinc-400"}`}>
                  {response ? `${response.ctas} — ${triageColor?.label}` : "—"}
                </div>
              </Field>
              <Field label="ETA (min)" missing={isMissing("estimated_arrival_minutes")}>
                <Input
                  value={form.estimated_arrival_minutes?.toString() ?? ""}
                  onChange={v => setForm(f => ({ ...f, estimated_arrival_minutes: Number(v) || undefined }))}
                />
              </Field>
              <Field label="Remarks" missing={false} className="col-span-2">
                <textarea
                  value={form.remarks ?? ""}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
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
      <h2 className="text-xs text-zinc-400 uppercase tracking-widest mb-4 border-b border-zinc-800 pb-2">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, missing, children, className = "" }: {
  label: string; missing: boolean; children: React.ReactNode; className?: string;
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

function Input({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
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

function CheckPill({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
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

function VitalDisplay({ label, value, unit, warn }: {
  label: string; value?: number; unit: string; warn?: boolean;
}) {
  return (
    <div className={`rounded p-3 border ${warn ? "border-red-700 bg-red-950" : "border-zinc-700 bg-zinc-800"}`}>
      <div className={`text-xs uppercase tracking-widest mb-1 ${warn ? "text-red-400" : "text-zinc-400"}`}>{label}</div>
      <div className={`text-xl font-bold font-mono ${warn ? "text-red-300" : "text-white"}`}>
        {value != null ? `${value}` : <span className="text-zinc-600">—</span>}
        {value != null && <span className={`text-xs ml-1 ${warn ? "text-red-400" : "text-zinc-400"}`}>{unit}</span>}
      </div>
    </div>
  );
}
