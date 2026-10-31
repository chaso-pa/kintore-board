import { api } from '@/lib/api';

/**
 * Workout writes that have been sent and not yet answered.
 *
 * Autosave does not hold the screen open for its last write: leaving the record screen
 * fires a final save and lets it finish in the background. Anything that reads a workout
 * straight after — the detail screen, the edit form, the calendar's day → workout map — could
 * therefore be answered from before that write landed. The edit form was the dangerous one:
 * it took the stale copy as its starting point and then saved it, overwriting the sets that
 * had just been recorded.
 *
 * Reads of workout data wait on this first, so they see the write that was already on its
 * way.
 */

const pending = new Set<Promise<unknown>>();

/** Registers a write and passes it through unchanged. */
export function trackWorkoutWrite<T>(write: Promise<T>): Promise<T> {
  pending.add(write);
  const done = () => pending.delete(write);
  write.then(done, done);
  return write;
}

export function hasPendingWorkoutWrites(): boolean {
  return pending.size > 0;
}

/**
 * Resolves once every write sent so far has settled, successfully or not. A failed write is
 * not this function's business — autosave keeps it dirty and retries.
 */
export async function settleWorkoutWrites(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}

/**
 * A v4-shaped id for a workout that has not been created yet.
 *
 * Sent with the first save so that a create retried after a lost reply updates the record
 * it already made instead of adding a second one for the same day. It only has to be unique,
 * not unguessable — the server checks ownership — so Math.random is enough, and it avoids a
 * native module for something this small.
 */
export function newWorkoutId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/**
 * The fetch behind `queryKeys.workouts.detail`. Shared by every screen that reads that key,
 * because TanStack runs whichever observer's queryFn starts the fetch — one copy that skipped
 * the wait would let the stale read back in for all of them.
 */
export async function fetchWorkoutDetail<T>(workoutId: string): Promise<T> {
  await settleWorkoutWrites();
  const res = await api.get<T>(`/api/v1/workouts/${workoutId}`);
  return res.data;
}

/** The fetch behind `queryKeys.workouts.dates`, shared for the same reason. */
export async function fetchWorkoutDates<T>(year: number, month: number): Promise<T> {
  await settleWorkoutWrites();
  const res = await api.get<T>('/api/v1/workouts/dates', { params: { year, month } });
  return res.data;
}
