"use client";

import {
  Document, Page, Text, View, StyleSheet, pdf,
} from "@react-pdf/renderer";

// ── Types (mirrors triage page PatientRecord) ─────────────────────────────────

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
  medications?: string[];
  relevant_past_history?: string[];
  allergies?: string;
  vitals?: Vitals;
  estimated_arrival_minutes?: number;
  gcs?: number;
  pain_scale?: number;
  notes?: string;
  general_appearance?: string;
  skin_colour?: string;
  skin_condition?: string;
}

interface TriageResponse {
  patient_record: PatientRecord;
  triage_level: number;
  triage_reasoning: string;
  missing_fields: string[];
  validation_warnings: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CTAS_COLORS: Record<number, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#ca8a04",
  4: "#0284c7",
  5: "#16a34a",
};
const CTAS_TEXT_COLORS: Record<number, string> = {
  1: "#ffffff",
  2: "#ffffff",
  3: "#000000",
  4: "#ffffff",
  5: "#ffffff",
};
const CTAS_LABELS: Record<number, string> = {
  1: "RESUSCITATION",
  2: "EMERGENT",
  3: "URGENT",
  4: "LESS URGENT",
  5: "NON-URGENT",
};

const PAST_HISTORY_OPTIONS = [
  "Previously Healthy", "Cardiac", "Stroke/TIA", "Seizure",
  "Psychiatric", "Cancer", "CNO", "Respiratory",
  "Hypertension", "Diabetes", "Anaphylaxis",
];

const MEDICATION_OPTIONS = [
  "None", "CNO", "Nitrates", "ASA",
  "Insulin/Oral Diabetic Meds", "Phosphodiesterase Inhibitors",
  "Blood thinner/Anticoagulants", "Salbutamol", "Furosemide",
];

const TREATMENT_PRIOR_OPTIONS = [
  "None", "Midwife", "EFRT", "Other Paramedic",
  "Nurse", "Physician", "Bystander", "Self",
  "CNO", "Other", "Fire", "Police",
];

// ── Styles ────────────────────────────────────────────────────────────────────

const BORDER = "0.5pt solid #555";
const BORDER_LIGHT = "0.5pt solid #999";
const SECTION_BG = "#c8c8c8";
const SUBSECTION_BG = "#e0e0e0";

const S = StyleSheet.create({
  page: {
    fontSize: 6.5,
    fontFamily: "Helvetica",
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 16,
    color: "#000",
  },

  // ── Page outer border ──
  pageBorder: {
    border: BORDER,
    flex: 1,
  },

  // ── Global header bar ──
  globalHeader: {
    flexDirection: "row",
    borderBottom: BORDER,
  },
  globalHeaderLeft: {
    flex: 1,
    padding: "2 4",
    borderRight: BORDER,
  },
  globalHeaderTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
  },
  globalHeaderSub: {
    fontSize: 5.5,
    color: "#444",
    marginTop: 1,
  },
  globalHeaderRight: {
    width: 120,
    padding: "2 4",
  },
  regNumLabel: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  regNumBox: {
    border: BORDER,
    height: 14,
    width: 100,
  },

  // ── CTAS badge ──
  ctasBadge: {
    padding: "3 7",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    minWidth: 68,
  },
  ctasLevel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  ctasName: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },

  // ── Section header ──
  sectionHeader: {
    backgroundColor: SECTION_BG,
    padding: "2 4",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderBottom: BORDER,
    borderTop: BORDER,
  },
  subsectionHeader: {
    backgroundColor: SUBSECTION_BG,
    padding: "1 4",
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
  },

  // ── Generic row ──
  row: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
  },

  // ── Cell/field container ──
  cell: {
    padding: "1 3",
    borderRight: BORDER_LIGHT,
    justifyContent: "flex-end",
  },
  cellNoBorderRight: {
    padding: "1 3",
    justifyContent: "flex-end",
  },
  fieldLabel: {
    fontSize: 5.5,
    color: "#444",
    fontFamily: "Helvetica-Bold",
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 7,
    minHeight: 8,
  },
  fieldValueLine: {
    fontSize: 7,
    minHeight: 8,
    borderBottom: "0.5pt solid #bbb",
  },

  // ── Checkbox ──
  checkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: "2 3",
    gap: 5,
  },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  checkbox: {
    width: 7,
    height: 7,
    border: "0.5pt solid #333",
  },
  checkboxFilled: {
    width: 7,
    height: 7,
    border: "0.5pt solid #333",
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: {
    fontSize: 6,
  },

  // ── Vitals table ──
  vitalsTable: {
    borderLeft: BORDER,
    borderTop: BORDER,
  },
  vitalsHeaderRow: {
    flexDirection: "row",
    backgroundColor: SUBSECTION_BG,
    borderBottom: BORDER,
  },
  vitalsDataRow: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
    minHeight: 11,
  },
  vitalsHeaderCell: {
    flex: 1,
    padding: "1 1",
    borderRight: BORDER,
    fontSize: 5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  vitalsDataCell: {
    flex: 1,
    padding: "1 1",
    borderRight: BORDER,
    fontSize: 6.5,
    textAlign: "center",
  },

  // ── Remarks / multi-line ──
  multiLine: {
    minHeight: 30,
    padding: "2 3",
    fontSize: 7,
  },
  multiLineSmall: {
    minHeight: 20,
    padding: "2 3",
    fontSize: 7,
  },

  // ── Table for trauma / physical exam ──
  tableRow: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
  },
  tableCell: {
    flex: 1,
    padding: "1 3",
    borderRight: BORDER_LIGHT,
    fontSize: 6.5,
  },
  tableCellHeader: {
    flex: 1,
    padding: "1 3",
    borderRight: BORDER_LIGHT,
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    backgroundColor: SUBSECTION_BG,
  },

  // ── Call events ──
  callEventRow: {
    flexDirection: "row",
  },
  callEventCell: {
    flex: 1,
    padding: "1 3",
    borderRight: BORDER_LIGHT,
    borderBottom: BORDER_LIGHT,
  },

  // ── Signatures ──
  sigRow: {
    flexDirection: "row",
    borderBottom: BORDER_LIGHT,
    minHeight: 14,
  },

  // ── Footer copy note ──
  copyNote: {
    padding: "2 4",
    fontSize: 5.5,
    textAlign: "center",
    borderTop: BORDER,
    color: "#333",
  },
});

