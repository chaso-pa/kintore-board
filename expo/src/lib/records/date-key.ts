/**
 * The one place dates become day keys for records (plan §3.2, R4).
 *
 * The server buckets workouts by `TrainedOn.Format("2006-01-02")` in its process time zone,
 * fixed to UTC in Phase 0. Every local computation that groups or compares by day must use
 * these helpers so the device and the server agree on which day a workout belongs to.
 */

export const SERVER_DATE_TZ = 'UTC';

function toDate(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d;
}

/**
 * Canonical stored form: UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. Stored values are compared as
 * strings, which is only correct when they all share this exact shape.
 */
export function normalizeIso(iso: string): string {
  return toDate(iso).toISOString();
}

/** `YYYY-MM-DD` of an instant in SERVER_DATE_TZ. */
export function dateKey(iso: string): string {
  return toDate(iso).toISOString().slice(0, 10);
}

/** The key a workout recorded at `now` lands under. */
export function todayKey(now: Date = new Date()): string {
  return dateKey(now.toISOString());
}

/**
 * The trained_on for a calendar `dateString` (`YYYY-MM-DD`), chosen so that
 * `dateKey(trainedOnForDateString(d)) === d`. Matches `new Date(dateString)` in the new
 * record screen, which parses a bare date as UTC midnight.
 */
export function trainedOnForDateString(dateString: string): string {
  return normalizeIso(`${dateString}T00:00:00.000Z`);
}

/**
 * Half-open range [start, end) of stored trained_on values for a month (1-12), for
 * `trained_on >= start AND trained_on < end`.
 */
export function monthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}
