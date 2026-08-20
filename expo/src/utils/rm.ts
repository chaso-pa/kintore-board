// Brzycki estimated one-rep max. Returns null outside the formula's usable range:
// past 36 reps the denominator turns negative and the estimate is meaningless.
//
// Kept as a single expression so it stays bit-identical to the Go implementation in
// backend/internal/services/e1rm.go. Both are pinned to the same expectations via
// backend/internal/services/testdata/e1rm_cases.json.
export function estimateOneRM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0 || reps > 36) return null;
  return weight / (1.0278 - 0.0278 * reps);
}

export function formatRM(weight: number, reps: number): string | null {
  const rm = estimateOneRM(weight, reps);
  if (rm === null) return null;
  return `推定1RM: ${rm.toFixed(1)}kg`;
}
