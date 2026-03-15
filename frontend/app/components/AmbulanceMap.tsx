"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { WS_BASE } from "../config";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vitals {
  heart_rate: number;
  spo2: number;
  blood_pressure_systolic: number;
  blood_pressure_diastolic: number;
  respiratory_rate: number;
}

interface VitalOffset {
  hr: number;
  spo2: number;
  sbp: number;
  dbp: number;
  rr: number;
}

interface AmbulanceState {
  id: number;
  name: string;
  lat: number;
  lng: number;
  waypointIndex: number;
}

// ── Static config per ambulance ───────────────────────────────────────────────

const AMBULANCE_CONFIG = [
  {
    id: 1,
    name: "Unit 1",
    waypoints: [
      [43.6426, -79.3871],
      [43.6503, -79.3547],
      [43.6670, -79.3210],
      [43.6532, -79.3832],
    ] as [number, number][],
    speed: 0.0010,
    offset: { hr: 8, spo2: -1, sbp: 12, dbp: 6, rr: 2 },
  },
  {
    id: 2,
    name: "Unit 2",
    waypoints: [
      [43.6879, -79.3953],
      [43.6795, -79.3830],
      [43.7010, -79.4200],
      [43.7100, -79.3900],
    ] as [number, number][],
    speed: 0.0008,
    offset: { hr: -10, spo2: 0, sbp: -18, dbp: -9, rr: -4 },
  },
  {
    id: 3,
    name: "Unit 3",
    waypoints: [
      [43.6890, -79.2760],
      [43.7200, -79.2400],
      [43.7520, -79.3100],
      [43.7100, -79.3300],
    ] as [number, number][],
    speed: 0.0013,
    offset: { hr: 18, spo2: -3, sbp: 22, dbp: 11, rr: 6 },
  },
  {
    id: 4,
    name: "Unit 4",
    waypoints: [
      [43.6205, -79.5100],
      [43.6500, -79.4800],
      [43.7100, -79.4700],
      [43.6700, -79.5000],
    ] as [number, number][],
    speed: 0.0009,
    offset: { hr: -5, spo2: 1, sbp: 5, dbp: 2, rr: -2 },
  },
  {
    id: 5,
    name: "Unit 5",
    waypoints: [
      [43.7500, -79.4000],
      [43.7720, -79.4150],
      [43.7300, -79.3800],
      [43.7450, -79.3600],
    ] as [number, number][],
    speed: 0.0011,
    offset: { hr: 12, spo2: -2, sbp: -6, dbp: -3, rr: 4 },
  },
];

// ── Ambulance icon (custom DivIcon) ───────────────────────────────────────────

