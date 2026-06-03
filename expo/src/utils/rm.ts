export function estimateOneRM(weight: number, reps: number): number | null {
  if (weight <= 0 || reps <= 0 || reps > 36) return null;
  if (reps === 1) return weight;
  return weight / (1.0278 - 0.0278 * reps);
}

export function formatRM(weight: number, reps: number): string | null {
  const rm = estimateOneRM(weight, reps);
  if (rm === null) return null;
  return `推定1RM: ${rm.toFixed(1)}kg`;
}
