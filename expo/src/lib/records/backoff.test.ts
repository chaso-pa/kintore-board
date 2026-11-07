import {
  BACKOFF_MAX_MS,
  backoffDelay,
  classifyError,
  parseRetryAfter,
  PERMANENT_CAP_MS,
  retryDelay,
} from '@/lib/records/backoff';

const mid = () => 0.5;
const err = (status: number, headers: Record<string, string> = {}) => ({ response: { status, headers } });

describe('backoffDelay', () => {
  it('doubles from 2s and caps at 5min', () => {
    expect([0, 1, 2, 3].map((n) => backoffDelay(n, { random: mid }))).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect(backoffDelay(8, { random: mid })).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(100, { random: mid })).toBe(BACKOFF_MAX_MS);
  });

  it('jitters by ±20%', () => {
    expect(backoffDelay(0, { random: () => 0 })).toBe(1_600);
    expect(backoffDelay(0, { random: () => 1 })).toBe(2_400);
  });

  it('caps at 6h in the permanent mode', () => {
    expect(backoffDelay(30, { cap: PERMANENT_CAP_MS, random: mid })).toBe(PERMANENT_CAP_MS);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    const now = Date.parse('2026-11-06T00:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30_000);
    expect(parseRetryAfter('Fri, 06 Nov 2026 00:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter('soon', now)).toBeNull();
  });
});

describe('classifyError', () => {
  it('maps statuses to classes', () => {
    expect(classifyError(new Error('Network Error'))).toEqual({ kind: 'transient', status: null, retryAfterMs: null });
    expect(classifyError(err(503))).toMatchObject({ kind: 'transient', status: 503 });
    expect(classifyError(err(429, { 'retry-after': '5' }))).toMatchObject({ kind: 'transient', retryAfterMs: 5_000 });
    expect(classifyError(err(400))).toEqual({ kind: 'permanent', status: 400 });
    expect(classifyError(err(422))).toEqual({ kind: 'permanent', status: 422 });
    expect(classifyError(err(409))).toEqual({ kind: 'permanent', status: 409 });
    expect(classifyError(err(401))).toEqual({ kind: 'unauthorized' });
    expect(classifyError(err(403))).toEqual({ kind: 'forbidden' });
    expect(classifyError(err(404))).toEqual({ kind: 'not_found' });
    expect(classifyError(err(410))).toEqual({ kind: 'gone' });
  });
});

describe('retryDelay', () => {
  it('prefers Retry-After, uses the 6h cap for permanent errors and 6h for 403', () => {
    expect(retryDelay(classifyError(err(429, { 'retry-after': '7' })), 3, mid)).toBe(7_000);
    expect(retryDelay(classifyError(err(500)), 10, mid)).toBe(BACKOFF_MAX_MS);
    expect(retryDelay(classifyError(err(422)), 10, mid)).toBe(2 ** 10 * 2_000);
    expect(retryDelay(classifyError(err(422)), 25, mid)).toBe(PERMANENT_CAP_MS);
    expect(retryDelay(classifyError(err(403)), 0, mid)).toBe(PERMANENT_CAP_MS);
  });
});
