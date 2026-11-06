import { isDateComplete } from '@/lib/records/coverage';

describe('isDateComplete', () => {
  const coveredFrom = '2026-10-15T08:00:00.000Z';
  const running = { importState: 'running' as const, coveredFrom };

  it('treats the boundary day as incomplete', () => {
    expect(isDateComplete('2026-10-15', running)).toBe(false);
  });

  it('treats the day before the boundary as incomplete', () => {
    expect(isDateComplete('2026-10-14', running)).toBe(false);
  });

  it('treats the day after the boundary as complete', () => {
    expect(isDateComplete('2026-10-16', running)).toBe(true);
  });

  it('treats every day as incomplete before the first page', () => {
    expect(isDateComplete('2026-11-06', { importState: 'pending', coveredFrom: null })).toBe(false);
    expect(isDateComplete('2026-11-06', { importState: 'running', coveredFrom: null })).toBe(false);
  });

  it('treats every day as complete once done', () => {
    expect(isDateComplete('2000-01-01', { importState: 'done', coveredFrom: null })).toBe(true);
    expect(isDateComplete('2000-01-01', { importState: 'done', coveredFrom })).toBe(true);
  });

  it('keys covered_from in server time: 00:30 JST is the previous UTC day', () => {
    // 2026-10-16 00:30 JST = 2026-10-15T15:30Z, so the boundary is the 15th.
    const state = { importState: 'running' as const, coveredFrom: '2026-10-16T00:30:00+09:00' };
    expect(isDateComplete('2026-10-15', state)).toBe(false);
    expect(isDateComplete('2026-10-16', state)).toBe(true);
  });
});