// ── Helper utilities ──────────────────────────────────────────────────────────

function val(v?: string | number | null): string {
  return v != null && v !== "" ? String(v) : "";
}

function nowDate(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function nowTimeHMS(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CB({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={S.check}>
      <View style={checked ? S.checkboxFilled : S.checkbox}>
        {checked && <Text style={{ fontSize: 4.5, color: "#fff", textAlign: "center" }}>X</Text>}
      </View>
      <Text style={S.checkLabel}>{label}</Text>
    </View>
  );
}

function LabeledCell({
  label, value = "", flex = 1, noBorderRight = false, minH = 0,
}: {
  label: string; value?: string; flex?: number; noBorderRight?: boolean; minH?: number;
}) {
  return (
    <View style={[noBorderRight ? S.cellNoBorderRight : S.cell, { flex, minHeight: minH || undefined }]}>
      <Text style={S.fieldLabel}>{label}</Text>
      <Text style={S.fieldValue}>{value}</Text>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 1
// ══════════════════════════════════════════════════════════════════════════════

function Page1({ form, ctas, ctasColor, ctasTextColor, ctasLabel, dateStr, timeStr }: {
  form: PatientRecord;
  ctas: number;
  ctasColor: string;
  ctasTextColor: string;
  ctasLabel: string;
  dateStr: string;
  timeStr: string;
}) {
  const pastHistory = form.relevant_past_history ?? [];
  const medications = form.medications ?? [];
  const medsLower = medications.map(m => m.toLowerCase());
  const allergiesNKA = (form.allergies ?? "").toLowerCase().includes("nka");
  const allergiesOther = !allergiesNKA && !!form.allergies;

  function isPastHistory(opt: string) {
    return pastHistory.some(h =>
      h.toLowerCase().includes(opt.toLowerCase().split("/")[0].trim().toLowerCase())
    );
  }
  function isMed(opt: string) {
    if (opt === "None") return medications.length === 0;
    if (opt === "CNO") return false;
    const key = opt.toLowerCase().split("/")[0].substring(0, 7);
    return medsLower.some(m => m.includes(key));
  }

  const otherMeds = medications.filter(m => {
    const ml = m.toLowerCase();
    return !MEDICATION_OPTIONS.slice(2).some(opt =>
      ml.includes(opt.toLowerCase().split("/")[0].substring(0, 7))
    );
  });

  return (
    <Page size="A4" style={S.page}>
      <View style={S.pageBorder}>

        {/* ── Global Header ── */}
        <View style={S.globalHeader}>
          <View style={{ flex: 1, flexDirection: "row", borderRight: BORDER }}>
            <View style={{ flex: 1, padding: "3 5", borderRight: BORDER }}>
              <Text style={{ fontSize: 6, color: "#444" }}>Ministry of Health and Long-Term Care</Text>
              <Text style={{ fontSize: 6, color: "#555", fontStyle: "italic" }}>Confidential when completed</Text>
              <Text style={S.globalHeaderTitle}>Ambulance Call Report</Text>
              <Text style={S.globalHeaderSub}>Form 1881-45 (2017/01)</Text>
            </View>
            {/* CTAS Badge */}
            <View style={[S.ctasBadge, { backgroundColor: ctasColor }]}>
              <Text style={[S.ctasLevel, { color: ctasTextColor }]}>CTAS {ctas}</Text>
              <Text style={[S.ctasName, { color: ctasTextColor }]}>{ctasLabel}</Text>
            </View>
          </View>
          {/* Hospital Registration Number */}
          <View style={{ width: 110, padding: "3 4" }}>
            <Text style={S.regNumLabel}>Hospital Registration Number</Text>
            <View style={S.regNumBox} />
          </View>
        </View>

        {/* ════════════════ DEMOGRAPHICS ════════════════ */}
        <Text style={S.sectionHeader}>Demographics</Text>

        {/* Row 1: Service Name | Service No. | CACC/ACS | Call Number | Call Date */}
        <View style={S.row}>
          <LabeledCell label="Service Name" value="" flex={2.5} />
          <LabeledCell label="Service No." value="" flex={0.8} />
          <LabeledCell label="CACC / ACS" value="" flex={0.8} />
          <LabeledCell label="Call Number" value="" flex={0.8} />
          <LabeledCell label="Call Date (YYYY/MM/DD)" value={dateStr} flex={1.1} noBorderRight />
        </View>

        {/* Row 2: Last Name | First Name */}
        <View style={S.row}>
          <LabeledCell label="Last Name" value={val(form.last_name)} flex={1} />
          <LabeledCell label="First Name" value={val(form.first_name)} flex={1} noBorderRight />
        </View>

        {/* Row 3: Age | Sex | Weight | DOB | HIN | Version */}
        <View style={S.row}>
          <LabeledCell label="Age" value={val(form.age)} flex={0.4} />
          <LabeledCell label="Sex" value={val(form.sex)} flex={0.4} />
          <LabeledCell label="Weight (kg)" value={val(form.weight_kg)} flex={0.6} />
          <LabeledCell label="Date of Birth (YYYY/MM/DD)" value="" flex={1.1} />
          <LabeledCell label="Health Insurance Number" value="" flex={1.5} />
          <LabeledCell label="Version" value="" flex={0.4} noBorderRight />
        </View>

        {/* Row 4: Mailing Address */}
        <View style={S.row}>
          <LabeledCell label="Street No." value="" flex={0.6} />
          <LabeledCell label="Street Name" value="" flex={1.5} />
          <LabeledCell label="City / Town" value="" flex={1} />
          <LabeledCell label="Province" value="" flex={0.5} />
          <LabeledCell label="Postal Code" value="" flex={0.7} />
          <LabeledCell label="Country" value="" flex={0.6} noBorderRight />
        </View>

        {/* Row 5: Pick-up Location | Same as Mailing checkbox | Pick-up Code */}
        <View style={[S.row, { alignItems: "center" }]}>
          <LabeledCell label="Pick-up Location or Sending Facility" value="" flex={3} />
          <View style={[S.cell, { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3 }]}>
            <View style={S.checkbox} />
            <Text style={{ fontSize: 6 }}>Same as Mailing Address</Text>
          </View>
          <LabeledCell label="Pick-up Code" value="" flex={0.7} noBorderRight />
        </View>

        {/* ════════════════ CLINICAL INFORMATION ════════════════ */}
        <Text style={S.sectionHeader}>Clinical Information</Text>

        {/* Row: Date of Occurrence | Time of Occurrence | Chief Complaint | Positive for FREI */}
        <View style={[S.row, { alignItems: "center" }]}>
          <LabeledCell label="Date of Occurrence (YYYY/MM/DD)" value={dateStr} flex={1.2} />
          <LabeledCell label="Time of Occurrence (HH:MM)" value={timeStr} flex={0.8} />
          <LabeledCell label="Chief Complaint" value={val(form.chief_complaint)} flex={2.5} />
          <View style={[S.cell, { flex: 0.9, flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 3 }]}>
            <View style={S.checkbox} />
            <Text style={{ fontSize: 6 }}>Positive for FREI</Text>
          </View>
        </View>

        {/* Incident History + DNR + Trauma table (side-by-side) */}
        <View style={[S.row, { minHeight: 54 }]}>
          {/* Incident History - takes 60% */}
          <View style={{ flex: 3, borderRight: BORDER_LIGHT }}>
            <Text style={[S.fieldLabel, { padding: "2 3" }]}>Incident History</Text>
            <Text style={[S.fieldValue, { padding: "0 3 2 3" }]}>{val(form.incident_history)}</Text>
          </View>
          {/* Right side: DNR + Trauma */}
          <View style={{ flex: 2 }}>
            <View style={{ borderBottom: BORDER_LIGHT, padding: "1 3" }}>
              <Text style={S.fieldLabel}>MOHLTC DNR Confirmation Number</Text>
              <Text style={S.fieldValue}>{""}</Text>
            </View>
            {/* Trauma Problem Site/Type table */}
            <View>
              <View style={{ flexDirection: "row", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }}>
                <Text style={[S.tableCellHeader, { flex: 0.5, fontSize: 5.5 }]}>Trauma #</Text>
                <Text style={[S.tableCellHeader, { fontSize: 5.5 }]}>Location</Text>
                <Text style={[S.tableCellHeader, { fontSize: 5.5 }]}>Type</Text>
                <Text style={[S.tableCellHeader, { fontSize: 5.5, borderRight: "none" }]}>Mechanism</Text>
              </View>
              {[1, 2, 3].map(n => (
                <View key={n} style={{ flexDirection: "row", borderBottom: BORDER_LIGHT, minHeight: 9 }}>
                  <Text style={[S.tableCell, { flex: 0.5, fontSize: 5.5 }]}>{n}</Text>
                  <Text style={[S.tableCell, { fontSize: 5.5 }]}>{""}</Text>
                  <Text style={[S.tableCell, { fontSize: 5.5 }]}>{""}</Text>
                  <Text style={[S.tableCell, { fontSize: 5.5, borderRight: "none" }]}>{""}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Relevant Past History */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
              Relevant Past History{"    "}Provided by: Patient  /  Other:________________
            </Text>
            <View style={S.checkRow}>
              {PAST_HISTORY_OPTIONS.map(opt => (
                <CB key={opt} label={opt} checked={isPastHistory(opt)} />
              ))}
              <CB label="Other (list below)" checked={false} />
            </View>
            <View style={{ paddingHorizontal: 3, paddingBottom: 2 }}>
              <Text style={S.fieldLabel}>Details</Text>
              <Text style={S.fieldValueLine}>{""}</Text>
            </View>
          </View>
        </View>

        {/* Medications */}
        <View style={{ borderBottom: BORDER_LIGHT }}>
          <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
            Medications
          </Text>
          <View style={S.checkRow}>
            {MEDICATION_OPTIONS.map(opt => (
              <CB key={opt} label={opt} checked={isMed(opt)} />
            ))}
          </View>
          <View style={{ paddingHorizontal: 3, paddingBottom: 2 }}>
            <Text style={S.fieldLabel}>Other (list)</Text>
            <Text style={S.fieldValueLine}>{otherMeds.length > 0 ? otherMeds.join(", ") : ""}</Text>
          </View>
        </View>

        {/* Allergies */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
              Allergies
            </Text>
            <View style={[S.checkRow, { paddingBottom: 1 }]}>
              <CB label="NKA" checked={allergiesNKA} />
              <CB label="CNO" checked={false} />
              <CB label="Other" checked={allergiesOther} />
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Text style={S.fieldLabel}>Details</Text>
                <Text style={S.fieldValueLine}>{allergiesOther ? val(form.allergies) : ""}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Treatment Prior to Arrival */}
        <View style={{ borderBottom: BORDER_LIGHT }}>
          <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
            Treatment Prior to Arrival
          </Text>
          <View style={S.checkRow}>
            {TREATMENT_PRIOR_OPTIONS.map(opt => (
              <CB key={opt} label={opt} checked={false} />
            ))}
          </View>
          <View style={{ paddingHorizontal: 3, paddingBottom: 2 }}>
            <Text style={S.fieldLabel}>Details</Text>
            <Text style={S.fieldValueLine}>{""}</Text>
          </View>
        </View>

        {/* Cardiac Arrest Information */}
        <View style={{ borderBottom: BORDER_LIGHT }}>
          <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
            Cardiac Arrest Information
          </Text>
          <View style={{ flexDirection: "row" }}>
            {/* Header col */}
            <View style={{ width: 110, borderRight: BORDER_LIGHT }}>
              <Text style={[S.fieldLabel, { padding: "1 3", minHeight: 10 }]}>{""}</Text>
              <Text style={[S.fieldLabel, { padding: "2 3", borderTop: BORDER_LIGHT }]}>Arrest Witnessed By</Text>
              <Text style={[S.fieldLabel, { padding: "2 3", borderTop: BORDER_LIGHT }]}>CPR Started By</Text>
              <Text style={[S.fieldLabel, { padding: "2 3", borderTop: BORDER_LIGHT }]}>First Shock By</Text>
            </View>
            {/* Checkbox cols */}
            {["Bystander", "Trained Responder", "Paramedic", "Unwitnessed / None"].map(col => (
              <View key={col} style={{ flex: 1, borderRight: BORDER_LIGHT, alignItems: "center" }}>
                <Text style={[S.fieldLabel, { padding: "1 2", textAlign: "center" }]}>{col}</Text>
                {[0, 1, 2].map(i => (
                  <View key={i} style={{ borderTop: BORDER_LIGHT, width: "100%", alignItems: "center", padding: "2 0" }}>
                    <View style={S.checkbox} />
                  </View>
                ))}
              </View>
            ))}
            {/* Date + Start Time cols */}
            <View style={{ flex: 0.9, borderRight: BORDER_LIGHT }}>
              <Text style={[S.fieldLabel, { padding: "1 3" }]}>Date</Text>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ borderTop: BORDER_LIGHT, minHeight: 10, padding: "1 3" }} />
              ))}
            </View>
            <View style={{ flex: 0.9 }}>
              <Text style={[S.fieldLabel, { padding: "1 3" }]}>Start Time HH:MM</Text>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ borderTop: BORDER_LIGHT, minHeight: 10, padding: "1 3" }} />
              ))}
            </View>
          </View>
        </View>

        {/* ════════════════ PHYSICAL EXAM ════════════════ */}
        <Text style={S.sectionHeader}>Physical Exam</Text>

        {/* General Appearance | Skin Colour | Skin Condition */}
        <View style={S.row}>
          <LabeledCell label="General Appearance" value={val(form.general_appearance)} flex={2} />
          <LabeledCell label="Skin Colour" value={val(form.skin_colour)} flex={1} />
          <LabeledCell label="Skin Condition" value={val(form.skin_condition)} flex={1} noBorderRight />
        </View>

        {/* Head/Neck */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={[S.cell, { flex: 0.7 }]}>
            <Text style={S.fieldLabel}>Head / Neck</Text>
          </View>
          <View style={[S.cell, { flex: 1.5, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            <Text style={[S.fieldLabel, { marginRight: 4 }]}>Trachea:</Text>
            <CB label="Midline" checked={false} />
            <CB label="Shifted R" checked={false} />
            <CB label="Shifted L" checked={false} />
          </View>
          <View style={[S.cell, { flex: 1.5, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            <Text style={[S.fieldLabel, { marginRight: 4 }]}>JVD:</Text>
            <CB label="Elevated" checked={false} />
            <CB label="Not Elevated" checked={false} />
          </View>
          <View style={[S.cellNoBorderRight, { flex: 1 }]} />
        </View>

        {/* Chest */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={[S.cell, { flex: 0.7 }]}>
            <Text style={S.fieldLabel}>Chest</Text>
          </View>
          <View style={[S.cell, { flex: 1.5, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            <Text style={[S.fieldLabel, { marginRight: 2 }]}>Air Entry:</Text>
            <CB label="Bilaterally" checked={false} />
            <CB label="Decreased R" checked={false} />
            <CB label="Decreased L" checked={false} />
          </View>
          <View style={[S.cellNoBorderRight, { flex: 2.5, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            <Text style={[S.fieldLabel, { marginRight: 2 }]}>Breath Sounds:</Text>
            <CB label="Clear" checked={false} />
            <CB label="Wheezes" checked={false} />
            <CB label="Crackles" checked={false} />
            <CB label="Rub" checked={false} />
            <CB label="Absent" checked={false} />
          </View>
        </View>

        {/* Abdomen */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={[S.cell, { flex: 0.7 }]}>
            <Text style={S.fieldLabel}>Abdomen</Text>
          </View>
          <View style={[S.cellNoBorderRight, { flex: 4, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            {["Soft", "Rigid", "Distended", "Tender", "Mass", "Pulsatile",
              "RU Quad", "LU Quad", "LL Quad", "RL Quad", "Center"].map(opt => (
              <CB key={opt} label={opt} checked={false} />
            ))}
          </View>
        </View>

        {/* Back/Pelvis */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={[S.cell, { flex: 0.7 }]}>
            <Text style={S.fieldLabel}>Back / Pelvis</Text>
          </View>
          <View style={[S.cellNoBorderRight, { flex: 4, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            <CB label="Unremarkable" checked={false} />
          </View>
        </View>

        {/* Extremities */}
        <View style={[S.row, { alignItems: "center", borderBottom: "none" }]}>
          <View style={[S.cell, { flex: 0.7 }]}>
            <Text style={S.fieldLabel}>Extremities</Text>
          </View>
          <View style={[S.cellNoBorderRight, { flex: 4, flexDirection: "row", flexWrap: "wrap", gap: 4, paddingVertical: 2 }]}>
            <CB label="Unremarkable" checked={false} />
            <Text style={[S.fieldLabel, { marginLeft: 6, marginRight: 2 }]}>Peripheral Edema:</Text>
            <CB label="Absent" checked={false} />
            <CB label="Present" checked={false} />
            <Text style={[S.fieldLabel, { marginLeft: 6, marginRight: 2 }]}>Pedal Pulse:</Text>
            <CB label="Absent" checked={false} />
            <CB label="Present" checked={false} />
          </View>
        </View>

      </View>
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE 2
// ══════════════════════════════════════════════════════════════════════════════

function Page2({ form, ctas, ctasColor, ctasTextColor, ctasLabel, dateStr, timeStr }: {
  form: PatientRecord;
  ctas: number;
  ctasColor: string;
  ctasTextColor: string;
  ctasLabel: string;
  dateStr: string;
  timeStr: string;
}) {
  const bp = form.vitals?.blood_pressure_systolic && form.vitals?.blood_pressure_diastolic
    ? `${form.vitals.blood_pressure_systolic}/${form.vitals.blood_pressure_diastolic}`
    : "";

  const VITALS_HEADERS = [
    "Time\nHH:MM",
    "Procedure\nCode",
    "Dose /\nUnit",
    "Route",
    "Pulse\nRate",
    "Resp\nRate",
    "B/P\nSys/Dia",
    "Temp",
    "Reading/\nEtCO₂ Code",
    "SpO₂",
    "EtCO₂",
    "GCS",
    "Pupils\nR ± / L ±",
    "Pain\nScale",
    "Crew\nMbr No.",
  ];

  const emptyVitalsRows = 7;

  return (
    <Page size="A4" style={S.page}>
      <View style={S.pageBorder}>

        {/* ── Page 2 header ── */}
        <View style={[S.globalHeader, { alignItems: "center" }]}>
          <View style={{ flex: 1, flexDirection: "row", padding: "3 5", borderRight: BORDER, alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={S.fieldLabel}>Call Number</Text>
              <Text style={S.fieldValue}>{""}</Text>
            </View>
            <View style={{ flex: 0.5 }}>
              <Text style={S.fieldLabel}>Page</Text>
              <Text style={S.fieldValue}>2 of 2</Text>
            </View>
          </View>
          {/* CTAS badge repeated */}
          <View style={[S.ctasBadge, { backgroundColor: ctasColor, borderRight: BORDER }]}>
            <Text style={[S.ctasLevel, { color: ctasTextColor }]}>CTAS {ctas}</Text>
            <Text style={[S.ctasName, { color: ctasTextColor }]}>{ctasLabel}</Text>
          </View>
          <View style={{ width: 110, padding: "3 4" }}>
            <Text style={S.regNumLabel}>Hospital Registration Number</Text>
            <View style={S.regNumBox} />
          </View>
        </View>

        {/* ════════════════ CLINICAL TREATMENT / PROCEDURES ════════════════ */}
        <Text style={S.sectionHeader}>Clinical Treatment / Procedures with Results</Text>

        {/* Vitals table */}
        <View style={S.vitalsTable}>
          {/* Header */}
          <View style={S.vitalsHeaderRow}>
            {VITALS_HEADERS.map((h, i) => (
              <Text key={i} style={[S.vitalsHeaderCell, i === VITALS_HEADERS.length - 1 ? { borderRight: "none" } : {}]}>
                {h}
              </Text>
            ))}
          </View>
          {/* First data row: patient vitals */}
          <View style={S.vitalsDataRow}>
            <Text style={S.vitalsDataCell}>{timeStr}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={S.vitalsDataCell}>{val(form.vitals?.heart_rate)}</Text>
            <Text style={S.vitalsDataCell}>{val(form.vitals?.respiratory_rate)}</Text>
            <Text style={S.vitalsDataCell}>{bp}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={[S.vitalsDataCell]}>{val(form.vitals?.spo2)}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={S.vitalsDataCell}>{val(form.gcs)}</Text>
            <Text style={S.vitalsDataCell}>{""}</Text>
            <Text style={S.vitalsDataCell}>{val(form.pain_scale)}</Text>
            <Text style={[S.vitalsDataCell, { borderRight: "none" }]}>{""}</Text>
          </View>
          {/* Empty rows */}
          {Array.from({ length: emptyVitalsRows }).map((_, ri) => (
            <View key={ri} style={S.vitalsDataRow}>
              {VITALS_HEADERS.map((_, ci) => (
                <Text
                  key={ci}
                  style={[S.vitalsDataCell, ci === VITALS_HEADERS.length - 1 ? { borderRight: "none" } : {}]}
                >{""}</Text>
              ))}
            </View>
          ))}
        </View>

        {/* Remarks */}
        <View style={{ borderBottom: BORDER_LIGHT }}>
          <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
            Remarks
          </Text>
          <Text style={S.multiLine}>{val(form.notes)}</Text>
        </View>

        {/* Disposition of Effects */}
        <View style={[S.row, { alignItems: "center" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
              Disposition of Effects
            </Text>
            <View style={[S.checkRow, { paddingBottom: 2 }]}>
              <CB label="Receiving Staff" checked={false} />
              <CB label="Family" checked={false} />
              <CB label="Other" checked={false} />
            </View>
          </View>
        </View>

        {/* Primary Problem | Problem Code | Sp Trans Code | CTAS */}
        <View style={S.row}>
          <LabeledCell label="Primary Problem" value="" flex={2.5} />
          <LabeledCell label="Problem Code" value="" flex={0.8} />
          <LabeledCell label="Sp Trans Code" value="" flex={0.8} />
          <View style={[S.cell, { flex: 2 }]}>
            <Text style={S.fieldLabel}>CTAS</Text>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 1 }}>
              <View style={{ flex: 1 }}>
                <Text style={[S.fieldLabel, { fontSize: 5 }]}>Arrive Patient</Text>
                <Text style={S.fieldValue}>{ctas}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.fieldLabel, { fontSize: 5 }]}>Depart Scene</Text>
                <Text style={S.fieldValue}>{""}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.fieldLabel, { fontSize: 5 }]}>Arrive Destination</Text>
                <Text style={S.fieldValue}>{""}</Text>
              </View>
            </View>
          </View>
          <LabeledCell label="" value="" flex={0.4} noBorderRight />
        </View>

        {/* Deceased */}
        <View style={[S.row, { alignItems: "center", borderBottom: BORDER_LIGHT }]}>
          <View style={[S.cell, { flex: 0.5 }]}>
            <Text style={S.fieldLabel}>Deceased</Text>
          </View>
          <View style={[S.cellNoBorderRight, { flex: 4, flexDirection: "row", flexWrap: "wrap", gap: 5, paddingVertical: 2 }]}>
            <CB label="Obviously Dead" checked={false} />
            <CB label="DNR" checked={false} />
            <CB label="BHP TOR" checked={false} />
            <CB label="Pronounced by On Scene Physician" checked={false} />
          </View>
        </View>

        {/* ════════════════ GENERAL ADMINISTRATION ════════════════ */}
        <Text style={S.sectionHeader}>General Administration</Text>

        {/* Vehicle No. | Station | Status | Hospital No. | Receiving Facility */}
        <View style={S.row}>
          <LabeledCell label="Vehicle Number" value="" flex={0.7} />
          <LabeledCell label="Station" value="" flex={0.7} />
          <LabeledCell label="Status" value="" flex={0.7} />
          <LabeledCell label="Hospital Number" value="" flex={0.7} />
          <LabeledCell label="Receiving Facility / Destination" value="" flex={2.2} noBorderRight />
        </View>

        {/* UTM Code | Dispatch | Return | Patient | Sequence | Warning Systems */}
        <View style={S.row}>
          <LabeledCell label="UTM Code" value="" flex={0.7} />
          <LabeledCell label="Dispatch" value="" flex={0.7} />
          <LabeledCell label="Return" value="" flex={0.7} />
          <LabeledCell label="Patient" value="" flex={0.7} />
          <LabeledCell label="Sequence" value="" flex={0.7} />
          <View style={[S.cell, { flex: 1.5 }]}>
            <Text style={S.fieldLabel}>Warning Systems — To Scene</Text>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 1 }}>
              <CB label="None" checked={false} />
              <CB label="Emergency" checked={false} />
            </View>
          </View>
          <View style={[S.cellNoBorderRight, { flex: 1.5 }]}>
            <Text style={S.fieldLabel}>Warning Systems — To Destination</Text>
            <View style={{ flexDirection: "row", gap: 4, marginTop: 1 }}>
              <CB label="None" checked={false} />
              <CB label="Emergency" checked={false} />
            </View>
          </View>
        </View>

        {/* Base Hospital */}
        <View style={S.row}>
          <LabeledCell label="Base Hospital Name" value="" flex={1.5} />
          <LabeledCell label="Base Hospital Number" value="" flex={0.8} />
          <LabeledCell label="Base Hospital Physician Name / No. (if patch)" value="" flex={1.8} />
          <LabeledCell label="Patch Log Number" value="" flex={0.9} noBorderRight />
        </View>

        {/* Call Events */}
        <View style={{ borderBottom: BORDER_LIGHT }}>
          <Text style={[S.fieldLabel, { padding: "1 3", backgroundColor: SUBSECTION_BG, borderBottom: BORDER_LIGHT }]}>
            Call Events (HH:MM:SS)
          </Text>
          <View style={S.callEventRow}>
            {[
              ["Call Received", ""],
              ["Crew Notified", ""],
              ["Crew Mobile", ""],
              ["Arrive Scene", ""],
              ["Patient Contact", ""],
              ["Depart Scene", ""],
              ["Arrive Destination", ""],
              ["TOC", ""],
            ].map(([label, value], i) => (
              <View
                key={i}
                style={[
                  S.callEventCell,
                  i === 7 ? { borderRight: "none" } : {},
                  { flex: 1 },
                ]}
              >
                <Text style={S.fieldLabel}>{label}</Text>
                <Text style={S.fieldValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Paramedic signatures */}
        {[
          ["Paramedic 1 (Attending) No.", true],
          ["Paramedic 2 No.", false],
          ["Other", false],
          ["Other", false],
        ].map(([label, isFirst], i) => (
          <View key={i} style={S.sigRow}>
            <View style={[S.cell, { flex: 0.5 }]}>
              <Text style={S.fieldLabel}>{label as string}</Text>
              <Text style={S.fieldValue}>{""}</Text>
            </View>
            <View style={[S.cell, { flex: 0.7 }]}>
              <Text style={S.fieldLabel}>Designation</Text>
              <Text style={S.fieldValue}>{""}</Text>
            </View>
            <View style={[S.cell, { flex: 1.5 }]}>
              <Text style={S.fieldLabel}>Name</Text>
              <Text style={S.fieldValue}>{""}</Text>
            </View>
            <View style={[S.cellNoBorderRight, { flex: 1.3 }]}>
              <Text style={S.fieldLabel}>Signature No.{i + 1}</Text>
              <Text style={S.fieldValue}>{""}</Text>
            </View>
          </View>
        ))}

        {/* Date/Time of ACR Completion */}
        <View style={S.row}>
          <LabeledCell label="Date of ACR Completion (YYYY/MM/DD)" value={dateStr} flex={1.5} />
          <LabeledCell label="Time of ACR Completion (HH:MM)" value={timeStr} flex={1} noBorderRight />
          <View style={[S.cellNoBorderRight, { flex: 2.5 }]}>
            <Text style={S.fieldLabel}>Estimated Arrival (min)</Text>
            <Text style={S.fieldValue}>{val(form.estimated_arrival_minutes)}</Text>
          </View>
        </View>

        {/* Copy note footer */}
        <Text style={S.copyNote}>
          1 – Patient Chart Copy{"     "}2 – Billing Office Copy{"     "}3 – Base Hospital Copy{"     "}4 – Ambulance Service Copy
        </Text>

      </View>
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Document
// ══════════════════════════════════════════════════════════════════════════════

function AcrDocument({ data, form }: { data: TriageResponse; form: PatientRecord }) {
  const ctas = data.triage_level;
  const ctasColor = CTAS_COLORS[ctas] ?? "#555555";
  const ctasTextColor = CTAS_TEXT_COLORS[ctas] ?? "#ffffff";
  const ctasLabel = CTAS_LABELS[ctas] ?? "UNKNOWN";
  const dateStr = nowDate();
  const timeStr = nowTime();

  const shared = { form, ctas, ctasColor, ctasTextColor, ctasLabel, dateStr, timeStr };

  return (
    <Document title={`ACR - ${form.last_name ?? "Patient"}`} author="Genesis Triage System">
      <Page1 {...shared} />
      <Page2 {...shared} />
    </Document>
  );
}

// ── Export: download function ─────────────────────────────────────────────────

export async function downloadAcrPdf(data: TriageResponse, form: PatientRecord) {
  const blob = await pdf(<AcrDocument data={data} form={form} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ACR_${form.last_name ?? "patient"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
