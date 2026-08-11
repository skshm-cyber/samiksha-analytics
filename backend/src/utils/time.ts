// ── timezone-aware day windows ──────────────────────────────────────────────
// All "day" boundaries use Asia/Kolkata (IST = UTC+5:30) so the analytics
// day resets at 12:00 AM IST, not at UTC midnight.

export const SITE_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

export function getDaysParam(url: URL, def = 1): number {
  const d = parseInt(url.searchParams.get("days") || String(def), 10);
  return isNaN(d) || d < 1 ? def : Math.min(d, 365);
}

/** ISO timestamp of midnight of the given IST day (offsetDays 0 = today). */
export function istDayStartISO(offsetDays = 0): string {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const utcMidnight = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() - offsetDays
  );
  return new Date(utcMidnight - IST_OFFSET_MS).toISOString();
}

/** IST calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function istDateStr(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hour of day (0-23) in IST of an ISO timestamp. */
export function istHour(iso: string): number {
  const d = new Date(iso);
  const carry = d.getUTCMinutes() + 30 >= 60 ? 1 : 0;
  return (d.getUTCHours() + 5 + carry) % 24;
}

/** Resolve a user-supplied timestamp; YYYY-MM-DD means start of that IST day. */
function resolveTimestamp(v: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const utcMid = new Date(v + "T00:00:00Z").getTime();
    return new Date(utcMid - IST_OFFSET_MS).toISOString();
  }
  const iso = new Date(v);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}

/**
 * Resolve {start, end} from query params.
 * Priority: start/end params → date=YYYY-MM-DD (that IST day) → days=N (N IST days).
 */
export function getWindow(url: URL, defDays = 1): { start: string; end: string } {
  const startParam = url.searchParams.get("start");
  if (startParam) {
    const start = resolveTimestamp(startParam);
    if (start) {
      const endParam = url.searchParams.get("end");
      const end = endParam ? resolveTimestamp(endParam) : null;
      return { start, end: end || new Date().toISOString() };
    }
  }
  const dateParam = url.searchParams.get("date");
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const start = resolveTimestamp(dateParam)!;
    return { start, end: new Date(new Date(start).getTime() + 24 * 3600 * 1000).toISOString() };
  }
  const days = getDaysParam(url, defDays);
  return { start: istDayStartISO(-(days - 1)), end: new Date().toISOString() };
}
