"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Constants ─────────────────────────────────────────────────────────────────
const HOSPITAL: [number, number] = [43.6606, -79.3891];
const HOSPITAL_NAME = "Princess Margaret Hospital";

const MOCK_PATIENTS = [
  {
    id: 1, name: "Unit 1",
    patient: { first: "James", last: "Okafor", age: 62, sex: "M" },
    chief_complaint: "Chest pain radiating to left arm",
    ctas: 2, ctas_label: "EMERGENT",
    transcript: [
      "Dispatch, Unit 1 en route to PMH.",
      "Male, 62, sudden onset chest pain — started about 20 minutes ago, radiates left arm.",
      "Patient diaphoretic, pale, short of breath. BP 168 over 96, pulse 112, SpO2 91%, RR 22.",
      "GCS 15, pain 8 out of 10. History of hypertension and cardiac disease.",
      "Meds: ASA, metoprolol, nitroglycerin PRN. No known allergies.",
      "Started O2 at 4L, administered 324mg ASA. IV access established.",
      "ETA approximately 6 minutes. Requesting cath lab standby.",
    ],
    vitals: { hr: 112, spo2: 91, sbp: 168, dbp: 96, rr: 22, gcs: 15, pain: 8 },
    warnings: ["HR 112 — elevated", "SpO2 91% — below threshold", "BP 168/96 — hypertensive"],
    missing: ["weight_kg", "date_of_birth"],
  },
  {
    id: 2, name: "Unit 2",
    patient: { first: "Sarah", last: "Tremblay", age: 34, sex: "F" },
    chief_complaint: "Shortness of breath, acute asthma exacerbation",
    ctas: 2, ctas_label: "EMERGENT",
    transcript: [
      "Dispatch, Unit 2 responding, female 34 with severe asthma attack.",
      "Patient found in tripod position, using accessory muscles. Audible wheeze.",
      "SpO2 88% on room air, RR 32, HR 124, BP 142 over 88.",
      "History of asthma — on Ventolin and Flovent. No other allergies.",
      "Administered salbutamol 5mg via nebulizer, SpO2 improving to 93%.",
      "GCS 15, patient anxious but cooperative. Pain 4 out of 10, chest tightness.",
      "ETA 9 minutes. Requesting respiratory team notification.",
    ],
    vitals: { hr: 124, spo2: 93, sbp: 142, dbp: 88, rr: 32, gcs: 15, pain: 4 },
    warnings: ["HR 124 — elevated", "RR 32 — critically high"],
    missing: ["weight_kg", "last_name"],
  },
  {
    id: 3, name: "Unit 3",
    patient: { first: "Robert", last: "Chen", age: 78, sex: "M" },
    chief_complaint: "Altered consciousness, possible stroke",
    ctas: 1, ctas_label: "RESUSCITATION",
    transcript: [
      "Dispatch, Unit 3 — urgent. Male 78, suspected CVA.",
      "Found unresponsive by family, now GCS 10 — E3 V3 M4.",
      "Facial droop right side, left arm weakness, slurred speech.",
      "BP 196 over 108, HR 88 irregular, SpO2 94%, RR 18.",
      "Last known well 45 minutes ago. History of atrial fibrillation, on warfarin.",
      "Airway maintained, O2 15L non-rebreather. IV access 18G right AC.",
      "ETA 4 minutes. STROKE ALERT — requesting CT and neurology standby.",
    ],
    vitals: { hr: 88, spo2: 94, sbp: 196, dbp: 108, rr: 18, gcs: 10, pain: null },
    warnings: ["BP 196/108 — hypertensive emergency", "GCS 10 — altered consciousness"],
    missing: ["weight_kg", "allergies"],
  },
  {
    id: 4, name: "Unit 4",
    patient: { first: "Maria", last: "Gonzalez", age: 45, sex: "F" },
    chief_complaint: "Diabetic emergency — hypoglycaemia",
    ctas: 3, ctas_label: "URGENT",
    transcript: [
      "Unit 4 responding, female 45 diabetic emergency.",
      "Patient confused, diaphoretic, found by coworker. Blood glucose 2.1 mmol per litre.",
      "HR 98, BP 128 over 78, SpO2 98%, RR 16. GCS 12.",
      "History of Type 1 diabetes. Meds: insulin glargine, metformin.",
      "Administered 25g D50W IV push. Blood glucose rising — recheck 4.8.",
      "Patient becoming more alert. No trauma noted. Pain 0 out of 10.",
      "ETA 12 minutes. Monitoring closely.",
    ],
    vitals: { hr: 98, spo2: 98, sbp: 128, dbp: 78, rr: 16, gcs: 12, pain: 0 },
    warnings: [],
    missing: ["weight_kg", "allergies", "date_of_birth"],
  },
  {
    id: 5, name: "Unit 5",
    patient: { first: "Derek", last: "Walsh", age: 29, sex: "M" },
    chief_complaint: "Penetrating trauma — stab wound to abdomen",
    ctas: 1, ctas_label: "RESUSCITATION",
    transcript: [
      "Dispatch, Unit 5 — TRAUMA. Male 29, stab wound right upper quadrant.",
      "Single puncture wound, moderate bleeding controlled with direct pressure.",
      "BP 94 over 62 and dropping — hypotensive. HR 138, SpO2 96%, RR 26.",
      "GCS 14, patient agitated. Pain 9 out of 10. Mechanism: assaulted with knife.",
      "Two large bore IVs, wide open crystalloid. C-spine not indicated.",
      "Trauma dressing applied, patient packaged on backboard.",
      "ETA 3 minutes. TRAUMA ALERT — activate major trauma protocol.",
    ],
    vitals: { hr: 138, spo2: 96, sbp: 94, dbp: 62, rr: 26, gcs: 14, pain: 9 },
    warnings: ["HR 138 — critically elevated", "BP 94/62 — hypotensive shock"],
    missing: ["first_name", "last_name", "allergies", "weight_kg"],
  },
];

