"use client";

import { useEffect, useRef, useState } from "react";
import VoiceInput from "./components/VoiceInput";

interface Vitals {
  pulse_rate: number;
  spo2: number;
  bp_systolic: number;
  bp_diastolic: number;
  resp_rate: number;
  temp: number;
}

const WIDTH = 800;
const HEIGHT = 220;
const BASELINE = 140;
const ERASER_WIDTH = 24;
const SPEED = 2;

const BEAT_SHAPE: [number, number][] = [
  [0.00,  0.00],
  [0.05, -0.06],
  [0.10,  0.03],
  [0.15,  0.00],
  [0.20,  0.10],
  [0.25, -1.00],
  [0.30,  0.45],
  [0.38, -0.10],
  [0.48, -0.20],
  [0.58, -0.04],
  [0.65,  0.00],
  [1.00,  0.00],
];

function bpToAmplitude(systolic: number): number {
  const clamped = Math.max(90, Math.min(180, systolic));
  return 55 + ((clamped - 90) / 90) * 35;
}

function sampleBeat(t: number, amplitude: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < BEAT_SHAPE.length - 1; i++) {
    const [t0, dy0] = BEAT_SHAPE[i];
    const [t1, dy1] = BEAT_SHAPE[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const frac = (clamped - t0) / (t1 - t0);
      return BASELINE + (dy0 + (dy1 - dy0) * frac) * amplitude;
    }
  }
  return BASELINE;
}

