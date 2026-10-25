import { formatMarsHours, lmstAt, marsTime } from "./marsTime";

/** "03:14" in a settlement's local mean solar time. */
export const localClock = (iso: string, lon: number) => formatMarsHours(lmstAt(Date.parse(iso), lon));

/** "Sol 54,323, 03:14" */
export function localStamp(iso: string, lon: number) {
  const { sol } = marsTime(new Date(iso));
  return `Sol ${sol.toLocaleString("en-US")}, ${localClock(iso, lon)}`;
}

/** "12 min ago" against the sim clock. */
export function sinceWords(iso: string, nowMs: number | null) {
  if (nowMs === null) return "";
  const s = Math.max(0, (nowMs - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 88775)} sols ago`;
}
