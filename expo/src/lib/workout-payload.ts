/**
 * Turning the record form into a request body.
 *
 * Both the new and edit screens hold the same shape and built the same payload inline,
 * which mattered once saving stopped being a button press: autosave compares one payload
 * against the last one it sent, so the two screens have to agree on what a payload is,
 * down to key order.
 */

export interface SetRow {
  weight: string;
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
export function buildWorkoutSets(groups: ExerciseGroup[]): WorkoutSetPayload[] {
  return groups.flatMap((g) =>
    g.exercise_name.trim()
      ? g.rows.map((r) => ({
          exercise_name: g.exercise_name.trim(),
          weight: parseFloat(r.weight) || 0,
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
  groups: ExerciseGroup[]
): WorkoutPayload {
  return { trained_on: trainedOn, memo, sets: buildWorkoutSets(groups) };
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
 * Trailing zeros are trimmed off the weight — the API returns 10 as `10`, but a float column
 * can hand back `10.5`, and `String(10.5)` is what the input expects while `String(10.0)`
 * would show "10" anyway. Kept as String() rather than toFixed() for exactly that reason.
 *
 * An empty list yields one blank row rather than none, so the group never ends up with no
 * rows at all and no way to add the first one back.
 */
export function rowsFromPreviousSets(sets: readonly PreviousSet[]): SetRow[] {
  if (sets.length === 0) {
    return [{ weight: '', reps: '', spotted: false, memo: '' }];
  }
  return sets.map((s) => ({
    weight: String(s.weight),
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