function makeAmbulanceIcon(unitId: number) {
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
    html: `
      <div style="
        width:40px;height:40px;
        background:#0ea5e9;
        border:2px solid #7dd3fc;
        border-radius:10px;
        display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        font-family:system-ui, sans-serif;
        box-shadow:0 0 14px rgba(14,165,233,0.5);
      ">
        <span style="font-size:18px;line-height:1">🚑</span>
        <span style="color:#e0f2fe;font-size:8px;font-weight:bold;letter-spacing:1px">U${unitId}</span>
      </div>`,
  });
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function applyOffset(base: Vitals, off: VitalOffset): Vitals {
  return {
    heart_rate: clamp(base.heart_rate + off.hr, 40, 200),
    spo2: clamp(base.spo2 + off.spo2, 85, 100),
    blood_pressure_systolic: clamp(base.blood_pressure_systolic + off.sbp, 70, 220),
    blood_pressure_diastolic: clamp(base.blood_pressure_diastolic + off.dbp, 40, 130),
    respiratory_rate: clamp(base.respiratory_rate + off.rr, 8, 40),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

const TICK_MS = 50; // animation interval

export default function AmbulanceMap() {
  // Positions for each ambulance
  const [units, setUnits] = useState<AmbulanceState[]>(
    AMBULANCE_CONFIG.map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      lat: cfg.waypoints[0][0],
      lng: cfg.waypoints[0][1],
      waypointIndex: 1,
    }))
  );

  // Latest vitals from WebSocket
  const baseVitalsRef = useRef<Vitals>({
    heart_rate: 75,
    spo2: 98,
    blood_pressure_systolic: 120,
    blood_pressure_diastolic: 80,
    respiratory_rate: 16,
  });
  const [baseVitals, setBaseVitals] = useState<Vitals>(baseVitalsRef.current);

  // Pre-build icons once on client
  const iconsRef = useRef<Record<number, L.DivIcon>>({});
  useEffect(() => {
    AMBULANCE_CONFIG.forEach((cfg) => {
      iconsRef.current[cfg.id] = makeAmbulanceIcon(cfg.id);
    });
  }, []);

  // WebSocket vitals
  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/vitals`);
    ws.onmessage = (e) => {
      const data: Vitals = JSON.parse(e.data);
      baseVitalsRef.current = data;
      setBaseVitals(data);
    };
    return () => ws.close();
  }, []);

  // Movement animation
  useEffect(() => {
    const id = setInterval(() => {
      setUnits((prev) =>
        prev.map((unit) => {
          const cfg = AMBULANCE_CONFIG.find((c) => c.id === unit.id)!;
          const target = cfg.waypoints[unit.waypointIndex];
          const dLat = target[0] - unit.lat;
          const dLng = target[1] - unit.lng;
          const dist = Math.sqrt(dLat * dLat + dLng * dLng);
          const step = cfg.speed * (TICK_MS / 1000);

          if (dist <= step) {
            return {
              ...unit,
              lat: target[0],
              lng: target[1],
              waypointIndex: (unit.waypointIndex + 1) % cfg.waypoints.length,
            };
          }
          return {
            ...unit,
            lat: unit.lat + (dLat / dist) * step,
            lng: unit.lng + (dLng / dist) * step,
          };
        })
      );
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full max-w-4xl mt-6 font-sans">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sky-400 text-sm font-bold tracking-widest uppercase">
          Dispatch Map — Toronto
        </h2>
        <span className="text-xs text-slate-500 tracking-widest">
          {AMBULANCE_CONFIG.length} UNITS ACTIVE
        </span>
      </div>

      <div
        className="w-full border border-slate-800 rounded-2xl overflow-hidden"
        style={{ height: 420 }}
      >
        <MapContainer
          center={[43.700, -79.390]}
          zoom={11}
          style={{ width: "100%", height: "100%" }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

          {units.map((unit) => {
            const cfg = AMBULANCE_CONFIG.find((c) => c.id === unit.id)!;
            const vitals = applyOffset(baseVitals, cfg.offset);
            const icon = iconsRef.current[unit.id];
            if (!icon) return null;

            return (
              <Marker
                key={unit.id}
                position={[unit.lat, unit.lng]}
                icon={icon}
                eventHandlers={{
                  mouseover: (e) => e.target.openPopup(),
                  mouseout: (e) => e.target.closePopup(),
                }}
              >
                <Popup
                  closeButton={false}
                  autoPan={false}
                  className="ambulance-popup"
                >
                  <VitalsPopup name={unit.name} vitals={vitals} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Vitals popup card ─────────────────────────────────────────────────────────

function VitalsPopup({ name, vitals }: { name: string; vitals: Vitals }) {
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 12,
        padding: "10px 14px",
        fontFamily: "system-ui, sans-serif",
        minWidth: 180,
      }}
    >
      <div
        style={{
          color: "#38bdf8",
          fontSize: 11,
          fontWeight: "bold",
          letterSpacing: "0.15em",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        {name} — Patient
      </div>
      <PopupRow label="HR"   value={`${vitals.heart_rate} bpm`}    color="#38bdf8" />
      <PopupRow label="SpO₂" value={`${vitals.spo2.toFixed(1)}%`}  color="#22d3ee" />
      <PopupRow
        label="BP"
        value={`${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}`}
        color="#fbbf24"
      />
      <PopupRow label="RESP" value={`${vitals.respiratory_rate} br/m`} color="#60a5fa" />
    </div>
  );
}

function PopupRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 4,
      }}
    >
      <span style={{ color: "#64748b", fontSize: 10, letterSpacing: "0.1em" }}>
        {label}
      </span>
      <span style={{ color, fontSize: 12, fontWeight: "bold" }}>{value}</span>
    </div>
  );
}
