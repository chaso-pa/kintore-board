/**
 * Cache invalidation after local writes (plan §3.3, R7).
 *
 * An autosave invalidates only what that one workout can change, so typing in the editor
 * does not recompute the whole record tab. The exercise list is left out on purpose: it is
 * refreshed when the editor closes and when the list screens gain focus
 * (invalidateExercises). Delete, import and classification use invalidateAllRecords.
 */
import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { dateKey } from '@/lib/records/date-key';

/** A workout as it was before or is after the save; null when it did not / does not exist. */
export interface WorkoutSnapshot {
  trained_on: string;
  sets: { exercise_name: string; body_part: string | null }[];
}

export interface SaveChange {
  workoutId: string;
  before: WorkoutSnapshot | null;
  after: WorkoutSnapshot | null;
}

export function invalidateAfterSave(qc: QueryClient, owner: string, { workoutId, before, after }: SaveChange): void {
  const k = queryKeys.records;
  qc.invalidateQueries({ queryKey: k.detail(owner, workoutId) });
  qc.invalidateQueries({ queryKey: k.stats(owner) });

  const months = new Set<string>();
  const entries = new Map<string, [string, string]>();
  for (const w of [before, after]) {
    if (!w) continue;
    months.add(dateKey(w.trained_on).slice(0, 7));
    for (const s of w.sets) {
      const part = s.body_part ?? '';
      entries.set(`${s.exercise_name}\u0000${part}`, [s.exercise_name, part]);
    }
  }
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number);
    qc.invalidateQueries({ queryKey: k.dates(owner, y, mo) });
  }
  for (const [name, part] of entries.values()) {
    qc.invalidateQueries({ queryKey: k.history(owner, name, part) });
    qc.invalidateQueries({ queryKey: k.lastSets(owner, name, part) });
  }
  if (entries.size > 0) {
    // maxE1RM is keyed by the workout it excludes first, so the entry has to be matched on
    // the trailing elements: every other workout's PR badge for these entries may change.
    const prefix = k.root(owner);
    const maxTag = k.maxE1RM(owner, '', '', '')[2];
    qc.invalidateQueries({
      predicate: ({ queryKey: key }) =>
        key[0] === prefix[0] &&
        key[1] === owner &&
        key[2] === maxTag &&
        entries.has(`${String(key[4])}\u0000${String(key[5])}`),
    });
  }
}

export function invalidateExercises(qc: QueryClient, owner: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.records.exercises(owner) });
}

export function invalidateAllRecords(qc: QueryClient, owner: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.records.root(owner) });
}
