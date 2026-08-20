/**
 * Total lifted volume for a set of recorded sets.
 *
 * Must stay in step with the SQL in GetWorkoutStats and the Go aggregator: all three
 * report the same number to the user on different screens. The sets column is nullable
 * and arrives as 0 when unset, so it is floored at 1 rather than multiplied through —
 * otherwise a single unset row silently contributes nothing.
 */
export function sumTotalVolume(
  sets: { weight: number; reps: number; sets: number }[]
): number {
  return sets.reduce((acc, s) => acc + s.weight * s.reps * Math.max(s.sets, 1), 0);
}
