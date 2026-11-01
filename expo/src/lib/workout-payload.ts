/**
 * Turning the record form into a request body.
 *
 * Both the new and edit screens hold the same shape and built the same payload inline,
 * which mattered once saving stopped being a button press: autosave compares one payload
 * against the last one it sent, so the two screens have to agree on what a payload is,
 * down to key order.
 */

import { inputToKg, kgToInput, type WeightUnit } from '@/lib/weight-unit';

export interface SetRow {
  /** As typed, in the screen's unit. */
  weight: string;
  /**
   * The stored kg value this row was loaded or copied with, kept until the weight is edited.
   *
   * Without it, opening a kg record in lb and touching anything else rewrote every weight
   * from its rounded lb text: 100 kg became 220.46 lb became 99.9998 kg.
   */
  kg?: number;
  reps: string;
  spotted: boolean;
  memo: string;
}

export interface ExerciseGroup {
  id: string;
  exercise_name: string;
  rows: SetRow[];
  /**
   * The body part this exercise was filed under when it was picked.
   *
   * Recorded with the set rather than looked up later, because the answer can change: the
   * catalog it comes from lives on the device and is editable, and the same name can now
   * belong to two parts. What was true at the time is the only version worth keeping.
   *
   * Empty for a set written before the field existed, or by a client that predates it.
   */
  body_part?: string;
  /**
   * The unit this exercise's weights are typed in, when it differs from the screen's. Set
   * with the kg/lbs toggle on the exercise; see convertGroupUnit.
   */
  unit?: WeightUnit;
}

export interface WorkoutSetPayload {
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  memo: string;
  spotted: boolean;
  body_part: string;
}

export interface WorkoutPayload {
  trained_on: string;
  memo: string;
  sets: WorkoutSetPayload[];
}

/**
 * Groups without an exercise name are dropped.
 *
 * The form starts with one blank group and adds another whenever you finish one, so there
 * is almost always a trailing empty group on screen. It is scaffolding, not a set.
 */
export function buildWorkoutSets(groups: ExerciseGroup[], unit: WeightUnit = 'kg'): WorkoutSetPayload[] {
  return groups.flatMap((g) =>
    g.exercise_name.trim()
      ? g.rows.map((r) => ({
          exercise_name: g.exercise_name.trim(),
          weight: r.kg ?? inputToKg(r.weight, g.unit ?? unit),
          reps: parseInt(r.reps, 10) || 0,
          sets: 1,
          memo: r.memo,
          spotted: r.spotted,
          body_part: g.body_part ?? '',
        }))
      : []
  );
}

export function buildWorkoutPayload(
  trainedOn: string,
  memo: string,
  groups: ExerciseGroup[],
  unit: WeightUnit = 'kg'
): WorkoutPayload {
  return { trained_on: trainedOn, memo, sets: buildWorkoutSets(groups, unit) };
}

/**
 * Whether a *new* record is worth creating.
 *
 * Naming an exercise is one bar; writing a memo is the other. The memo used to be left
 * out, so someone who opened the screen and typed a note before picking an exercise had it
 * silently thrown away — autosave asks this before writing anything, so a false here is
 * not a delay, it is a discard.
 *
 * Both are still needed: without any bar at all, a mis-tap into the record screen would
 * leave an empty workout behind.
 *
 * This is only about creating. An existing record is always savable — see the edit screen,
 * where emptying a workout is a change that has to persist like any other.
 */
export function hasAnythingToSave(groups: ExerciseGroup[], memo = ''): boolean {
  return memo.trim().length > 0 || groups.some((g) => g.exercise_name.trim().length > 0);
}

/** One set as the last-record endpoint returns it. */
export interface PreviousSet {
  weight: number;
  reps: number;
}

/**
 * The rows for "copy last time's sets" — every set, not just the numbers of the first.
 *
 * Numbers only. `spotted` and `memo` are deliberately not carried over: whether a set needed
 * a spot is a fact about the set that just happened, and a memo is about that day. Copying
 * either would put a claim in today's record that nobody made, and a wrong `spotted` quietly
 * changes what the history means.
 *
 * The weight is shown in the screen's unit and the exact kg kept alongside — see rowWeight.
 * A zero weight (bodyweight work) becomes a blank field rather than "0".
 *
 * An empty list yields one blank row rather than none, so the group never ends up with no
 * rows at all and no way to add the first one back.
 */
export function rowsFromPreviousSets(
  sets: readonly PreviousSet[],
  unit: WeightUnit = 'kg'
): SetRow[] {
  if (sets.length === 0) {
    return [{ weight: '', reps: '', spotted: false, memo: '' }];
  }
  return sets.map((s) => ({
    ...rowWeight(s.weight, unit),
    reps: String(s.reps),
    spotted: false,
    memo: '',
  }));
}

/**
 * Whether copying would destroy something the person typed.
 *
 * The copy replaces every row, so the call sites ask this first and confirm when it is true.
 * A blank row is not "something typed" — the screen starts with one, so treating it as data
 * would mean confirming on the press where copying is most obviously what was wanted.
 *
 * Only weight and reps count. A memo on an otherwise empty row is intentionally ignored:
 * memos are not copied over, so a copy leaves it in place and destroys nothing.
 */
export function hasEnteredSetData(rows: readonly SetRow[]): boolean {
  return rows.some((r) => r.weight.trim() !== '' || r.reps.trim() !== '');
}

/**
 * The weight half of a row for a stored kg value: the text to show in `unit`, plus the
 * exact kg to save as long as that text is left alone. Nothing stored means a blank field.
 */
export function rowWeight(kg: number, unit: WeightUnit): Pick<SetRow, 'weight' | 'kg'> {
  return kg > 0 ? { weight: kgToInput(kg, unit), kg } : { weight: '' };
}

/**
 * A row with one field changed. Editing the weight drops the remembered kg, since the text
 * is now the value.
 */
export function updateSetRow(row: SetRow, field: keyof SetRow, val: string | boolean): SetRow {
  const next = { ...row, [field]: val };
  if (field === 'weight') delete next.kg;
  return next;
}

/**
 * Switches an exercise to another unit, converting what is already typed.
 *
 * Converted, not reinterpreted: the toggle changes how a weight is written, not what was
 * lifted, so 100 kg becomes 220.46 lbs rather than 100 lbs. Each row keeps its exact kg, so
 * flipping back and forth returns the original text and saves the original value.
 */
export function convertGroupUnit(group: ExerciseGroup, from: WeightUnit, to: WeightUnit): ExerciseGroup {
  if (from === to) return { ...group, unit: to };
  return {
    ...group,
    unit: to,
    rows: group.rows.map((r) => {
      const kg = r.kg ?? inputToKg(r.weight, from);
      return kg > 0 ? { ...r, ...rowWeight(kg, to) } : r;
    }),
  };
}
