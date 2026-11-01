import {
  formatConverted,
  formatVolume,
  formatWeight,
  fromKg,
  inputToKg,
  kgToInput,
  toKg,
} from './weight-unit';
import {
  buildWorkoutSets,
  convertGroupUnit,
  rowWeight,
  rowsFromPreviousSets,
  updateSetRow,
} from './workout-payload';
import { buildWorkoutSummary } from './workout-summary';

describe('conversion', () => {
  it('uses the exact definition of a pound', () => {
    expect(toKg(1, 'lb')).toBe(0.45359237);
    expect(toKg(100, 'kg')).toBe(100);
  });

  // The whole reason no lb column is needed: what goes in as lb comes back out as lb.
  it('round-trips a typed lb value through stored kg', () => {
    for (const lb of [45, 135, 225, 315, 2.5, 47.5]) {
      expect(kgToInput(inputToKg(String(lb), 'lb'), 'lb')).toBe(String(lb));
    }
  });

  it('shows a kg weight in lb rounded to something typeable', () => {
    expect(kgToInput(100, 'lb')).toBe('220.46');
    expect(kgToInput(100, 'kg')).toBe('100');
    expect(kgToInput(0, 'lb')).toBe('');
  });

  it('treats unparseable input as nothing', () => {
    expect(inputToKg('', 'lb')).toBe(0);
    expect(inputToKg('abc', 'kg')).toBe(0);
  });
});

describe('formatting', () => {
  it('keeps quarter-kg plates and rounds lb to one place', () => {
    expect(formatWeight(62.25, 'kg')).toBe('62.25kg');
    expect(formatWeight(60, 'kg')).toBe('60kg');
    expect(formatWeight(100, 'lb')).toBe('220.5lbs');
    expect(formatWeight(toKg(225, 'lb'), 'lb')).toBe('225lbs');
  });

  it('formats volume per unit', () => {
    expect(formatVolume(1500, 'kg')).toBe('1.50t');
    expect(formatVolume(800, 'kg')).toBe('800kg');
    expect(formatVolume(toKg(12345, 'lb'), 'lb')).toBe('12.3k lbs');
    expect(formatVolume(toKg(950, 'lb'), 'lb')).toBe('950lbs');
  });

  it('gives the other unit as a hint, and nothing for an empty field', () => {
    expect(formatConverted(100, 'kg')).toBe('≈ 220.5lbs');
    expect(formatConverted(toKg(225, 'lb'), 'lb')).toBe('≈ 102.06kg');
    expect(formatConverted(0, 'kg')).toBeNull();
  });

  it('converts back exactly what was converted out', () => {
    expect(fromKg(toKg(315, 'lb'), 'lb')).toBeCloseTo(315, 10);
  });
});

describe('rows keep the stored kg until the weight is edited', () => {
  const group = (rows: ReturnType<typeof rowsFromPreviousSets>) => [
    { id: '1', exercise_name: 'ベンチプレス', rows },
  ];

  // Opening a kg record in lb and saving it untouched must not write 220.46 lb back as
  // 99.9998 kg.
  it('saves an untouched row with its original kg', () => {
    const rows = [{ ...rowWeight(100, 'lb'), reps: '5', spotted: false, memo: '' }];
    expect(rows[0].weight).toBe('220.46');
    expect(buildWorkoutSets(group(rows), 'lb')[0].weight).toBe(100);
  });

  it('saves an edited row from its text', () => {
    const loaded = { ...rowWeight(100, 'lb'), reps: '5', spotted: false, memo: '' };
    const edited = updateSetRow(loaded, 'weight', '225');
    expect(edited.kg).toBeUndefined();
    expect(buildWorkoutSets(group([edited]), 'lb')[0].weight).toBeCloseTo(102.0582833, 6);
  });

  it('keeps the kg when something other than the weight changes', () => {
    const loaded = { ...rowWeight(100, 'lb'), reps: '5', spotted: false, memo: '' };
    expect(updateSetRow(loaded, 'reps', '6').kg).toBe(100);
  });

  it('copies previous sets in the screen unit with their exact kg', () => {
    const rows = rowsFromPreviousSets([{ weight: 100, reps: 5 }], 'lb');
    expect(rows[0]).toMatchObject({ weight: '220.46', kg: 100, reps: '5' });
  });

  it('defaults to kg, so existing callers are unchanged', () => {
    const rows = [{ weight: '60', reps: '10', spotted: false, memo: '' }];
    expect(buildWorkoutSets(group(rows))[0].weight).toBe(60);
  });
});

describe('per-exercise unit', () => {
  const blankRow = { weight: '', reps: '', spotted: false, memo: '' };

  // The toggle changes how the weight is written, not what was lifted.
  it('converts typed weights when the exercise is switched', () => {
    const g = { id: '1', exercise_name: 'ベンチプレス', rows: [{ ...blankRow, weight: '100', reps: '5' }] };
    const lb = convertGroupUnit(g, 'kg', 'lb');
    expect(lb.unit).toBe('lb');
    expect(lb.rows[0]).toMatchObject({ weight: '220.46', kg: 100, reps: '5' });
  });

  it('returns to the original text and value when switched back', () => {
    const g = { id: '1', exercise_name: 'ベンチプレス', rows: [{ ...blankRow, weight: '62.25' }] };
    const back = convertGroupUnit(convertGroupUnit(g, 'kg', 'lb'), 'lb', 'kg');
    expect(back.rows[0].weight).toBe('62.25');
    expect(buildWorkoutSets([back])[0].weight).toBe(62.25);
  });

  it('leaves empty rows empty', () => {
    const g = { id: '1', exercise_name: 'ベンチプレス', rows: [blankRow] };
    expect(convertGroupUnit(g, 'kg', 'lb').rows[0]).toEqual(blankRow);
  });

  // One workout, two units: a kg barbell and an lb dumbbell rack.
  it('reads each exercise in its own unit when saving', () => {
    const sets = buildWorkoutSets(
      [
        { id: '1', exercise_name: 'ベンチプレス', rows: [{ ...blankRow, weight: '100' }] },
        { id: '2', exercise_name: 'ダンベルプレス', unit: 'lb', rows: [{ ...blankRow, weight: '50' }] },
      ],
      'kg'
    );
    expect(sets[0].weight).toBe(100);
    expect(sets[1].weight).toBeCloseTo(22.6796185, 6);
  });

  it('writes each exercise of the summary in its own unit', () => {
    const summary = buildWorkoutSummary(
      [
        { exercise_name: 'ベンチプレス', weight: 100, reps: 5, sets: 1 },
        { exercise_name: 'ダンベルプレス', weight: toKg(50, 'lb'), reps: 10, sets: 1 },
      ],
      (name) => (name === 'ダンベルプレス' ? 'lb' : 'kg')
    );
    expect(summary.exercises.map((e) => e.lines[0].text)).toEqual(['100kg × 5回', '50lbs × 10回']);
    expect(summary.exercises[1].unit).toBe('lb');
  });
});
