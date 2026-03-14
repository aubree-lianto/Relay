"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Browser type shims (Web Speech API is not in lib.dom.d.ts by default) ──
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
declare const SpeechRecognition: {
  new (): SpeechRecognition;
};
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

// ── Backend response types ───────────────────────────────────────────────────
interface Vitals {
  heart_rate?: number;
  spo2?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  respiratory_rate?: number;
}

interface PatientRecord {
  age?: number;
  sex?: string;
  chief_complaint?: string;
  symptoms?: string[];
  vitals?: Vitals;
  estimated_arrival_minutes?: number;
  triage_level?: number;
  notes?: string;
}

interface TriageResponse {
  patient_record: PatientRecord;
  triage_level: number;
  triage_reasoning: string;
  missing_fields: string[];
  validation_warnings: string[];
}

// ── Triage level colours ─────────────────────────────────────────────────────
const TRIAGE_COLOR: Record<number, { border: string; text: string; label: string }> = {
  1: { border: "border-red-500",    text: "text-red-400",    label: "IMMEDIATE"   },
  2: { border: "border-orange-500", text: "text-orange-400", label: "EMERGENT"    },
  3: { border: "border-yellow-500", text: "text-yellow-400", label: "URGENT"      },
  4: { border: "border-green-500",  text: "text-green-400",  label: "LESS URGENT" },
  5: { border: "border-blue-500",   text: "text-blue-400",   label: "NON-URGENT"  },
};