export default function Home() {
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [connected, setConnected] = useState(false);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement>(null);
  const vitalsRef = useRef<Vitals>({
    pulse_rate: 75,
    spo2: 98,
    bp_systolic: 120,
    bp_diastolic: 80,
    resp_rate: 16,
    temp: 37.0,
  });

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/vitals");
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const data: Vitals = JSON.parse(event.data);
      setVitals(data);
      vitalsRef.current = data;
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const waveCanvas = waveCanvasRef.current;
    const dotCanvas = dotCanvasRef.current;
    if (!waveCanvas || !dotCanvas) return;

    const wctx = waveCanvas.getContext("2d")!;
    const dctx = dotCanvas.getContext("2d")!;

    // Build offscreen grid canvas
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = WIDTH;
    gridCanvas.height = HEIGHT;
    const gctx = gridCanvas.getContext("2d")!;
    gctx.fillStyle = "#000";
    gctx.fillRect(0, 0, WIDTH, HEIGHT);
    gctx.strokeStyle = "#0d2b0d";
    gctx.lineWidth = 0.5;
    for (let x = 0; x <= WIDTH; x += 10) {
      gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, HEIGHT); gctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 10) {
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(WIDTH, y); gctx.stroke();
    }
    gctx.strokeStyle = "#0f3b0f";
    gctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 50) {
      gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, HEIGHT); gctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 50) {
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(WIDTH, y); gctx.stroke();
    }

    wctx.drawImage(gridCanvas, 0, 0);

    let cursorX = 0;
    let beatPx = 0;
    let prevY = BASELINE;
    let animId: number;

    const draw = () => {
      const { pulse_rate, bp_systolic } = vitalsRef.current;
      const pxPerBeat = (SPEED * 60) / (pulse_rate / 60);
      const amplitude = bpToAmplitude(bp_systolic);

      // Erase band ahead on wave canvas
      const eraseStart = (cursorX + SPEED + 2) % WIDTH;
      const eraseEnd = eraseStart + ERASER_WIDTH;
      if (eraseEnd <= WIDTH) {
        wctx.drawImage(gridCanvas, eraseStart, 0, ERASER_WIDTH, HEIGHT, eraseStart, 0, ERASER_WIDTH, HEIGHT);
      } else {
        const part1 = WIDTH - eraseStart;
        wctx.drawImage(gridCanvas, eraseStart, 0, part1, HEIGHT, eraseStart, 0, part1, HEIGHT);
        wctx.drawImage(gridCanvas, 0, 0, eraseEnd - WIDTH, HEIGHT, 0, 0, eraseEnd - WIDTH, HEIGHT);
      }

      const t = beatPx / pxPerBeat;
      const currentY = sampleBeat(t, amplitude);
      const nextX = (cursorX + SPEED) % WIDTH;

      // Draw waveform line — no shadow on wave canvas
      wctx.shadowBlur = 0;
      wctx.strokeStyle = "#00ff88";
      wctx.lineWidth = 2;
      wctx.lineJoin = "round";
      wctx.lineCap = "round";

      if (nextX < cursorX) {
        wctx.beginPath();
        wctx.moveTo(cursorX, prevY);
        wctx.lineTo(WIDTH, currentY);
        wctx.stroke();
        wctx.beginPath();
        wctx.moveTo(0, currentY);
        wctx.lineTo(nextX, currentY);
        wctx.stroke();
      } else {
        wctx.beginPath();
        wctx.moveTo(cursorX, prevY);
        wctx.lineTo(nextX, currentY);
        wctx.stroke();
      }

      // Dot canvas: fully clear every frame, draw only the dot
      dctx.clearRect(0, 0, WIDTH, HEIGHT);
      dctx.shadowBlur = 12;
      dctx.shadowColor = "#ccffe8";
      dctx.fillStyle = "#ffffff";
      dctx.beginPath();
      dctx.arc(nextX, currentY, 4, 0, Math.PI * 2);
      dctx.fill();
      dctx.shadowBlur = 0;

      prevY = currentY;
      cursorX = nextX;
      beatPx = (beatPx + SPEED) % pxPerBeat;

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-mono">
      <div className="w-full max-w-4xl flex items-center justify-between mb-4">
        <h1 className="text-green-400 text-xl font-bold tracking-widest uppercase">
          EKG Monitor
        </h1>
        <span
          className={`text-xs px-3 py-1 rounded-full border ${
            connected
              ? "border-green-500 text-green-400"
              : "border-red-500 text-red-400"
          }`}
        >
          {connected ? "● LIVE" : "○ DISCONNECTED"}
        </span>
      </div>

      {/* Stacked canvases — dot on top via absolute positioning */}
      <div className="w-full max-w-4xl border border-green-900 rounded-lg overflow-hidden relative" style={{ height: HEIGHT }}>
        <canvas ref={waveCanvasRef} width={WIDTH} height={HEIGHT} className="absolute inset-0 w-full h-full block" />
        <canvas ref={dotCanvasRef} width={WIDTH} height={HEIGHT} className="absolute inset-0 w-full h-full block" />
        {vitals && (
          <div className="absolute top-3 right-4 text-right z-10">
            <div className="text-green-300 text-5xl font-bold leading-none">
              {vitals.pulse_rate}
            </div>
            <div className="text-green-600 text-xs tracking-widest">BPM</div>
          </div>
        )}
      </div>

      {vitals ? (
        <div className="w-full max-w-4xl grid grid-cols-4 gap-3 mt-4">
          <VitalBox label="SpO₂" value={`${vitals.spo2}%`} color="text-cyan-400" borderColor="border-cyan-800" />
          <VitalBox
            label="BP"
            value={`${vitals.bp_systolic}/${vitals.bp_diastolic}`}
            color="text-yellow-400"
            borderColor="border-yellow-800"
          />
          <VitalBox label="RESP" value={`${vitals.resp_rate} br/m`} color="text-blue-400" borderColor="border-blue-800" />
          <VitalBox label="HR" value={`${vitals.pulse_rate} bpm`} color="text-green-400" borderColor="border-green-800" />
        </div>
      ) : (
        <p className="mt-6 text-green-800 animate-pulse tracking-widest text-sm">
          WAITING FOR SIGNAL...
        </p>
      )}

      <VoiceInput />
    </main>
  );
}

function VitalBox({
  label,
  value,
  color,
  borderColor,
}: {
  label: string;
  value: string;
  color: string;
  borderColor: string;
}) {
  return (
    <div className={`bg-black border ${borderColor} rounded p-4`}>
      <p className="text-gray-500 text-xs tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
