"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
declare const SpeechRecognition: { new (): SpeechRecognition };
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

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
  chief_complaint?: string;
  incident_history?: string;
  symptoms?: string[];
  allergies?: string;
  medications?: string[];
  relevant_past_history?: string[];
  vitals?: Vitals;
  estimated_arrival_minutes?: number;
  triage_level?: number;
  notes?: string;
  gcs?: number;
  pain_scale?: number;
}

interface TriageResponse {
  patient_record: PatientRecord;
  triage_level: number;
  triage_reasoning: string;
  missing_fields: string[];
  validation_warnings: string[];
}

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_RESPONSE: TriageResponse = {
  patient_record: {
    age: 65,
    sex: "Male",
    chief_complaint: "Chest pain",
    incident_history:
      "Patient reports sudden onset chest pain radiating to left arm, onset 20 minutes ago while resting at home.",
    symptoms: ["Shortness of breath", "Diaphoresis", "Nausea"],
    vitals: {
      heart_rate: 130,
      spo2: 91,
      blood_pressure_systolic: 180,
      blood_pressure_diastolic: 110,
      respiratory_rate: 24,
    },
    estimated_arrival_minutes: 8,
    triage_level: 2,
    notes: "Patient on ASA and nitrates. History of cardiac disease.",
    medications: ["ASA", "Nitrates"],
    relevant_past_history: ["Cardiac", "Hypertension"],
    allergies: "Penicillin",
    pain_scale: 8,
    gcs: 15,
  },
  triage_level: 2,
  triage_reasoning:
    "Emergent: chest pain radiating to left arm with diaphoresis, critically high HR (130), low SpO2 (91%), severely elevated BP (180/110).",
  missing_fields: ["first_name", "last_name", "weight_kg"],
  validation_warnings: [
    "Heart rate 130 bpm — critically elevated",
    "SpO2 91% — below safe threshold",
    "Blood pressure 180/110 — hypertensive crisis",
  ],
};

// ── Triage level config ──────────────────────────────────────────────────────

const TRIAGE_LEVELS: Record<
  number,
  { bg: string; border: string; text: string; label: string; glow: string }
