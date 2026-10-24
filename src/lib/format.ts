// Deterministic formatters (fixed locale + UTC) so server and client render
// identical strings.

const LOCALE = "en-US";
const TZ = "UTC";

/** 754000 → "12:34", 3_754_000 → "1:02:34". */
export function timecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** 2_520_000 → "42 min", 7_380_000 → "2 h 3 min". */
export function duration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** Seconds with one decimal: 12_400 → "12.4s". */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const longDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: "long", year: "numeric" });
const shortMonthFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: "short" });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "numeric" });

export const formatDate = (t: number) => dateFmt.format(t);
export const formatLongDate = (t: number) => longDateFmt.format(t);
export const formatTime = (t: number) => timeFmt.format(t);
export const formatMonth = (t: number) => monthFmt.format(t);
export const formatShortMonth = (t: number) => shortMonthFmt.format(t);
export const formatDay = (t: number) => dayFmt.format(t);

// Real recordings are rendered by Server Components on the user's own
// machine, so local time is both correct and hydration-safe there.
const localFmt = new Intl.DateTimeFormat(LOCALE, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** Server Components only: local date and time. */
export const formatLocalDateTime = (t: number) => localFmt.format(t);

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