const AMBULANCE_STARTS: [number, number][] = [
  [43.6532, -79.3832],
  [43.6879, -79.3953],
  [43.7200, -79.2900],
  [43.6500, -79.5100],
  [43.7720, -79.4150],
];

const CTAS_COLORS: Record<number, { bg: string; border: string; text: string; dot: string }> = {
  1: { bg: "#450a0a", border: "#dc2626", text: "#fca5a5", dot: "#ef4444" },
  2: { bg: "#431407", border: "#ea580c", text: "#fdba74", dot: "#f97316" },
  3: { bg: "#422006", border: "#ca8a04", text: "#fde047", dot: "#eab308" },
  4: { bg: "#0c1a2e", border: "#0ea5e9", text: "#7dd3fc", dot: "#38bdf8" },
  5: { bg: "#052e16", border: "#16a34a", text: "#86efac", dot: "#22c55e" },
};

// ── OSRM ──────────────────────────────────────────────────────────────────────
async function fetchRoute(from: [number, number], to: [number, number]): Promise<{ coords: [number, number][]; distanceM: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) return null;
    const coords: [number, number][] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
    return { coords, distanceM: route.distance };
  } catch { return null; }
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function makeAmbIcon(unitId: number, ctas: number, selected: boolean) {
  const c = CTAS_COLORS[ctas];
  const size = selected ? 52 : 44;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;background:${c.bg};border:2.5px solid ${c.border};border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;box-shadow:0 0 ${selected ? 28 : 16}px ${c.dot}90;cursor:pointer;">
      <span style="font-size:${selected ? 24 : 20}px;line-height:1">🚑</span>
      <span style="color:${c.text};font-size:10px;font-weight:800;letter-spacing:1px;margin-top:1px">U${unitId}</span>
    </div>`,
  });
}

function makeHospIcon() {
  return L.divIcon({
    className: "",
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    html: `<div style="width:52px;height:52px;background:#1e1b4b;border:2.5px solid #818cf8;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 0 24px #818cf8aa;">🏥</div>`,
  });
}

// ── TTS ───────────────────────────────────────────────────────────────────────
function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.05; utt.pitch = 0.95;
  const voices = window.speechSynthesis.getVoices();
  const male = voices.find(v => v.lang.startsWith("en") && /male|guy|david|mark|daniel/i.test(v.name));
  if (male) utt.voice = male;
  window.speechSynthesis.speak(utt);
}

// ── Interpolate position along coords ────────────────────────────────────────
function interpolatePos(coords: [number, number][], progress: number): [number, number] {
  if (coords.length < 2) return coords[0];
  const rawIdx = progress * (coords.length - 1);
  const idx = Math.min(Math.floor(rawIdx), coords.length - 2);
  const t = rawIdx - idx;
  const a = coords[idx], b = coords[idx + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AmbulanceMap() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Per-unit Leaflet layer refs — mutated directly, never via React state
  const markerRefs = useRef<Record<number, L.Marker>>({});
  const traveledRefs = useRef<Record<number, L.Polyline>>({});
  const remainingRefs = useRef<Record<number, L.Polyline>>({});
  const frozenLineRef = useRef<L.Polyline | null>(null); // full route for selected unit

  // Animation data — pure refs, no React state
  const animRef = useRef<Record<number, { coords: [number, number][]; distanceM: number; progress: number }>>({});
  const selectedIdRef = useRef<number | null>(null);

  // React state only for: side panel content + transcript + UI toggles
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [transcriptIndex, setTranscriptIndex] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  // ETA for side panel — updated on click, not on every tick
  const [etaMin, setEtaMin] = useState<number | null>(null);

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: HOSPITAL,
      zoom: 12,
      zoomControl: true,
    });
    mapRef.current = map;

    // Remove Leaflet attribution
    map.attributionControl.remove();

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png").addTo(map);

    // Hospital marker
    L.marker(HOSPITAL, { icon: makeHospIcon() }).addTo(map);

    // Create per-unit layers
    MOCK_PATIENTS.forEach((p) => {
      const c = CTAS_COLORS[p.ctas];

      // Traveled (dashed, dim)
      traveledRefs.current[p.id] = L.polyline([], {
        color: c.dot, weight: 2, opacity: 0.25, dashArray: "4 6",
      }).addTo(map);

      // Remaining (solid)
      remainingRefs.current[p.id] = L.polyline([], {
        color: c.dot, weight: 3, opacity: 0.6,
      }).addTo(map);

      // Marker
      const marker = L.marker(AMBULANCE_STARTS[p.id - 1], {
        icon: makeAmbIcon(p.id, p.ctas, false),
        zIndexOffset: 100,
      }).addTo(map);
      marker.on("click", () => handleUnitClick(p.id));
      markerRefs.current[p.id] = marker;
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch routes ───────────────────────────────────────────────────────────
  useEffect(() => {
    MOCK_PATIENTS.forEach(async (p, i) => {
      const result = await fetchRoute(AMBULANCE_STARTS[i], HOSPITAL);
      if (!result) return;
      animRef.current[p.id] = { ...result, progress: 0 };
      // Draw initial remaining line
      remainingRefs.current[p.id]?.setLatLngs(result.coords);
    });
  }, []);

  // ── Animation loop — pure Leaflet mutations, zero React setState ───────────
  useEffect(() => {
    const TICK = 100;
    const id = setInterval(() => {
      const frozenId = selectedIdRef.current;
      MOCK_PATIENTS.forEach((p) => {
        const uid = p.id;
        if (uid === frozenId) return; // frozen unit never moves
        const anim = animRef.current[uid];
        if (!anim || anim.coords.length < 2) return;

        const speedMs = p.ctas === 1 ? 16 : p.ctas === 2 ? 14 : 11;
        const newProgress = anim.progress + (speedMs * TICK / 1000) / anim.distanceM;
        anim.progress = newProgress >= 1 ? 0 : newProgress;

        const splitIdx = Math.max(1, Math.floor(anim.progress * anim.coords.length));
        const pos = interpolatePos(anim.coords, anim.progress);

        // Mutate Leaflet layers directly — no React re-render
        markerRefs.current[uid]?.setLatLng(pos);
        traveledRefs.current[uid]?.setLatLngs(anim.coords.slice(0, splitIdx + 1));
        remainingRefs.current[uid]?.setLatLngs(anim.coords.slice(splitIdx));
      });
    }, TICK);
    return () => clearInterval(id);
  }, []);

  // ── Click handler ──────────────────────────────────────────────────────────
  const handleUnitClick = useCallback((unitId: number) => {
    const prev = selectedIdRef.current;

    // Restore previous selected unit to normal animated state
    if (prev !== null) {
      markerRefs.current[prev]?.setIcon(makeAmbIcon(prev, MOCK_PATIENTS.find(p => p.id === prev)!.ctas, false));
      // Remove frozen line
      if (frozenLineRef.current && mapRef.current) {
        mapRef.current.removeLayer(frozenLineRef.current);
        frozenLineRef.current = null;
      }
      // Restore traveled/remaining visibility
      traveledRefs.current[prev]?.setStyle({ opacity: 0.25 });
      remainingRefs.current[prev]?.setStyle({ opacity: 0.6 });
    }

    if (prev === unitId) {
      // Deselect
      selectedIdRef.current = null;
      setSelectedId(null);
      setEtaMin(null);
      return;
    }

    // Select new unit
    selectedIdRef.current = unitId;
    setSelectedId(unitId);
    setTranscriptIndex(0);

    const patient = MOCK_PATIENTS.find(p => p.id === unitId)!;
    const anim = animRef.current[unitId];

    // Update icon to selected style
    markerRefs.current[unitId]?.setIcon(makeAmbIcon(unitId, patient.ctas, true));

    // Hide the animated traveled/remaining lines for this unit
    traveledRefs.current[unitId]?.setLatLngs([]);
    remainingRefs.current[unitId]?.setLatLngs([]);

    // Draw a frozen full-route line that never moves
    if (anim && mapRef.current) {
      const c = CTAS_COLORS[patient.ctas];
      frozenLineRef.current = L.polyline(anim.coords, {
        color: c.dot, weight: 4, opacity: 0.9,
      }).addTo(mapRef.current);
    }

    // Compute ETA once at click time — static for this selection
    if (anim) {
      const speedMs = patient.ctas === 1 ? 16 : patient.ctas === 2 ? 14 : 11;
      const eta = Math.max(1, Math.round(((1 - anim.progress) * anim.distanceM) / speedMs / 60));
      setEtaMin(eta);
    }

    // Fly to unit
    const pos = markerRefs.current[unitId]?.getLatLng();
    if (pos && mapRef.current) {
      mapRef.current.flyTo(pos, 14, { duration: 1 });
    }
  }, []);

  // ── Transcript playback ────────────────────────────────────────────────────
  useEffect(() => {
    window.speechSynthesis?.cancel();
    if (selectedId === null) return;
    setTranscriptIndex(0);
    const patient = MOCK_PATIENTS.find(p => p.id === selectedId);
    if (!patient) return;
    let i = 0;
    const scheduleNext = (): ReturnType<typeof setTimeout> => setTimeout(() => {
      i++;
      setTranscriptIndex(i);
      if (audioEnabled && i < patient.transcript.length) speak(patient.transcript[i]);
      if (i < patient.transcript.length - 1) scheduleNext();
    }, 1400);
    if (audioEnabled) speak(patient.transcript[0]);
    const t = scheduleNext();
    return () => { clearTimeout(t); window.speechSynthesis?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, audioEnabled]);

  const selectedPatient = MOCK_PATIENTS.find(p => p.id === selectedId) ?? null;

  return (
    <div className="relative w-full h-full flex overflow-hidden">

      {/* ── MAP DIV — Leaflet renders directly here ── */}
      <div className="flex-1 h-full relative">
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

        {/* Unit list overlay */}
        <div className="absolute top-4 left-4 z-[1000] space-y-2">
          {MOCK_PATIENTS.map((p) => {
            const c = CTAS_COLORS[p.ctas];
            const isSel = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => handleUnitClick(p.id)}
                style={{ background: isSel ? c.bg : "rgba(2,6,23,0.88)", border: `1.5px solid ${isSel ? c.border : "#1e293b"}` }}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all hover:opacity-90 w-72"
              >
                <span style={{ color: c.dot, fontSize: 16 }}>●</span>
                <span style={{ color: c.text }} className="font-black text-base w-10 shrink-0">U{p.id}</span>
                <span className="text-slate-300 text-sm font-medium truncate flex-1 text-left">{p.chief_complaint}</span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-slate-900/92 border border-slate-700 rounded-xl p-4 space-y-2">
          <div className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">CTAS Level</div>
          {[1, 2, 3, 4, 5].map((lvl) => {
            const labels = ["Resuscitation", "Emergent", "Urgent", "Less Urgent", "Non-Urgent"];
            const c = CTAS_COLORS[lvl];
            return (
              <div key={lvl} className="flex items-center gap-2.5">
                <div style={{ width: 11, height: 11, borderRadius: 3, background: c.dot, flexShrink: 0 }} />
                <span style={{ color: c.text }} className="text-sm">{lvl} — {labels[lvl - 1]}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2.5 mt-1 pt-2 border-t border-slate-700">
            <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#818cf8", flexShrink: 0 }} />
            <span className="text-indigo-300 text-sm">{HOSPITAL_NAME}</span>
          </div>
        </div>

        {/* Audio toggle */}
        <button
          onClick={() => setAudioEnabled(v => !v)}
          className={`absolute bottom-4 right-4 z-[1000] flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-all ${audioEnabled ? "bg-sky-900/80 border-sky-500 text-sky-300" : "bg-slate-900/88 border-slate-700 text-slate-400 hover:border-slate-500"}`}
        >
          {audioEnabled ? "🔊" : "🔇"}
          <span>{audioEnabled ? "Audio On" : "Audio Off"}</span>
        </button>
      </div>

      {/* ── SIDE PANEL ── */}
      {selectedPatient && (
        <div className="w-[420px] h-full flex flex-col overflow-hidden border-l border-slate-800 bg-slate-950" style={{ flexShrink: 0 }}>

          <div
            style={{ background: CTAS_COLORS[selectedPatient.ctas].bg, borderBottom: `1px solid ${CTAS_COLORS[selectedPatient.ctas].border}` }}
            className="p-5 flex items-start justify-between gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span style={{ background: CTAS_COLORS[selectedPatient.ctas].dot, color: "#000" }} className="text-xs font-black px-3 py-1 rounded-full tracking-widest">
                  CTAS {selectedPatient.ctas} — {selectedPatient.ctas_label}
                </span>
                <span className="text-slate-400 text-sm font-mono">{selectedPatient.name}</span>
              </div>
              <div className="text-white font-black text-xl leading-tight">{selectedPatient.patient.last}, {selectedPatient.patient.first}</div>
              <div className="text-slate-300 text-base mt-1">{selectedPatient.patient.age}y {selectedPatient.patient.sex} · {selectedPatient.chief_complaint}</div>
            </div>
            <button onClick={() => handleUnitClick(selectedPatient.id)} className="text-slate-500 hover:text-white text-2xl leading-none cursor-pointer shrink-0 mt-0.5">×</button>
          </div>

          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏥</span>
              <span className="text-slate-200 font-semibold text-base">{HOSPITAL_NAME}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black font-mono text-white tabular-nums">{etaMin ?? "—"}</span>
              <span className="text-slate-400 text-base">min ETA</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px bg-slate-800 border-b border-slate-800">
            {[
              { label: "HR",    value: `${selectedPatient.vitals.hr}`,                                              unit: "bpm",  color: "#38bdf8" },
              { label: "SpO₂", value: `${selectedPatient.vitals.spo2}`,                                             unit: "%",    color: "#22d3ee" },
              { label: "BP",   value: `${selectedPatient.vitals.sbp}/${selectedPatient.vitals.dbp}`,                unit: "mmHg", color: "#fbbf24" },
              { label: "RR",   value: `${selectedPatient.vitals.rr}`,                                               unit: "/min", color: "#60a5fa" },
              { label: "GCS",  value: `${selectedPatient.vitals.gcs}`,                                              unit: "/15",  color: "#a78bfa" },
              { label: "PAIN", value: selectedPatient.vitals.pain != null ? `${selectedPatient.vitals.pain}` : "—", unit: "/10",  color: "#f472b6" },
            ].map(v => (
              <div key={v.label} className="bg-slate-950 p-4">
                <div className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1.5">{v.label}</div>
                <div className="flex items-baseline gap-1">
                  <span style={{ color: v.color }} className="text-2xl font-black font-mono tabular-nums">{v.value}</span>
                  <span className="text-slate-600 text-xs">{v.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {selectedPatient.warnings.length > 0 && (
            <div className="px-5 py-3 border-b border-slate-800 bg-red-950/25 space-y-1.5">
              {selectedPatient.warnings.map((w, i) => (
                <div key={i} className="flex gap-2 text-sm text-red-300"><span className="text-red-500 shrink-0">⚠</span>{w}</div>
              ))}
            </div>
          )}

          {selectedPatient.missing.length > 0 && (
            <div className="px-5 py-3 border-b border-slate-800 bg-amber-950/20">
              <div className="text-xs font-bold tracking-widest text-amber-500 uppercase mb-2">Missing Fields</div>
              <div className="flex flex-wrap gap-2">
                {selectedPatient.missing.map(f => (
                  <span key={f} className="text-sm px-3 py-1 rounded-lg border border-amber-700/40 text-amber-300 bg-amber-900/20">{f.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span className="text-sm font-bold tracking-widest text-red-400 uppercase">Live Radio Transcript</span>
              {audioEnabled && <span className="ml-auto text-xs text-sky-400 font-semibold">🔊 Speaking</span>}
            </div>
            <div className="space-y-3">
              {selectedPatient.transcript.slice(0, transcriptIndex + 1).map((line, i) => (
                <div key={i} className="text-base text-slate-200 leading-relaxed pl-4 border-l-2 border-slate-700"
                  style={{ animation: "fadeIn 0.35s ease", opacity: i === transcriptIndex ? 0.65 : 1 }}>
                  {line}
                </div>
              ))}
              {transcriptIndex < selectedPatient.transcript.length - 1 && (
                <div className="text-slate-600 text-base pl-4 animate-pulse">…</div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .leaflet-container { background: #0f172a; }
      `}</style>
    </div>
  );
}
