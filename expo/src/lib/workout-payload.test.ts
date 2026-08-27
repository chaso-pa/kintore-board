import {
  buildWorkoutPayload,
  buildWorkoutSets,
  hasAnythingToSave,
  type ExerciseGroup,
} from './workout-payload';

const row = (weight: string, reps: string, extra?: Partial<{ spotted: boolean; memo: string }>) => ({
  weight,
  reps,
  spotted: extra?.spotted ?? false,
  memo: extra?.memo ?? '',
});

const group = (name: string, rows = [row('60', '10')]): ExerciseGroup => ({
  id: name || 'blank',
  exercise_name: name,
  rows,
});

describe('hasAnythingToSave', () => {
  // Autosave asks this before writing anything, so it is what stops a mis-tap into the
  // record screen from leaving a workout behind.
  it('is false for a form that was only opened', () => {
    expect(hasAnythingToSave([group('', [row('', '')])])).toBe(false);
  });

  it('is false when the name is only whitespace', () => {
    expect(hasAnythingToSave([group('   ', [row('60', '10')])])).toBe(false);
  });

  // Naming the exercise is the bar, not filling in numbers: someone who picked an exercise
  // and got interrupted has done real work worth keeping.
  it('is true once an exercise is named, even with no numbers', () => {
    expect(hasAnythingToSave([group('ベンチプレス', [row('', '')])])).toBe(true);
  });

  it('is true when any group qualifies', () => {
    expect(hasAnythingToSave([group(''), group('スクワット')])).toBe(true);
  });
});

describe('buildWorkoutSets', () => {
  // The form keeps a blank group at the end as scaffolding for the next exercise. It is
  // not a set and must not reach the server.
  it('drops groups with no exercise name', () => {
    const sets = buildWorkoutSets([group('デッドリフト'), group('', [row('', '')])]);
    expect(sets).toHaveLength(1);
    expect(sets[0].exercise_name).toBe('デッドリフト');
  });

  it('emits one entry per row, each counted as a single set', () => {
    const sets = buildWorkoutSets([group('ベンチプレス', [row('60', '10'), row('62.5', '8')])]);
    expect(sets).toHaveLength(2);
    expect(sets.map((s) => [s.weight, s.reps, s.sets])).toEqual([
      [60, 10, 1],
      [62.5, 8, 1],
    ]);
  });

  it('trims the exercise name', () => {
    expect(buildWorkoutSets([group('  ベンチプレス  ')])[0].exercise_name).toBe('ベンチプレス');
  });

  // A row left blank still belongs to the exercise. Zero is the honest reading of an empty
  // field, and dropping the row would silently lose a set someone meant to fill in later.
  it('reads blank and unparseable numbers as zero', () => {
    const sets = buildWorkoutSets([group('スクワット', [row('', ''), row('abc', 'xyz')])]);
    expect(sets.map((s) => [s.weight, s.reps])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('carries the per-row memo and spotted flag', () => {
    const sets = buildWorkoutSets([
      group('ベンチプレス', [row('80', '5', { spotted: true, memo: '補助あり' })]),
    ]);
    expect(sets[0]).toMatchObject({ spotted: true, memo: '補助あり' });
  });
});

describe('buildWorkoutPayload', () => {
  // Autosave decides whether to write by comparing serialized payloads, so an unchanged
  // form has to produce a byte-identical result. Key order is part of that.
  it('is stable across calls for unchanged input', () => {
    const groups = [group('ベンチプレス', [row('60', '10')])];
    const a = buildWorkoutPayload('2026-08-27T00:00:00Z', 'メモ', groups);
    const b = buildWorkoutPayload('2026-08-27T00:00:00Z', 'メモ', groups);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('changes when any field changes', () => {
    const base = buildWorkoutPayload('2026-08-27T00:00:00Z', '', [group('ベンチプレス')]);
    const memoChanged = buildWorkoutPayload('2026-08-27T00:00:00Z', 'メモ', [group('ベンチプレス')]);
    const repsChanged = buildWorkoutPayload('2026-08-27T00:00:00Z', '', [
      group('ベンチプレス', [row('60', '11')]),
    ]);
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(memoChanged));
    expect(JSON.stringify(base)).not.toBe(JSON.stringify(repsChanged));
  });

  // The group id is local scaffolding that changes as rows are added. Including it would
  // make every structural edit look like a change to the server.
  it('ignores the local group id', () => {
    const a = buildWorkoutPayload('2026-08-27T00:00:00Z', '', [
      { id: '1', exercise_name: 'ベンチプレス', rows: [row('60', '10')] },
    ]);
    const b = buildWorkoutPayload('2026-08-27T00:00:00Z', '', [
      { id: '99', exercise_name: 'ベンチプレス', rows: [row('60', '10')] },
    ]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
