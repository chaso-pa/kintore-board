import {
  dateKey,
  monthRange,
  normalizeIso,
  SERVER_DATE_TZ,
  todayKey,
  trainedOnForDateString,
} from '@/lib/records/date-key';

describe('date-key', () => {
  it('is pinned to UTC', () => {
    expect(SERVER_DATE_TZ).toBe('UTC');
  });

  it('keys by the UTC day', () => {
    expect(dateKey('2026-11-01T06:30:00.000Z')).toBe('2026-11-01');
    expect(dateKey('2026-11-01T23:59:59.999Z')).toBe('2026-11-01');
    // 00:30 JST is still the previous day on the server.
    expect(dateKey('2026-11-02T00:30:00+09:00')).toBe('2026-11-01');
  });

  it('rejects invalid input', () => {
    expect(() => dateKey('nope')).toThrow();
  });

  it('normalizes to the stored shape', () => {
    expect(normalizeIso('2026-11-01T06:30:00Z')).toBe('2026-11-01T06:30:00.000Z');
    expect(normalizeIso('2026-11-01T15:30:00+09:00')).toBe('2026-11-01T06:30:00.000Z');
  });

  it('maps a calendar dateString to a trained_on with the same key', () => {
    expect(trainedOnForDateString('2026-02-28')).toBe('2026-02-28T00:00:00.000Z');
    expect(dateKey(trainedOnForDateString('2026-02-28'))).toBe('2026-02-28');
    expect(dateKey(new Date('2026-02-28').toISOString())).toBe('2026-02-28');
  });

  it('gives today as the key of now', () => {
    expect(todayKey(new Date('2026-11-06T15:30:00.000Z'))).toBe('2026-11-06');
  });

  it('gives a half-open month range, across year end', () => {
    expect(monthRange(2026, 11)).toEqual({ start: '2026-11-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z' });
    expect(monthRange(2026, 12)).toEqual({ start: '2026-12-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' });
    const { start, end } = monthRange(2026, 11);
    expect('2026-11-30T23:59:59.999Z' >= start && '2026-11-30T23:59:59.999Z' < end).toBe(true);
    expect('2026-12-01T00:00:00.000Z' < end).toBe(false);
  });
});
