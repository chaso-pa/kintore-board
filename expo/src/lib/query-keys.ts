/**
 * Query keys that must stay stable across UI state.
 *
 * The exercise history endpoint returns the full history with every metric already
 * computed, so the client switches metric and period locally. Keeping those out of the
 * key is what makes those switches instant — adding either one here would silently
 * reintroduce a refetch per toggle.
 */
export function exerciseHistoryQueryKey(exerciseName: string) {
  return ['exercise-history', exerciseName] as const;
}

export function exerciseListQueryKey() {
  return ['exercises'] as const;
}
