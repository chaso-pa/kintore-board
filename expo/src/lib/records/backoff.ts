/**
 * Retry timing and error classes for the sync engine and importer (plan §3.4).
 *
 * Pure: no axios import. Errors are read by shape (`err.response.status`), which is what
 * axios produces, so this stays testable without the api client.
 */

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Cap for permanent errors (400/422/409) and the 403 low-frequency mode. */
export const PERMANENT_CAP_MS = 6 * 60 * 60_000;
const JITTER = 0.2;

export interface BackoffOptions {
  cap?: number;
  random?: () => number;
}

/** `min(2^attempt × 2s, cap)` ±20%. `attempt` is the number of failures so far, from 0. */
export function backoffDelay(attempt: number, { cap = BACKOFF_MAX_MS, random = Math.random }: BackoffOptions = {}): number {
  const exp = Math.min(Math.max(attempt, 0), 30);
  const base = Math.min(2 ** exp * BACKOFF_BASE_MS, cap);
  return Math.round(base * (1 + (random() * 2 - 1) * JITTER));
}

/** Retry-After as seconds or an HTTP date, in ms from `now`. null when absent or unparsable. */
export function parseRetryAfter(value: unknown, now: number = Date.now()): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.max(at - now, 0);
}

export type SyncErrorClass =
  /** Network, timeout, 5xx, 429: short exponential backoff (Retry-After wins when given). */
  | { kind: 'transient'; status: number | null; retryAfterMs: number | null }
  /** 400/422/409 and other 4xx: keep retrying, but no more often than the 6h cap allows. */
  | { kind: 'permanent'; status: number }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'gone' };

interface HttpErrorShape {
  response?: { status?: number; headers?: Record<string, unknown> };
}

export function errorStatus(err: unknown): number | null {
  const status = (err as HttpErrorShape | null)?.response?.status;
  return typeof status === 'number' ? status : null;
}

export function classifyError(err: unknown, now: number = Date.now()): SyncErrorClass {
  const status = errorStatus(err);
  if (status === null) return { kind: 'transient', status: null, retryAfterMs: null };
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 404) return { kind: 'not_found' };
  if (status === 410) return { kind: 'gone' };
  if (status === 429 || status >= 500) {
    const headers = (err as HttpErrorShape).response?.headers;
    return { kind: 'transient', status, retryAfterMs: parseRetryAfter(headers?.['retry-after'], now) };
  }
  return { kind: 'permanent', status };
}

/** Delay before the next attempt after an error of class `c`, `attempt` failures in. */
export function retryDelay(c: SyncErrorClass, attempt: number, random?: () => number): number {
  if (c.kind === 'transient') return c.retryAfterMs ?? backoffDelay(attempt, { random });
  if (c.kind === 'forbidden') return PERMANENT_CAP_MS;
  return backoffDelay(attempt, { cap: PERMANENT_CAP_MS, random });
}

export function errorMessage(err: unknown): string {
  const status = errorStatus(err);
  const msg = err instanceof Error ? err.message : String(err);
  return status === null ? msg : `HTTP ${status}: ${msg}`;
}
