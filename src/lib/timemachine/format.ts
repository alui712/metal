// Local-time formatting for real recordings (rendered on the user's own
// machine, so server and client agree). Demo fixtures use src/lib/format.ts.

const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const clockSecFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const longFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export const clock = (t: number) => clockFmt.format(t);
export const clockSec = (t: number) => clockSecFmt.format(t);
export const day = (t: number) => dayFmt.format(t);
export const longDay = (t: number) => longFmt.format(t);
export const month = (t: number) => monthFmt.format(t);
/** yyyy-mm-dd in local time (for date filters). */
export const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function span(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}
