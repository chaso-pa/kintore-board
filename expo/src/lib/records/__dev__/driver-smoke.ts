/**
 * On-device smoke test of the repository over the real expo-sqlite driver (plan R8).
 * jest runs the same scenarios over sql.js; this catches differences in the native
 * SQLite build and the exclusive-transaction connection. For a __DEV__ menu.
 */
import { runMigrations } from '@/lib/records/migrations';
import { createRepository } from '@/lib/records/repository';
import { deleteDatabase, isRecordsSupported, openDriver } from '@/lib/records/sqlite-driver';

export interface SmokeResult {
  name: string;
  ok: boolean;
  error?: string;
}

function check(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const set = (exercise_name: string, weight: number) => ({
  exercise_name,
  weight,
  reps: 5,
  sets: 1,
  memo: null,
  spotted: false,
  body_part: null,
});

export async function runDriverSmoke(): Promise<SmokeResult[]> {
  if (!isRecordsSupported) return [{ name: 'platform supported', ok: false, error: 'not supported' }];
  const name = `records_smoke_${Date.now()}.db`;
  const results: SmokeResult[] = [];
  const driver = await openDriver(name);
  try {
    await runMigrations(driver);
    const repo = createRepository(driver);
    const step = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ name: label, ok: true });
      } catch (e) {
        results.push({ name: label, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    };
    const t = '2026-11-01T06:30:00.000Z';

    await step('save replaces sets', async () => {
      await repo.saveWorkout('w1', { trained_on: t, memo: null, sets: [set('bench', 100), set('row', 60)] });
      await repo.saveWorkout('w1', { trained_on: t, memo: 'x', sets: [set('squat', 140)] });
      const w = await repo.getWorkout('w1');
      check(w?.sets.length === 1 && w.sets[0].exercise_name === 'squat', 'sets not replaced');
    });
    await step('CAS keeps dirty after concurrent edit', async () => {
      const [d] = await repo.listDirty(10, new Date());
      await repo.saveWorkout('w1', { trained_on: t, memo: 'y', sets: [] });
      await repo.markSynced('w1', d.local_version);
      check((await repo.listDirty(10, new Date())).length === 1, 'should still be dirty');
    });
    await step('save on tombstone is a no-op', async () => {
      await repo.deleteWorkout('w1');
      check(!(await repo.saveWorkout('w1', { trained_on: t, memo: null, sets: [] })), 'save applied');
      check((await repo.getWorkout('w1')) === null, 'workout resurrected');
    });
    await step('import skips tombstones', async () => {
      await repo.importPage(
        [
          { id: 'w1', trained_on: t, memo: null, sets: [] },
          { id: 'w2', trained_on: t, memo: null, sets: [{ id: 's1', exercise_name: 'dl', weight: null }] },
        ],
        null,
        t
      );
      check((await repo.getWorkout('w1')) === null, 'tombstone imported');
      check((await repo.getWorkout('w2'))?.sets[0].weight === null, 'raw null lost');
      check((await repo.getCoverageState()).importState === 'done', 'state not done');
    });
    await step('classify fills empty parts only', async () => {
      await repo.classifyExercises([{ name: 'dl', part: 'back' }]);
      check((await repo.getWorkout('w2'))?.sets[0].body_part === 'back', 'not classified');
      check((await repo.listPendingClassifications()).length === 1, 'no pending row');
    });
    await step('concurrent writes serialize', async () => {
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          repo.saveWorkout(`c${i}`, { trained_on: t, memo: null, sets: [set('x', i)] })
        )
      );
      check((await repo.getAllWorkoutRows()).length === 21, 'lost a write');
    });
  } finally {
    await driver.close().catch(() => undefined);
    await deleteDatabase(name).catch(() => undefined);
  }
  return results;
}
