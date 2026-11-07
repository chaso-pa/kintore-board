/**
 * The record editors' autosave write (plan §3.3): local DB, targeted invalidation, then a
 * nudge to the sync engine. Nothing here waits on the network.
 */
import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { invalidateAfterSave, type WorkoutSnapshot } from '@/lib/records/invalidate';
import type { RecordsRepository, SaveWorkoutPayload } from '@/lib/records/repository';
import { notifyLocalWrite } from '@/lib/records/sync-engine';
import type { WorkoutPayload } from '@/lib/workout-payload';

/** The form's payload as stored: empty strings become NULL, like the server's omitted fields. */
export function toLocalPayload(v: WorkoutPayload): SaveWorkoutPayload {
  return {
    trained_on: v.trained_on,
    memo: v.memo || null,
    sets: v.sets.map((s) => ({
      exercise_name: s.exercise_name,
      weight: s.weight,
      reps: s.reps,
      sets: s.sets,
      memo: s.memo || null,
      spotted: s.spotted,
      body_part: s.body_part || null,
    })),
  };
}

export function snapshotOf(p: SaveWorkoutPayload): WorkoutSnapshot {
  return {
    trained_on: p.trained_on,
    sets: p.sets.map((s) => ({ exercise_name: s.exercise_name, body_part: s.body_part })),
  };
}

const hasUnclassified = (w: WorkoutSnapshot | null) => !!w?.sets.some((s) => !s.body_part);

/**
 * Saves `v` as workout `workoutId`. `before` is what the caller last saved (or loaded), so
 * the months and exercises it touched are refreshed too. Returns the new snapshot, or
 * `before` unchanged when the workout has been deleted meanwhile (the write is dropped).
 *
 * The repository write is queued before the first await, so a read issued after this call
 * (the record tab opening the day, the edit form loading) sees it.
 */
export async function saveLocalWorkout(
  qc: QueryClient,
  owner: string,
  repo: RecordsRepository,
  workoutId: string,
  v: WorkoutPayload,
  before: WorkoutSnapshot | null
): Promise<WorkoutSnapshot | null> {
  const payload = toLocalPayload(v);
  const saved = await repo.saveWorkout(workoutId, payload);
  if (!saved) return before;
  const after = snapshotOf(payload);
  invalidateAfterSave(qc, owner, { workoutId, before, after });
  if (hasUnclassified(before) || hasUnclassified(after)) {
    qc.invalidateQueries({ queryKey: queryKeys.records.unclassified(owner) });
  }
  notifyLocalWrite();
  return after;
}