export default function VoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState(""); // interim + final so far
  const [finalTranscript, setFinalTranscript] = useState(""); // committed final text
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "done" | "error">("idle");
  const [triageResult, setTriageResult] = useState<TriageResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Accumulate finalised chunks across onresult callbacks
  const committedRef = useRef("");

  // ── Build recognition instance once ────────────────────────────────────────
  const buildRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
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
      setFinalTranscript(committedRef.current);
      setLiveTranscript(committedRef.current + interim);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return; // harmless timeout — keep listening
      setErrorMsg(`Speech error: ${event.error}`);
      setStatus("error");
      setIsListening(false);
    };

    rec.onend = () => {
      // onend fires when stop() is called OR on a timeout; we only submit when
      // the user deliberately pressed stop (isListening will be false by then).
    };

    return rec;
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    committedRef.current = "";
    setFinalTranscript("");
    setLiveTranscript("");
    setTriageResult(null);
    setErrorMsg("");
    setStatus("listening");

    const rec = buildRecognition();
    if (!rec) {
      setErrorMsg("Web Speech API is not supported in this browser.");
      setStatus("error");
      return;
    }
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [buildRecognition]);

  // ── Stop + submit ───────────────────────────────────────────────────────────
  const stopAndSubmit = useCallback(async () => {
    setIsListening(false);
    recognitionRef.current?.stop();

    const text = committedRef.current.trim() || finalTranscript.trim();
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
      setTriageResult(data);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, [finalTranscript]);

  // Cleanup on unmount
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const tColor = triageResult ? (TRIAGE_COLOR[triageResult.triage_level] ?? TRIAGE_COLOR[3]) : null;

  return (
    <div className="w-full max-w-4xl mt-6 font-mono space-y-4">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-green-400 text-sm font-bold tracking-widest uppercase">
          Paramedic Voice Input
        </h2>
        <StatusBadge status={status} />
      </div>

      {/* ── Mic button ── */}
      <div className="flex justify-center">
        <button
          onClick={isListening ? stopAndSubmit : startListening}
          className={`
            w-20 h-20 rounded-full border-2 flex items-center justify-center
            transition-all duration-200 focus:outline-none
            ${isListening
              ? "border-red-500 bg-red-950 text-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]"
              : "border-green-700 bg-black text-green-500 hover:border-green-400 hover:text-green-300"
            }
          `}
          title={isListening ? "Stop recording" : "Start recording"}
        >
          {isListening ? <StopIcon /> : <MicIcon />}
        </button>
      </div>

      {/* ── Live transcript box ── */}
      {(isListening || liveTranscript) && (
        <div className="border border-green-900 rounded bg-black p-4 min-h-[80px]">
          <p className="text-xs text-green-700 tracking-widest mb-2 uppercase">
            {isListening ? "Listening…" : "Transcript"}
          </p>
          <p className="text-green-300 text-sm leading-relaxed whitespace-pre-wrap">
            {liveTranscript || (
              <span className="text-green-800 italic">Speak now…</span>
            )}
          </p>
        </div>
      )}

      {/* ── Processing indicator ── */}
      {status === "processing" && (
        <div className="text-center text-yellow-400 text-xs tracking-widest animate-pulse">
          PROCESSING TRIAGE…
        </div>
      )}

      {/* ── Error ── */}
      {status === "error" && errorMsg && (
        <div className="border border-red-800 rounded bg-red-950 p-3 text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      {/* ── Triage result card ── */}
      {triageResult && tColor && (
        <div className={`border ${tColor.border} rounded bg-black p-5 space-y-4`}>
          {/* Level banner */}
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-xs tracking-widest uppercase">ESI Triage Level</span>
            <span className={`text-3xl font-bold ${tColor.text}`}>
              {triageResult.triage_level}{" "}
              <span className="text-sm tracking-widest">{tColor.label}</span>
            </span>
          </div>

          {/* Reasoning */}
          <div>
            <p className="text-gray-600 text-xs tracking-widest uppercase mb-1">Reasoning</p>
            <p className="text-gray-300 text-sm leading-relaxed">{triageResult.triage_reasoning}</p>
          </div>

          {/* Patient record grid */}
          <div>
            <p className="text-gray-600 text-xs tracking-widest uppercase mb-2">Patient Record</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <RecordField label="Age"       value={triageResult.patient_record.age?.toString()} />
              <RecordField label="Sex"       value={triageResult.patient_record.sex} />
              <RecordField label="Complaint" value={triageResult.patient_record.chief_complaint} className="col-span-2" />
              <RecordField
                label="Symptoms"
                value={triageResult.patient_record.symptoms?.join(", ")}
                className="col-span-2"
              />
              <RecordField label="ETA"       value={triageResult.patient_record.estimated_arrival_minutes != null
                ? `${triageResult.patient_record.estimated_arrival_minutes} min` : undefined} />
              {triageResult.patient_record.vitals && (
                <RecordField
                  label="Vitals"
                  value={formatVitals(triageResult.patient_record.vitals)}
                  className="col-span-2"
                />
              )}
              <RecordField label="Notes" value={triageResult.patient_record.notes} className="col-span-2" />
            </div>
          </div>

          {/* Missing fields */}
          {triageResult.missing_fields.length > 0 && (
            <div>
              <p className="text-gray-600 text-xs tracking-widest uppercase mb-1">Missing Fields</p>
              <p className="text-yellow-600 text-xs">{triageResult.missing_fields.join(" · ")}</p>
            </div>
          )}

          {/* Validation warnings */}
          {triageResult.validation_warnings.length > 0 && (
            <div>
              <p className="text-gray-600 text-xs tracking-widest uppercase mb-1">Warnings</p>
              <ul className="space-y-1">
                {triageResult.validation_warnings.map((w, i) => (
                  <li key={i} className="text-orange-400 text-xs">⚠ {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* New triage button */}
          <button
            onClick={() => {
              setStatus("idle");
              setTriageResult(null);
              setLiveTranscript("");
              setFinalTranscript("");
            }}
            className="w-full mt-2 border border-green-900 text-green-600 text-xs tracking-widest py-2 rounded hover:border-green-600 hover:text-green-400 transition-colors"
          >
            NEW TRIAGE
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function formatVitals(v: Vitals): string {
  const parts: string[] = [];
  if (v.heart_rate != null)               parts.push(`HR ${v.heart_rate}`);
  if (v.spo2 != null)                     parts.push(`SpO₂ ${v.spo2}%`);
  if (v.blood_pressure_systolic != null && v.blood_pressure_diastolic != null)
    parts.push(`BP ${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}`);
  if (v.respiratory_rate != null)         parts.push(`RR ${v.respiratory_rate}`);
  return parts.join("  ·  ");
}

function RecordField({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <div className={className}>
      <span className="text-gray-600 text-xs tracking-widest uppercase">{label}: </span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    idle:       "border-gray-800 text-gray-600",
    listening:  "border-red-500 text-red-400 animate-pulse",
    processing: "border-yellow-600 text-yellow-400 animate-pulse",
    done:       "border-green-600 text-green-400",
    error:      "border-red-700 text-red-500",
  };
  const labels: Record<string, string> = {
    idle:       "● READY",
    listening:  "● RECORDING",
    processing: "● PROCESSING",
    done:       "● COMPLETE",
    error:      "● ERROR",
  };
  return (
    <span className={`text-xs px-3 py-1 rounded-full border ${map[status] ?? map.idle}`}>
      {labels[status] ?? "● READY"}
    </span>
  );
}

function MicIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}
