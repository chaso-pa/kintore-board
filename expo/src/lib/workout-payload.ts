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
}

export interface WorkoutSetPayload {
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  memo: string;
  spotted: boolean;
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
 * Whether there is anything worth writing to the server.
 *
 * An exercise name is the bar, not a weight or a rep count: naming the exercise is the
 * point at which the entry stops being an empty form. Autosave leans on this to decide
 * whether opening the screen and backing out should leave a workout behind — without it,
 * a mis-tap into the record screen would create one.
 */
export function hasAnythingToSave(groups: ExerciseGroup[]): boolean {
  return groups.some((g) => g.exercise_name.trim().length > 0);
}
