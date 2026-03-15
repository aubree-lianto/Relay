"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config";

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

// ── Backend response types (aligned with backend schemas.py) ─────────────────
interface Vitals {
  pulse_rate?: number;
  spo2?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  resp_rate?: number;
  temp?: number;
}

interface PatientRecord {
  demographics?: { age?: number; sex?: string; first_name?: string; last_name?: string };
  chief_complaint?: string;
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

// ── Mock fallback (used when backend is unreachable) ─────────────────────────
const MOCK_RESPONSE: TriageResponse = {
  patient_record: {
    demographics: { age: 65, sex: "M" },
    chief_complaint: "chest pain",
    vitals: { pulse_rate: 102, spo2: 94, bp_systolic: 158, bp_diastolic: 95, resp_rate: 22 },
    estimated_arrival_minutes: 8,
    ctas: 2,
    remarks: "Patient on ASA and nitrates. History of cardiac disease.",
  },
  ctas: 2,
  ctas_reasoning: "Emergent: chest pain with diaphoresis, abnormal HR and SpO2 (mock data — backend offline)",
  missing_fields: ["first_name", "last_name"],
  validation_warnings: ["Pulse rate 102 above normal", "SpO2 94% below normal"],
};

// ── Triage level colours ─────────────────────────────────────────────────────
const TRIAGE_COLOR: Record<number, { border: string; text: string; label: string }> = {
  1: { border: "border-red-500",    text: "text-red-400",    label: "IMMEDIATE"   },
  2: { border: "border-orange-500", text: "text-orange-400", label: "EMERGENT"    },
  3: { border: "border-yellow-500", text: "text-yellow-400", label: "URGENT"      },
  4: { border: "border-green-500",  text: "text-green-400",  label: "LESS URGENT" },
  5: { border: "border-blue-500",   text: "text-blue-400",   label: "NON-URGENT"  },
};

export interface VoiceInputProps {
  onResult?: (result: TriageResponse) => void;
}

export default function VoiceInput({ onResult }: VoiceInputProps = {}) {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState(""); // interim + final so far
  const [finalTranscript, setFinalTranscript] = useState(""); // committed final text
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "done" | "error">("idle");
  const [triageResult, setTriageResult] = useState<TriageResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const committedRef = useRef("");   // finalized chunks
  const latestTextRef = useRef(""); // always the full live text (committed + interim)

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
        const isFinal = event.results[i].isFinal;
        console.log(`[VoiceInput] chunk (final=${isFinal}):`, chunk);
        if (isFinal) {
          committedRef.current += chunk + " ";
        } else {
          interim += chunk;
        }
      }
      const fullText = committedRef.current + interim;
      latestTextRef.current = fullText;
      console.log("[VoiceInput] live text:", fullText);
      setFinalTranscript(committedRef.current);
      setLiveTranscript(fullText);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("[VoiceInput] error:", event.error);
      if (event.error === "no-speech") return;
      setErrorMsg(`Speech error: ${event.error}`);
      setStatus("error");
      setIsListening(false);
    };

    rec.onend = () => {
      console.log("[VoiceInput] recognition ended. final text:", latestTextRef.current || "(empty)");
      if (!latestTextRef.current.trim()) {
        console.warn("[VoiceInput] onend fired with no text — mic may be blocked or no audio received");
      }
    };

    return rec;
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    committedRef.current = "";
    latestTextRef.current = "";
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
    console.log("[VoiceInput] started listening");
    setIsListening(true);
  }, [buildRecognition]);

  // ── Stop + submit ───────────────────────────────────────────────────────────
  const stopAndSubmit = useCallback(async () => {
    setIsListening(false);
    recognitionRef.current?.stop();

    const text = latestTextRef.current.trim() || committedRef.current.trim() || finalTranscript.trim();
    console.log("[VoiceInput] submitting transcript:", text);
    if (!text) {
      console.warn("[VoiceInput] no transcript captured — nothing to submit");
      setStatus("idle");
      return;
    }

    setStatus("processing");
    try {
      const res = await fetch(`${API_BASE_URL}/triage/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TriageResponse = await res.json();
      setTriageResult(data);
      onResult?.(data);
      setStatus("done");
    } catch {
      setTriageResult(MOCK_RESPONSE);
      onResult?.(MOCK_RESPONSE);
      setErrorMsg("Backend offline — showing mock data");
      setStatus("done");
    }
  }, [finalTranscript]);

  // Cleanup on unmount
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const tColor = triageResult ? (TRIAGE_COLOR[triageResult.ctas] ?? TRIAGE_COLOR[3]) : null;

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
            <span className="text-gray-500 text-xs tracking-widest uppercase">CTAS Level</span>
            <span className={`text-3xl font-bold ${tColor.text}`}>
              {triageResult.ctas}{" "}
              <span className="text-sm tracking-widest">{tColor.label}</span>
            </span>
          </div>

          {/* Reasoning */}
          <div>
            <p className="text-gray-600 text-xs tracking-widest uppercase mb-1">Reasoning</p>
            <p className="text-gray-300 text-sm leading-relaxed">{triageResult.ctas_reasoning}</p>
          </div>

          {/* Patient record grid */}
          <div>
            <p className="text-gray-600 text-xs tracking-widest uppercase mb-2">Patient Record</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <RecordField label="Age" value={triageResult.patient_record.demographics?.age?.toString()} />
              <RecordField label="Sex" value={triageResult.patient_record.demographics?.sex} />
              <RecordField label="Complaint" value={triageResult.patient_record.chief_complaint} className="col-span-2" />
              <RecordField label="ETA" value={triageResult.patient_record.estimated_arrival_minutes != null
                ? `${triageResult.patient_record.estimated_arrival_minutes} min` : undefined} />
              {triageResult.patient_record.vitals && (
                <RecordField label="Vitals" value={formatVitals(triageResult.patient_record.vitals)} className="col-span-2" />
              )}
              <RecordField label="Remarks" value={triageResult.patient_record.remarks} className="col-span-2" />
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
  if (v.pulse_rate != null)                           parts.push(`HR ${v.pulse_rate}`);
  if (v.spo2 != null)                                 parts.push(`SpO₂ ${v.spo2}%`);
  if (v.bp_systolic != null && v.bp_diastolic != null) parts.push(`BP ${v.bp_systolic}/${v.bp_diastolic}`);
  if (v.resp_rate != null)                            parts.push(`RR ${v.resp_rate}`);
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