> = {
  1: {
    bg: "bg-red-600",
    border: "border-red-500",
    text: "text-white",
    label: "RESUSCITATION",
    glow: "shadow-[0_0_40px_rgba(220,38,38,0.4)]",
  },
  2: {
    bg: "bg-orange-500",
    border: "border-orange-400",
    text: "text-white",
    label: "EMERGENT",
    glow: "shadow-[0_0_40px_rgba(234,88,12,0.4)]",
  },
  3: {
    bg: "bg-yellow-400",
    border: "border-yellow-300",
    text: "text-yellow-950",
    label: "URGENT",
    glow: "shadow-[0_0_40px_rgba(234,179,8,0.3)]",
  },
  4: {
    bg: "bg-sky-500",
    border: "border-sky-400",
    text: "text-white",
    label: "LESS URGENT",
    glow: "shadow-[0_0_40px_rgba(14,165,233,0.3)]",
  },
  5: {
    bg: "bg-emerald-500",
    border: "border-emerald-400",
    text: "text-white",
    label: "NON-URGENT",
    glow: "shadow-[0_0_40px_rgba(16,185,129,0.3)]",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function TriagePage() {
  const [status, setStatus] = useState<
    "idle" | "listening" | "processing" | "done"
  >("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PatientRecord>({});

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const committedRef = useRef("");
  const latestTextRef = useRef("");

  useEffect(() => {
    if (result) setForm(result.patient_record);
  }, [result]);

  // ── Speech recognition ───────────────────────────────────────────────────

  const buildRecognition = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          committedRef.current += chunk + " ";
        } else {
          interim += chunk;
        }
      }
      const fullText = committedRef.current + interim;
      latestTextRef.current = fullText;
      setLiveTranscript(fullText);
    };
    rec.onerror = () => {};
    rec.onend = () => {};
    return rec;
  }, []);

  const startListening = useCallback(() => {
    committedRef.current = "";
    latestTextRef.current = "";
    setLiveTranscript("");
    setResult(null);
    setEditing(false);
    setStatus("listening");
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [buildRecognition]);

  const stopAndSubmit = useCallback(async () => {
    setIsListening(false);
    recognitionRef.current?.stop();
    const text = latestTextRef.current.trim() || committedRef.current.trim();
    if (!text) {
      setStatus("idle");
      return;
    }
    setStatus("processing");
    try {
      const res = await fetch("http://localhost:8000/triage/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TriageResponse = await res.json();
      setResult(data);
      setStatus("done");
    } catch {
      setResult(MOCK_RESPONSE);
      setStatus("done");
    }
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const triage = result ? TRIAGE_LEVELS[result.triage_level] : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="h-[calc(100vh-49px)] bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT PANEL ── */}
        <aside className="w-80 border-r border-slate-800/60 bg-slate-900/40 flex flex-col p-4 gap-3 overflow-y-auto">

          {/* Triage badge */}
          {triage && result ? (
            <div className={`rounded-2xl p-4 ${triage.bg} ${triage.glow} transition-all`}>
              <div className={`text-xs font-medium uppercase tracking-[0.2em] opacity-80 ${triage.text}`}>
                ESI Level
              </div>
              <div className="flex items-baseline gap-3">
                <div className={`text-5xl font-black leading-none mt-1 ${triage.text}`}>
                  {result.triage_level}
                </div>
                <div className={`text-sm font-semibold tracking-wider ${triage.text}`}>
                  {triage.label}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-4 border border-slate-800 bg-slate-900/60">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-600">
                ESI Level
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-5xl font-black leading-none mt-1 text-slate-800">—</div>
                <div className="text-sm font-medium text-slate-700 tracking-wider">AWAITING DATA</div>
              </div>
            </div>
          )}

          {/* ETA */}
          <div className="rounded-2xl p-4 border border-slate-800 bg-slate-900/60">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 mb-1">
              ETA
            </div>
            {form.estimated_arrival_minutes != null ? (
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white font-mono tabular-nums">
                  {form.estimated_arrival_minutes}
                </span>
                <span className="text-sm font-medium text-slate-500">min</span>
              </div>
            ) : (
              <div className="text-3xl font-black text-slate-800">—</div>
            )}
          </div>

          {/* Vitals strip — grows to fill remaining space */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex-1">
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 mb-2">
              Vitals
            </div>
            <div className="space-y-1.5">
              <VitalRow
                label="HR"
                value={form.vitals?.heart_rate}
                unit="bpm"
                warn={result?.validation_warnings.some((w) =>
                  w.toLowerCase().includes("heart"),
                )}
              />
              <VitalRow
                label="SpO2"
                value={form.vitals?.spo2}
                unit="%"
                warn={result?.validation_warnings.some((w) =>
                  w.toLowerCase().includes("spo2"),
                )}
              />
              <VitalRow
                label="BP"
                value={
                  form.vitals?.blood_pressure_systolic != null
                    ? `${form.vitals.blood_pressure_systolic}/${form.vitals.blood_pressure_diastolic}`
                    : undefined
                }
                unit="mmHg"
                warn={result?.validation_warnings.some(
                  (w) =>
                    w.toLowerCase().includes("blood pressure") ||
                    w.toLowerCase().includes("bp"),
                )}
              />
              <VitalRow
                label="RR"
                value={form.vitals?.respiratory_rate}
                unit="/min"
                warn={false}
              />
              <VitalRow
                label="GCS"
                value={form.gcs}
                unit="/15"
                warn={false}
              />
            </div>
          </div>

          {/* Warnings */}
          {result && result.validation_warnings.length > 0 && (
            <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400 mb-2">
                Warnings
              </div>
              <div className="space-y-1.5">
                {result.validation_warnings.map((w, i) => (
                  <div key={i} className="flex gap-2 text-sm text-red-300/90 leading-snug">
                    <span className="text-red-500 shrink-0 mt-0.5">&#9679;</span>
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing fields */}
          {result && result.missing_fields.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400 mb-2">
                Missing Information
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.missing_fields.map((f) => (
                  <span
                    key={f}
                    className="text-sm font-medium px-2.5 py-1 rounded-lg border border-amber-600/30 text-amber-300 bg-amber-900/20"
                  >
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN AREA ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Voice input area */}
          <div
            className={`border-b border-slate-800/60 transition-all ${
              !result ? "flex-1 flex items-center justify-center p-8" : "p-4"
            }`}
          >
            <div className={`rounded-2xl border border-slate-800 bg-slate-900/40 flex items-center gap-5 w-full ${
              status === "idle" && !result ? "flex-col py-10 px-16 w-auto" : "px-6 py-4"
            }`}>
              {/* Status badge */}
              <span
                className={`text-xs font-semibold tracking-[0.15em] uppercase px-3 py-1 rounded-full border transition-colors ${
                  status === "listening"
                    ? "border-red-500/60 text-red-400 bg-red-950/30 animate-pulse"
                    : status === "processing"
                      ? "border-amber-500/60 text-amber-400 bg-amber-950/30 animate-pulse"
                      : status === "done"
                        ? "border-emerald-500/60 text-emerald-400 bg-emerald-950/30"
                        : "border-slate-700 text-slate-500 bg-slate-900/50"
                }`}
              >
                {status === "listening"
                  ? "Recording"
                  : status === "processing"
                    ? "Processing"
                    : status === "done"
                      ? "Complete"
                      : "Ready"}
              </span>

              {/* Mic button */}
              <button
                onClick={isListening ? stopAndSubmit : startListening}
                className={`rounded-full border-2 flex items-center justify-center transition-all duration-300 cursor-pointer ${
                  status === "idle" && !result ? "w-24 h-24" : "w-14 h-14"
                } ${
                  isListening
                    ? "border-red-500 bg-red-500/10 text-red-400 animate-pulse shadow-[0_0_50px_rgba(239,68,68,0.3)]"
                    : "border-slate-600 bg-slate-800/50 text-slate-400 hover:border-sky-400 hover:text-sky-400 hover:bg-sky-500/5 hover:shadow-[0_0_40px_rgba(56,189,248,0.15)]"
                }`}
              >
                {isListening ? (
                  <svg width={status === "idle" && !result ? "30" : "20"} height={status === "idle" && !result ? "30" : "20"} viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                ) : (
                  <svg width={status === "idle" && !result ? "34" : "22"} height={status === "idle" && !result ? "34" : "22"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="8" y1="22" x2="16" y2="22" />
                  </svg>
                )}
              </button>

              <p className="text-sm text-slate-500">
                {isListening
                  ? "Tap to stop & process"
                  : status === "idle" && !result
                    ? "Tap to start voice triage"
                    : "Start new triage"}
              </p>

              {/* Load mock — only in idle */}
              {status === "idle" && !result && (
                <button
                  onClick={() => { setResult(MOCK_RESPONSE); setStatus("done"); }}
                  className="text-sm font-medium text-slate-600 border border-slate-800 px-5 py-2 rounded-full hover:text-slate-300 hover:border-slate-600 hover:bg-slate-800/30 transition-all cursor-pointer"
                >
                  Load Demo Data
                </button>
              )}
            </div>

            {/* Live transcript — outside the box, beside it */}
            {(isListening || (liveTranscript && status !== "done")) && (
              <div className="ml-4 flex-1 max-w-xl border border-slate-800 rounded-2xl bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500 mb-2">
                  {isListening ? "Listening..." : "Transcript"}
                </div>
                <p className="text-base text-slate-300 leading-relaxed">
                  {liveTranscript || <span className="text-slate-600 italic">Speak now...</span>}
                </p>
              </div>
            )}

            {/* Processing */}
            {status === "processing" && (
              <div className="ml-4 text-amber-400 text-sm font-medium tracking-[0.15em] animate-pulse">
                ANALYZING TRANSCRIPT...
              </div>
            )}
          </div>

          {/* Extracted data — dashboard grid */}
          {result && !editing && (
            <div className="flex-1 grid grid-cols-3 grid-rows-[auto_1fr_1fr_auto] gap-4 p-5 overflow-hidden">

              {/* Row 0: Patient header — spans full width */}
              <div className="col-span-3 flex items-center gap-4 px-1">
                <h2 className="flex-1 text-xl font-bold text-white tracking-tight">
                  {form.age ? `${form.age}${form.sex ? form.sex[0].toUpperCase() : ""}` : "Unknown Patient"}
                  {form.chief_complaint && (
                    <span className="text-slate-400 font-normal">
                      {" "}&mdash; {form.chief_complaint}
                    </span>
                  )}
                </h2>
                {triage && (
                  <span className={`px-3.5 py-1 rounded-full text-sm font-bold ${triage.bg} ${triage.text}`}>
                    ESI {result.triage_level}
                  </span>
                )}
              </div>

              {/* Row 1: Reasoning (2 cols) + Demographics (1 col) */}
              <div className="col-span-2 min-h-0">
                <StretchCard>
                  <CardLabel>Triage Reasoning</CardLabel>
                  <p className="text-base text-slate-300 leading-relaxed">
                    {result.triage_reasoning}
                  </p>
                </StretchCard>
              </div>

              <div className="min-h-0">
                <StretchCard>
                  <CardLabel>Demographics</CardLabel>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DataRow label="First Name" value={form.first_name} missing={result.missing_fields.includes("first_name")} />
                    <DataRow label="Last Name" value={form.last_name} missing={result.missing_fields.includes("last_name")} />
                    <DataRow label="Age" value={form.age != null ? `${form.age}` : undefined} />
                    <DataRow label="Sex" value={form.sex} />
                    <DataRow label="Weight" value={form.weight_kg != null ? `${form.weight_kg} kg` : undefined} missing={result.missing_fields.includes("weight_kg")} />
                    <DataRow label="GCS" value={form.gcs != null ? `${form.gcs} / 15` : undefined} />
                  </div>
                </StretchCard>
              </div>

              {/* Row 2: Clinical (2 cols) + Meds & History (1 col) */}
              <div className="col-span-2 min-h-0">
                <StretchCard>
                  <CardLabel>Clinical Information</CardLabel>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <DataRow label="Chief Complaint" value={form.chief_complaint} />
                    <DataRow label="Symptoms" value={form.symptoms?.join(", ")} />
                    <DataRow label="Allergies" value={form.allergies} />
                    <DataRow label="Pain Scale" value={form.pain_scale != null ? `${form.pain_scale} / 10` : undefined} />
                    <DataRow label="Incident History" value={form.incident_history} span2 />
                  </div>
                </StretchCard>
              </div>

              <div className="min-h-0">
                <StretchCard>
                  <CardLabel>Medications</CardLabel>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {form.medications && form.medications.length > 0 ? (
                      form.medications.map((m) => (
                        <span key={m} className="text-sm font-medium px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20">
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-600 italic">—</span>
                    )}
                  </div>
                  <CardLabel>Past History</CardLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {form.relevant_past_history && form.relevant_past_history.length > 0 ? (
                      form.relevant_past_history.map((h) => (
                        <span key={h} className="text-sm font-medium px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/20">
                          {h}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-600 italic">—</span>
                    )}
                  </div>
                </StretchCard>
              </div>

              {/* Row 3: Notes (full width) */}
              <div className="col-span-3 min-h-0">
                <StretchCard>
                  <CardLabel>Notes</CardLabel>
                  <p className="text-base text-slate-400 leading-relaxed italic">
                    {form.notes || <span className="text-slate-600">—</span>}
                  </p>
                </StretchCard>
              </div>

            </div>
          )}

          {/* Edit mode */}
          {result && editing && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto space-y-4">
                <Card>
                  <CardLabel>Demographics</CardLabel>
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="First Name" value={form.first_name ?? ""} onChange={(v) => setForm((f) => ({ ...f, first_name: v }))} missing={result.missing_fields.includes("first_name")} />
                    <EditField label="Last Name" value={form.last_name ?? ""} onChange={(v) => setForm((f) => ({ ...f, last_name: v }))} missing={result.missing_fields.includes("last_name")} />
                    <EditField label="Age" value={form.age?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, age: Number(v) || undefined }))} />
                    <EditField label="Sex" value={form.sex ?? ""} onChange={(v) => setForm((f) => ({ ...f, sex: v }))} />
                    <EditField label="Weight (kg)" value={form.weight_kg?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, weight_kg: Number(v) || undefined }))} missing={result.missing_fields.includes("weight_kg")} />
                    <EditField label="GCS" value={form.gcs?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, gcs: Number(v) || undefined }))} />
                  </div>
                </Card>

                <Card>
                  <CardLabel>Clinical</CardLabel>
                  <div className="space-y-3">
                    <EditField label="Chief Complaint" value={form.chief_complaint ?? ""} onChange={(v) => setForm((f) => ({ ...f, chief_complaint: v }))} />
                    <EditField label="Allergies" value={form.allergies ?? ""} onChange={(v) => setForm((f) => ({ ...f, allergies: v }))} />
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-[0.15em] text-slate-500 mb-1.5">
                        Notes
                      </label>
                      <textarea
                        value={form.notes ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-base focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 resize-none transition-colors"
                      />
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardLabel>Vitals</CardLabel>
                  <div className="grid grid-cols-3 gap-3">
                    <EditField label="Heart Rate" value={form.vitals?.heart_rate?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, vitals: { ...f.vitals, heart_rate: Number(v) || undefined } }))} />
                    <EditField label="SpO2" value={form.vitals?.spo2?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, vitals: { ...f.vitals, spo2: Number(v) || undefined } }))} />
                    <EditField label="Respiratory Rate" value={form.vitals?.respiratory_rate?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, vitals: { ...f.vitals, respiratory_rate: Number(v) || undefined } }))} />
                    <EditField label="BP Systolic" value={form.vitals?.blood_pressure_systolic?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, vitals: { ...f.vitals, blood_pressure_systolic: Number(v) || undefined } }))} />
                    <EditField label="BP Diastolic" value={form.vitals?.blood_pressure_diastolic?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, vitals: { ...f.vitals, blood_pressure_diastolic: Number(v) || undefined } }))} />
                    <EditField label="Pain Scale" value={form.pain_scale?.toString() ?? ""} onChange={(v) => setForm((f) => ({ ...f, pain_scale: Number(v) || undefined }))} />
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM BAR ── */}
      {result && (
        <div className="border-t border-slate-800/60 px-6 py-3.5 flex items-center justify-between bg-slate-900/60">
          <button
            onClick={() => setEditing(!editing)}
            className="text-sm font-semibold uppercase tracking-[0.1em] px-5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            {editing ? "View Summary" : "Edit Details"}
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setResult(null);
                setForm({});
                setLiveTranscript("");
                setStatus("idle");
                setEditing(false);
              }}
              className="text-sm font-semibold uppercase tracking-[0.1em] px-5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all cursor-pointer"
            >
              New Triage
            </button>
            <button className="text-sm font-semibold uppercase tracking-[0.1em] px-6 py-2.5 rounded-xl bg-sky-500 text-white hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20 cursor-pointer">
              Submit to Hospital
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function VitalRow({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value?: number | string;
  unit: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm font-medium uppercase tracking-wider ${warn ? "text-red-400" : "text-slate-500"}`}>
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-xl font-bold font-mono tabular-nums ${warn ? "text-red-300" : "text-white"}`}>
          {value != null ? value : <span className="text-slate-700">—</span>}
        </span>
        {value != null && (
          <span className={`text-xs font-medium ${warn ? "text-red-400/60" : "text-slate-600"}`}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      {children}
    </div>
  );
}

function StretchCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 h-full">
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
      {children}
    </div>
  );
}

function DataRow({
  label,
  value,
  span2,
  missing,
}: {
  label: string;
  value?: string;
  span2?: boolean;
  missing?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <div className={`text-xs font-medium uppercase tracking-[0.15em] mb-1 ${missing ? "text-amber-400" : "text-slate-500"}`}>
        {label}{missing && " *"}
      </div>
      {value ? (
        <div className="text-base text-slate-200 leading-relaxed">{value}</div>
      ) : (
        <div className="text-base text-slate-600 italic">—</div>
      )}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  missing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  missing?: boolean;
}) {
  return (
    <div>
      <label className={`block text-xs font-medium uppercase tracking-[0.15em] mb-1.5 ${missing ? "text-amber-400" : "text-slate-500"}`}>
        {label}
        {missing && " *"}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-slate-800/50 border rounded-xl px-3.5 py-2.5 text-white text-base focus:outline-none focus:ring-1 transition-colors ${
          missing
            ? "border-amber-600/50 focus:border-amber-400 focus:ring-amber-400/30"
            : "border-slate-700 focus:border-sky-500 focus:ring-sky-500/30"
        }`}
      />
    </div>
  );
}
