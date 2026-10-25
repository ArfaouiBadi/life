import type { IncidentStatus, MetricKey, Role, Severity } from "@/api/contracts";

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** 1:47:20 above an hour, 11:04 below. */
export function formatTtd(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** "1 hour 47 minutes", for screen readers and sentences. */
export function ttdWords(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m || !h) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

/** Long horizons read better in sols or hours. */
export function horizonWords(seconds: number) {
  if (seconds > 2 * 88775) return `${Math.floor(seconds / 88775)} sols`;
  if (seconds > 3 * 3600) return `${Math.round(seconds / 3600)} hours`;
  return ttdWords(seconds);
}

export const SEVERITY_WORD: Record<Severity, string> = {
  NOMINAL: "Normal",
  ADVISORY: "Advisory",
  WARNING: "Warning",
  CRITICAL: "Critical",
  EMERGENCY: "Emergency",
};

export const SEVERITY_MEANING: Record<Severity, string> = {
  NOMINAL: "Everything is normal",
  ADVISORY: "Something to plan for",
  WARNING: "Needs attention soon",
  CRITICAL: "Act now",
  EMERGENCY: "Someone is in danger",
};

export const SEVERITY_PLURAL: Record<Severity, [string, string]> = {
  NOMINAL: ["normal", "normal"],
  ADVISORY: ["advisory", "advisories"],
  WARNING: ["warning", "warnings"],
  CRITICAL: ["critical", "critical"],
  EMERGENCY: ["emergency", "emergencies"],
};

export const STATUS_WORD: Record<IncidentStatus, string> = {
  DETECTED: "New",
  ACKNOWLEDGED: "Acknowledged",
  MITIGATING: "Playbook running",
  MONITORING: "Watching",
  RESOLVED: "Resolved",
};

export const ROLE_WORD: Record<Role, string> = {
  HOMEOWNER: "Homeowner",
  HOUSEHOLD_MEMBER: "Household member",
  OPERATOR: "Operator",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Technician",
  RESPONDER: "Responder",
  ADMIN: "Admin",
  INSURER: "Insurer",
};

export const METRIC: Record<MetricKey, { label: string; unit: string; digits: number }> = {
  PRESSURE_KPA: { label: "Air pressure", unit: "kPa", digits: 1 },
  PPO2_KPA: { label: "Oxygen", unit: "kPa", digits: 2 },
  CO2_PPM: { label: "Carbon dioxide", unit: "ppm", digits: 0 },
  TEMP_C: { label: "Temperature", unit: "°C", digits: 1 },
  SMOKE_IDX: { label: "Smoke", unit: "", digits: 0 },
  DOSE_USVH: { label: "Radiation", unit: "µSv/h", digits: 0 },
  BATTERY_KWH: { label: "Battery", unit: "kWh", digits: 1 },
  WATER_L: { label: "Water", unit: "L", digits: 0 },
  EQUIPMENT_HEALTH: { label: "Equipment health", unit: "%", digits: 0 },
};

export const num = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function plural(n: number, one: string, many: string) {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** "0:42" style age. */
export function ageWords(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  return `${Math.floor(s / 3600)} h ${pad((s % 3600) / 60)} min`;
}

export function fillTemplate(text: string, vars: { room?: string | null; eta?: number | null }) {
  const n = vars.eta != null ? Math.max(1, Math.round(vars.eta / 60)) : null;
  return text
    .replaceAll("{room}", vars.room ?? "the room")
    .replaceAll("{eta} minutes", n === null ? "a few minutes" : `${n} ${n === 1 ? "minute" : "minutes"}`)
    .replaceAll("{eta}", n === null ? "a few" : String(n));
}

export const firstName = (name: string) => name.split(" ")[0];

/** "Bedroom 2" stays a name; "Living room" becomes "the living room". */
export const roomPhrase = (name: string) => (/\d/.test(name) ? name : `the ${name.toLowerCase()}`);
