import { buildSetLines, buildWorkoutSummary, formatSet, formatVolume } from './workout-summary';

const s = (
  exercise_name: string,
  weight: number,
  reps: number,
  extra?: { sets?: number; spotted?: boolean }
) => ({
  exercise_name,
  weight,
  reps,
  sets: extra?.sets ?? 1,
  spotted: extra?.spotted,
});

describe('formatSet', () => {
  // Bare numbers give no way to tell weight from reps, which is the whole point of a card
  // someone else is meant to read.
  it('carries the units', () => {
    expect(formatSet(60, 10)).toBe('60kg × 10回');
  });

  it('drops a trailing zero but keeps a real fraction', () => {
    expect(formatSet(60.0, 10)).toBe('60kg × 10回');
    expect(formatSet(62.5, 8)).toBe('62.5kg × 8回');
  });

  // Pull-ups and dips are logged with no weight, and "0kg" reads as a mistake.
  it('writes bodyweight work as 自重', () => {
    expect(formatSet(0, 10)).toBe('自重 × 10回');
  });
});

describe('buildSetLines', () => {
  it('numbers the sets in order', () => {
    const lines = buildSetLines([
      { weight: 50, reps: 6, sets: 1 },
      { weight: 70, reps: 6, sets: 1 },
    ]);
    expect(lines.map((l) => [l.index, l.text])).toEqual([
      [1, '50kg × 6回'],
      [2, '70kg × 6回'],
    ]);
  });

  // A set taken with a spot is not the same set as one taken alone. Folding the three
  // identical-looking rows below into "70kg × 6回 3セット" would erase which needed help.
  it('keeps identical sets apart so the spot stays attached to its own set', () => {
    const lines = buildSetLines([
      { weight: 70, reps: 6, sets: 1 },
      { weight: 70, reps: 6, sets: 1, spotted: true },
      { weight: 70, reps: 6, sets: 1, spotted: true },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.spotted)).toEqual([false, true, true]);
  });

  it('treats a missing spotted flag as not spotted', () => {
    expect(buildSetLines([{ weight: 60, reps: 10, sets: 1 }])[0].spotted).toBe(false);
  });

  // Older records pack several sets onto one row. Numbering has to follow what was done,
  // not how it happens to be stored.
  it('expands a row standing for several sets into that many lines', () => {
    const lines = buildSetLines([{ weight: 60, reps: 10, sets: 3 }]);
    expect(lines.map((l) => l.index)).toEqual([1, 2, 3]);
    expect(lines.every((l) => l.text === '60kg × 10回')).toBe(true);
  });

  it('treats a row with no set count as one set', () => {
    expect(buildSetLines([{ weight: 60, reps: 10, sets: 0 }])).toHaveLength(1);
  });

  it('is empty for no rows', () => {
    expect(buildSetLines([])).toEqual([]);
  });
});

describe('buildWorkoutSummary', () => {
  it('groups by exercise, keeping the order they were trained in', () => {
    const summary = buildWorkoutSummary([
      s('ベンチプレス', 60, 10),
      s('スクワット', 100, 5),
      s('ベンチプレス', 62.5, 8),
    ]);
    expect(summary.exercises.map((e) => e.name)).toEqual(['ベンチプレス', 'スクワット']);
    expect(summary.exercises[0].lines.map((l) => l.text)).toEqual(['60kg × 10回', '62.5kg × 8回']);
  });

  it('numbers each exercise from one', () => {
    const summary = buildWorkoutSummary([
      s('ベンチプレス', 60, 10),
      s('スクワット', 100, 5),
      s('スクワット', 100, 5),
    ]);
    expect(summary.exercises[1].lines.map((l) => l.index)).toEqual([1, 2]);
  });

  it('reports the best estimated 1RM across the exercise', () => {
    // 100×1 estimates 100.0 and 80×8 estimates 99.3, so the opening set wins by a hair —
    // close enough that taking the last set, or the heaviest, would look right most days
    // and be wrong here.
    const summary = buildWorkoutSummary([s('ベンチプレス', 100, 1), s('ベンチプレス', 80, 8)]);
    expect(summary.exercises[0].bestE1rm).toBeCloseTo(100.0, 1);
  });

  it('takes the later set when it is the better one', () => {
    const summary = buildWorkoutSummary([s('ベンチプレス', 60, 5), s('ベンチプレス', 100, 5)]);
    expect(summary.exercises[0].bestE1rm).toBeCloseTo(112.5, 1);
  });

  it('has no estimate for bodyweight work', () => {
    expect(buildWorkoutSummary([s('チンアップ', 0, 10)]).exercises[0].bestE1rm).toBeNull();
  });

  it('totals the volume the same way the stats card does', () => {
    const summary = buildWorkoutSummary([s('ベンチプレス', 60, 10), s('スクワット', 100, 5)]);
    expect(summary.totalVolumeKg).toBe(60 * 10 + 100 * 5);
  });

  it('counts every set, including rows standing for several', () => {
    const summary = buildWorkoutSummary([
      s('ベンチプレス', 60, 10, { sets: 3 }),
      s('スクワット', 100, 5),
    ]);
    expect(summary.totalSets).toBe(4);
  });

  it('carries the spot through to the line it belongs to', () => {
    const summary = buildWorkoutSummary([
      s('ベンチプレス', 70, 6),
      s('ベンチプレス', 70, 6, { spotted: true }),
    ]);
    expect(summary.exercises[0].lines.map((l) => l.spotted)).toEqual([false, true]);
  });

  it('trims exercise names so spacing does not split one exercise in two', () => {
    const summary = buildWorkoutSummary([s(' ベンチプレス', 60, 10), s('ベンチプレス ', 60, 10)]);
    expect(summary.exercises).toHaveLength(1);
    expect(summary.exercises[0].lines).toHaveLength(2);
  });

  it('is empty for a day with nothing logged', () => {
    const summary = buildWorkoutSummary([]);
    expect(summary.exercises).toEqual([]);
    expect(summary.totalVolumeKg).toBe(0);
    expect(summary.totalSets).toBe(0);
  });
});

describe('formatVolume', () => {
  it('uses kg below a tonne', () => {
    expect(formatVolume(940)).toBe('940kg');
  });

  it('switches to tonnes at a tonne', () => {
    expect(formatVolume(1000)).toBe('1.00t');
    expect(formatVolume(8440)).toBe('8.44t');
  });
});
