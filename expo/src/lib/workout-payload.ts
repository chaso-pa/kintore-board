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
