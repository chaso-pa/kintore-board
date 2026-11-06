/**
 * Relative timings of the record-tab queries on the R7 fixture (20,000 sets / 1,000
 * workouts) in sql.js. The bounds are loose so CI is not flaky; the real budget
 * (< 50 ms per query, < 30 ms per autosave on a mid-range Android) is measured on device
 * in Phase 7.
 */
import { createSqlJsDriver, type SqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import { filterForPart } from '@/lib/records/compute';
import { runMigrations } from '@/lib/records/migrations';
import {
  getExerciseHistory,
  getExerciseList,
  getExerciseMaxE1RM,
  getLastExerciseSets,
  getUnclassifiedExerciseNames,
  getWorkoutDates,
  getWorkoutDetail,
  getWorkoutStats,
} from '@/lib/records/queries';
import { createRepository, type ImportWorkoutItem, type RecordsRepository } from '@/lib/records/repository';

const WORKOUTS = 1000;
const SETS_PER_WORKOUT = 20;
const BOUND_MS = 500;
const EXERCISES: [string, string | null][] = [
  ['ベンチプレス', '胸'],
  ['インクラインベンチ', '胸'],
  ['スクワット', '脚'],
  ['デッドリフト', '背中'],
  ['ラットプルダウン', '背中'],
  ['ショルダープレス', '肩'],
  ['サイドレイズ', '肩'],
  ['アームカール', '腕'],
  ['プルオーバー', '胸'],
  ['プルオーバー', '背中'],
  ['懸垂', null],
  ['レッグプレス', '脚'],
];

function fixture(): ImportWorkoutItem[] {
  const start = Date.parse('2023-01-01T09:00:00Z');
  const items: ImportWorkoutItem[] = [];
  for (let w = 0; w < WORKOUTS; w++) {
    const id = `w${String(w).padStart(5, '0')}`;
    items.push({
      id,
      trained_on: new Date(start + w * 86_400_000).toISOString(),
      memo: null,
      sets: Array.from({ length: SETS_PER_WORKOUT }, (_, i) => {
        const [name, part] = EXERCISES[(w + Math.floor(i / 4)) % EXERCISES.length];
        return {
          id: `${id}:${i}`,
          exercise_name: name,
          weight: name === '懸垂' ? null : 40 + ((w * 7 + i) % 80),
          reps: 1 + ((w + i) % 15),
          sets: i % 3 === 0 ? null : 1 + (i % 4),
          memo: null,
          spotted: false,
          body_part: part,
          sort_order: i,
        };
      }),
    });
  }
  return items;
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  timings.push(`${label.padEnd(28)} ${ms.toFixed(1).padStart(7)} ms`);
  return { ms, result };
}

const timings: string[] = [];
let driver: SqlJsDriver;
let repo: RecordsRepository;
const LAST = `w${String(WORKOUTS - 1).padStart(5, '0')}`;

beforeAll(async () => {
  driver = await createSqlJsDriver();
  await runMigrations(driver);
  repo = createRepository(driver);
  await repo.importPage(fixture(), null, null);
}, 60_000);

afterAll(async () => {
  console.log(`records perf (sql.js, ${WORKOUTS} workouts / ${WORKOUTS * SETS_PER_WORKOUT} sets)\n${timings.join('\n')}`);
  await driver.close();
});

it('loaded the fixture', async () => {
  expect(await getWorkoutStats(repo)).toMatchObject({ total_workouts: WORKOUTS });
});

const bench = filterForPart('胸');

const QUERIES: [string, () => Promise<unknown>][] = [
  ['dates (one month)', () => getWorkoutDates(repo, 2024, 6)],
  ['stats', () => getWorkoutStats(repo)],
  ['exercise list', () => getExerciseList(repo)],
  ['history (bench / 胸)', () => getExerciseHistory(repo, 'ベンチプレス', bench)],
  ['last sets (bench / 胸)', () => getLastExerciseSets(repo, 'ベンチプレス', bench)],
  ['max e1RM (bench / 胸)', () => getExerciseMaxE1RM(repo, 'ベンチプレス', LAST, bench)],
  ['unclassified', () => getUnclassifiedExerciseNames(repo)],
  ['workout detail', () => getWorkoutDetail(repo, LAST)],
];

it.each(QUERIES)('%s', async (label, fn) => {
  await fn(); // warm the statement cache once, as a screen revisit would
  const { ms } = await time(label, fn);
  expect(ms).toBeLessThan(BOUND_MS);
});

it('one autosave + recompute of what it invalidates', async () => {
  const before = await getWorkoutDetail(repo, LAST);
  const { ms } = await time('save + recompute', async () => {
    await repo.saveWorkout(LAST, {
      trained_on: before!.trained_on,
      memo: null,
      sets: before!.sets.map((s, i) => ({
        exercise_name: s.exercise_name,
        weight: s.weight + (i === 0 ? 2.5 : 0),
        reps: s.reps,
        sets: s.sets,
        memo: null,
        spotted: s.spotted,
        body_part: s.body_part ?? null,
      })),
    });
    const d = new Date(before!.trained_on);
    await getWorkoutDetail(repo, LAST);
    await getWorkoutDates(repo, d.getUTCFullYear(), d.getUTCMonth() + 1);
    await getWorkoutStats(repo);
    const entries = new Map(before!.sets.map((s) => [`${s.exercise_name}\u0000${s.body_part ?? ''}`, s]));
    for (const s of entries.values()) {
      const f = filterForPart(s.body_part ?? '');
      await getExerciseHistory(repo, s.exercise_name, f);
      await getLastExerciseSets(repo, s.exercise_name, f);
      await getExerciseMaxE1RM(repo, s.exercise_name, LAST, f);
    }
  });
  // Several entries are recomputed here, so this bound is the per-query one times a few.
  expect(ms).toBeLessThan(BOUND_MS * 4);
});
