"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, WS_BASE } from "../config";

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

/** Normalize backend response: ctas→triage_level, demographics→flat, pulse_rate→heart_rate */
function normalizeTriageResponse(raw: Record<string, unknown>): TriageResponse {
  const pr = (raw.patient_record || {}) as Record<string, unknown>;
  const demo = (pr.demographics || {}) as Record<string, unknown>;
  const vitals = (pr.vitals || {}) as Record<string, unknown>;
  return {
    patient_record: {
      first_name: (pr.first_name ?? demo.first_name) as string | undefined,
      last_name: (pr.last_name ?? demo.last_name) as string | undefined,
      age: (pr.age ?? demo.age) as number | undefined,
      sex: (pr.sex ?? demo.sex) as string | undefined,
      weight_kg: pr.weight_kg as number | undefined,
      chief_complaint: pr.chief_complaint as string | undefined,
      incident_history: pr.incident_history as string | undefined,
      symptoms: pr.symptoms as string[] | undefined,
      allergies: pr.allergies as string | undefined,
      medications: Array.isArray(pr.medications)
        ? (pr.medications as string[])
        : typeof pr.medications === "string"
          ? pr.medications.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      relevant_past_history: pr.relevant_past_history as string[] | undefined,
      vitals: {
        heart_rate: (vitals.heart_rate ?? vitals.pulse_rate) as number | undefined,
        spo2: vitals.spo2 as number | undefined,
        blood_pressure_systolic: (vitals.blood_pressure_systolic ?? vitals.bp_systolic) as number | undefined,
        blood_pressure_diastolic: (vitals.blood_pressure_diastolic ?? vitals.bp_diastolic) as number | undefined,
        respiratory_rate: (vitals.respiratory_rate ?? vitals.resp_rate) as number | undefined,
      },
      estimated_arrival_minutes: pr.estimated_arrival_minutes as number | undefined,
      triage_level: (raw.triage_level ?? raw.ctas) as number,
      notes: (pr.notes ?? pr.remarks) as string | undefined,
      gcs: pr.gcs as number | undefined,
      pain_scale: pr.pain_scale as number | undefined,
    },
    triage_level: (raw.triage_level ?? raw.ctas) as number,
    triage_reasoning: (raw.triage_reasoning ?? raw.ctas_reasoning) as string,
    missing_fields: (raw.missing_fields || []) as string[],
    validation_warnings: (raw.validation_warnings || []) as string[],
  };
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

/** Stream event from backend SSE */
interface StreamEvent {
  type: "progress" | "done" | "error";
  step?: string;
  message?: string;
  result?: Record<string, unknown>;
}

export default function TriagePage() {
  const [status, setStatus] = useState<
    "idle" | "listening" | "processing" | "done"
  >("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PatientRecord>({});
  const [streamingSteps, setStreamingSteps] = useState<string[]>([]);
  const [streamingError, setStreamingError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const committedRef = useRef("");
  const latestTextRef = useRef("");

  // ── Live EKG state ──────────────────────────────────────────────────────
  const [liveHR, setLiveHR] = useState<number | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveHRRef = useRef(75);

  const EKG_W = 260;
  const EKG_H = 80;
  const EKG_BASELINE = 45;
  const EKG_SPEED = 2;
  const EKG_ERASER = 20;

  const EKG_BEAT: [number, number][] = [
    [0.00,  0.00], [0.05, -0.06], [0.10,  0.03], [0.15,  0.00],
    [0.20,  0.10], [0.25, -1.00], [0.30,  0.45], [0.38, -0.10],
    [0.48, -0.20], [0.58, -0.04], [0.65,  0.00], [1.00,  0.00],
  ];

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/vitals`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      liveHRRef.current = data.pulse_rate ?? 75;
      setLiveHR(data.pulse_rate ?? null);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const wc = waveCanvasRef.current;
    const dc = dotCanvasRef.current;
    if (!wc || !dc) return;
    const wctx = wc.getContext("2d")!;
    const dctx = dc.getContext("2d")!;

    // grid
    const grid = document.createElement("canvas");
    grid.width = EKG_W; grid.height = EKG_H;
    const g = grid.getContext("2d")!;
    g.fillStyle = "#0f172a";
    g.fillRect(0, 0, EKG_W, EKG_H);
    g.strokeStyle = "#1e293b"; g.lineWidth = 0.5;
    for (let x = 0; x <= EKG_W; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, EKG_H); g.stroke(); }
    for (let y = 0; y <= EKG_H; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(EKG_W, y); g.stroke(); }

    wctx.drawImage(grid, 0, 0);

    let cx = 0, bp = 0, py = EKG_BASELINE, anim: number;
    const draw = () => {
      const hr = liveHRRef.current;
      const ppb = (EKG_SPEED * 60) / (hr / 60);
      const amp = 30;
      const es = (cx + EKG_SPEED + 2) % EKG_W;
      const ee = es + EKG_ERASER;
      if (ee <= EKG_W) { wctx.drawImage(grid, es, 0, EKG_ERASER, EKG_H, es, 0, EKG_ERASER, EKG_H); }
      else { const p1 = EKG_W - es; wctx.drawImage(grid, es, 0, p1, EKG_H, es, 0, p1, EKG_H); wctx.drawImage(grid, 0, 0, ee - EKG_W, EKG_H, 0, 0, ee - EKG_W, EKG_H); }

      const t = Math.max(0, Math.min(1, bp / ppb));
      let cy = EKG_BASELINE;
      for (let i = 0; i < EKG_BEAT.length - 1; i++) {
        const [t0, d0] = EKG_BEAT[i], [t1, d1] = EKG_BEAT[i + 1];
        if (t >= t0 && t <= t1) { const f = (t - t0) / (t1 - t0); cy = EKG_BASELINE + (d0 + (d1 - d0) * f) * amp; break; }
      }
      const nx = (cx + EKG_SPEED) % EKG_W;

      wctx.shadowBlur = 0; wctx.strokeStyle = "#38bdf8"; wctx.lineWidth = 1.5; wctx.lineJoin = "round"; wctx.lineCap = "round";
      if (nx < cx) { wctx.beginPath(); wctx.moveTo(cx, py); wctx.lineTo(EKG_W, cy); wctx.stroke(); wctx.beginPath(); wctx.moveTo(0, cy); wctx.lineTo(nx, cy); wctx.stroke(); }
      else { wctx.beginPath(); wctx.moveTo(cx, py); wctx.lineTo(nx, cy); wctx.stroke(); }

      dctx.clearRect(0, 0, EKG_W, EKG_H);
      dctx.shadowBlur = 8; dctx.shadowColor = "#bae6fd"; dctx.fillStyle = "#fff";
      dctx.beginPath(); dctx.arc(nx, cy, 3, 0, Math.PI * 2); dctx.fill(); dctx.shadowBlur = 0;

      py = cy; cx = nx; bp = (bp + EKG_SPEED) % ppb;
      anim = requestAnimationFrame(draw);
    };
    anim = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(anim);
  }, []);

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
    setStreamingSteps([]);
    setStreamingError(null);
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
    setStreamingSteps([]);
    setStreamingError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/triage/process/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const event: StreamEvent = JSON.parse(dataLine.slice(6));
            if (event.type === "progress" && event.message) {
              setStreamingSteps((prev) => [...prev, event.message]);
            } else if (event.type === "done" && event.result) {
              const data = normalizeTriageResponse(event.result);
              setResult(data);
              setStatus("done");
              return;
            } else if (event.type === "error" && event.message) {
              setStreamingError(event.message);
              setStatus("done");
              return;
            }
          } catch {
            // ignore parse errors for partial chunks
          }
        }
      }
      // stream ended without "done" – fallback to non-stream endpoint
      const fallback = await fetch(`${API_BASE_URL}/triage/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (fallback.ok) {
        const raw = await fallback.json();
        setResult(normalizeTriageResponse(raw));
      } else {
        setResult(MOCK_RESPONSE);
      }
      setStatus("done");
    } catch {
      setResult(MOCK_RESPONSE);
      setStreamingError("Connection failed — showing demo data");
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
        <aside className="w-96 border-r border-slate-800/60 bg-slate-900/40 flex flex-col p-5 gap-3 overflow-y-auto">

          {/* Triage badge */}
          {triage && result ? (
            <div className={`rounded-2xl p-5 ${triage.bg} ${triage.glow} transition-all`}>
              <div className={`text-sm font-medium uppercase tracking-[0.2em] opacity-80 ${triage.text}`}>
                CTAS Level
              </div>
              <div className="flex items-baseline gap-3">
                <div className={`text-6xl font-black leading-none mt-1 ${triage.text}`}>
                  {result.triage_level}
                </div>
                <div className={`text-base font-semibold tracking-wider ${triage.text}`}>
                  {triage.label}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-5 border border-slate-800 bg-slate-900/60">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-600">
                CTAS Level
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-6xl font-black leading-none mt-1 text-slate-800">—</div>
                <div className="text-base font-medium text-slate-700 tracking-wider">AWAITING DATA</div>
              </div>
            </div>
          )}

          {/* ETA */}
          <div className="rounded-2xl p-5 border border-slate-800 bg-slate-900/60">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500 mb-1">
              ETA
            </div>
            {form.estimated_arrival_minutes != null ? (
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-white font-mono tabular-nums">
                  {form.estimated_arrival_minutes}
                </span>
                <span className="text-base font-medium text-slate-500">min</span>
              </div>
            ) : (
              <div className="text-4xl font-black text-slate-800">—</div>
            )}
          </div>

          {/* Streaming progress (visible while processing) */}
          {status === "processing" && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-amber-400 mb-3">
                Triage progress
              </div>
              <div className="space-y-2">
                {streamingSteps.length === 0 ? (
                  <p className="text-amber-300/80 text-sm animate-pulse">Starting…</p>
                ) : (
                  streamingSteps.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-sm ${
                        i === streamingSteps.length - 1
                          ? "text-amber-300 font-medium"
                          : "text-slate-500"
                      }`}
                    >
                      {i === streamingSteps.length - 1 ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      )}
                      {msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Live EKG strip */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                Live EKG
              </div>
              {liveHR != null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold font-mono tabular-nums text-sky-300">{liveHR}</span>
                  <span className="text-xs text-slate-500">bpm</span>
                </div>
              )}
            </div>
            <div className="relative rounded-lg overflow-hidden" style={{ height: 80 }}>
              <canvas ref={waveCanvasRef} width={260} height={80} className="absolute inset-0 w-full h-full block" />
              <canvas ref={dotCanvasRef} width={260} height={80} className="absolute inset-0 w-full h-full block" />
            </div>
          </div>

          {/* Vitals strip */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex-1">
            <div className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500 mb-3">
              Vitals
            </div>
            <div className="space-y-2">
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

          {/* Voice input — sidebar mic */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col items-center gap-3">
              {/* Status badge */}
              <span
                className={`text-sm font-semibold tracking-[0.15em] uppercase px-4 py-1.5 rounded-full border transition-colors ${
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
                className={`rounded-full border-2 flex items-center justify-center transition-all duration-300 cursor-pointer w-16 h-16 ${
                  isListening
                    ? "border-red-500 bg-red-500/10 text-red-400 animate-pulse shadow-[0_0_50px_rgba(239,68,68,0.3)]"
                    : "border-slate-600 bg-slate-800/50 text-slate-400 hover:border-sky-400 hover:text-sky-400 hover:bg-sky-500/5 hover:shadow-[0_0_40px_rgba(56,189,248,0.15)]"
                }`}
              >
                {isListening ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0 0 14 0" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                    <line x1="8" y1="22" x2="16" y2="22" />
                  </svg>
                )}
              </button>

              <p className="text-sm text-slate-500 text-center">
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
                  className="text-sm font-medium text-slate-600 border border-slate-800 px-4 py-2 rounded-full hover:text-slate-300 hover:border-slate-600 hover:bg-slate-800/30 transition-all cursor-pointer"
                >
                  Load Demo
                </button>
              )}
            </div>

          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Warnings & Missing info bar */}
          {result && (result.validation_warnings.length > 0 || result.missing_fields.length > 0) && (
            <div className="border-b border-slate-800/60 p-4 flex items-stretch gap-4">
              {/* Warnings */}
              {result.validation_warnings.length > 0 && (
                <div className="flex-1 rounded-2xl border border-red-500/20 bg-red-950/20 p-5 flex flex-col justify-center">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400 mb-3">
                    Warnings
                  </div>
                  <div className="space-y-2">
                    {result.validation_warnings.map((w, i) => (
                      <div key={i} className="flex gap-2 text-base text-red-300/90 leading-snug">
                        <span className="text-red-500 shrink-0 mt-0.5">&#9679;</span>
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing fields */}
              {result.missing_fields.length > 0 && (
                <div className="flex-1 rounded-2xl border border-amber-500/20 bg-amber-950/20 p-5 flex flex-col justify-center">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400 mb-3">
                    Missing Information
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.missing_fields.map((f) => (
                      <span
                        key={f}
                        className="text-base font-medium px-3 py-1.5 rounded-lg border border-amber-600/30 text-amber-300 bg-amber-900/20"
                      >
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state / Live transcript */}
          {!result && (
            <div className="flex-1 flex items-center justify-center p-8">
              {isListening || (liveTranscript && status !== "done") ? (
                <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {isListening ? "Listening..." : "Transcript"}
                  </div>
                  <p className="text-xl text-slate-200 leading-relaxed">
                    {liveTranscript || <span className="text-slate-600 italic">Speak now...</span>}
                  </p>
                </div>
              ) : status === "processing" ? (
                <div className="w-full max-w-2xl mx-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-8">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Processing triage
                  </div>
                  {streamingSteps.length > 0 ? (
                    <p className="text-xl text-slate-200 leading-relaxed">
                      {streamingSteps[streamingSteps.length - 1]}…
                    </p>
                  ) : (
                    <p className="text-xl text-slate-400 italic">Starting…</p>
                  )}
                  {streamingError && (
                    <p className="mt-4 text-red-400 text-sm">{streamingError}</p>
                  )}
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-slate-700 text-lg font-medium tracking-wide">
                    Start a voice triage from the sidebar
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extracted data — dashboard grid */}
          {result && !editing && (
            <div className="flex-1 grid grid-cols-3 grid-rows-[auto_1fr_1fr_auto] gap-4 p-5 overflow-hidden">

              {/* Row 0: Patient header — spans full width */}
              <div className="col-span-3 flex items-center gap-4 px-1">
                <h2 className="flex-1 text-2xl font-bold text-white tracking-tight">
                  {form.age ? `${form.age}${form.sex ? form.sex[0].toUpperCase() : ""}` : "Unknown Patient"}
                  {form.chief_complaint && (
                    <span className="text-slate-400 font-normal">
                      {" "}&mdash; {form.chief_complaint}
                    </span>
                  )}
                </h2>
                {triage && (
                  <span className={`px-4 py-1.5 rounded-full text-base font-bold ${triage.bg} ${triage.text}`}>
                    CTAS {result.triage_level}
                  </span>
                )}
              </div>

              {/* Row 1: Reasoning (2 cols) + Demographics (1 col) */}
              <div className="col-span-2 min-h-0">
                <StretchCard>
                  <CardLabel>Triage Reasoning</CardLabel>
                  <p className="text-lg text-slate-300 leading-relaxed">
                    {result.triage_reasoning}
                  </p>
                </StretchCard>
              </div>

              <div className="min-h-0">
                <StretchCard>
                  <CardLabel>Demographics</CardLabel>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
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
                  <div className="grid grid-cols-2 gap-x-10 gap-y-4">
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
                        <span key={m} className="text-base font-medium px-3 py-1.5 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/20">
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
                        <span key={h} className="text-base font-medium px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/20">
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
                  <p className="text-lg text-slate-400 leading-relaxed italic">
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
                      <label className="block text-sm font-medium uppercase tracking-[0.15em] text-slate-500 mb-1.5">
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
        <div className="border-t border-slate-800/60 px-8 py-4 flex items-center justify-between bg-slate-900/60">
          <button
            onClick={() => setEditing(!editing)}
            className="text-base font-semibold uppercase tracking-[0.1em] px-6 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            {editing ? "View Summary" : "Edit Details"}
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setResult(null);
                setForm({});
                setLiveTranscript("");
                setStreamingSteps([]);
                setStreamingError(null);
                setStatus("idle");
                setEditing(false);
              }}
              className="text-base font-semibold uppercase tracking-[0.1em] px-6 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all cursor-pointer"
            >
              New Triage
            </button>
            <button className="text-base font-semibold uppercase tracking-[0.1em] px-8 py-3 rounded-xl bg-sky-500 text-white hover:bg-sky-400 transition-colors shadow-lg shadow-sky-500/20 cursor-pointer">
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
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-base font-medium uppercase tracking-wider ${warn ? "text-red-400" : "text-slate-500"}`}>
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${warn ? "text-red-300" : "text-white"}`}>
          {value != null ? value : <span className="text-slate-700">—</span>}
        </span>
        {value != null && (
          <span className={`text-sm font-medium ${warn ? "text-red-400/60" : "text-slate-600"}`}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      {children}
    </div>
  );
}

function StretchCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 h-full">
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">
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
      <div className={`text-sm font-medium uppercase tracking-[0.15em] mb-1.5 ${missing ? "text-amber-400" : "text-slate-500"}`}>
        {label}{missing && " *"}
      </div>
      {value ? (
        <div className="text-lg text-slate-200 leading-relaxed">{value}</div>
      ) : (
        <div className="text-lg text-slate-600 italic">—</div>
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
      <label className={`block text-sm font-medium uppercase tracking-[0.15em] mb-1.5 ${missing ? "text-amber-400" : "text-slate-500"}`}>
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
