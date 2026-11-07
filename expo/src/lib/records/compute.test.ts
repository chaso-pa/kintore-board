import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createSqlJsDriver, type SqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import {
  compareCodePoints,
  exerciseHistory,
  exerciseMaxE1RM,
  filterForPart,
  lastExerciseSets,
  listExercises,
  partMatches,
  unclassifiedExerciseNames,
  workoutDatesForMonth,
  workoutStats,
  type ExerciseFilter,
  type ExerciseSetRow,
} from '@/lib/records/compute';
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

// The same files drive backend/internal/services/workout_golden_test.go. Reading them from
// both languages is what pins the device's numbers to the server's.
const TESTDATA = join(__dirname, '../../../../backend/internal/services/testdata');

interface GoldenSet {
  id: string;
  exercise_name: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  memo: string | null;
  spotted: boolean;
  body_part: string | null;
  sort_order: number;
}
interface GoldenWorkout {
  id: string;
  user_id: string;
  trained_on: string;
  memo: string | null;
  sets: GoldenSet[];
}
interface GoldenCase {
  name: string;
  user_id: string;
  query: {
    year?: number;
    month?: number;
    exercise_name?: string;
    body_part?: string;
    unclassified?: boolean;
    before_workout_id?: string;
  };
  workouts: GoldenWorkout[];
  expected: unknown;
}

type Kind =
  | 'workout_dates'
  | 'workout_stats'
  | 'last_sets'
  | 'max_e1rm'
  | 'exercise_history'
  | 'exercise_list'
  | 'unclassified';

const KINDS: Kind[] = [
  'workout_dates',
  'workout_stats',
  'last_sets',
  'max_e1rm',
  'exercise_history',
  'exercise_list',
  'unclassified',
];

function loadCases(kind: Kind): GoldenCase[] {
  const file = JSON.parse(readFileSync(join(TESTDATA, `${kind}_cases.json`), 'utf8')) as { cases: GoldenCase[] };
  return file.cases;
}

function filterOf(q: GoldenCase['query']): ExerciseFilter {
  return { bodyPart: q.body_part, unclassified: q.unclassified };
}

/** The device DB holds only its owner's workouts, so the server's user scoping is the load. */
function ownWorkouts(c: GoldenCase): GoldenWorkout[] {
  return c.workouts.filter((w) => w.user_id === c.user_id);
}

function query(kind: Kind, repo: RecordsRepository, c: GoldenCase): Promise<unknown> {
  const q = c.query;
  const f = filterOf(q);
  switch (kind) {
    case 'workout_dates':
      return getWorkoutDates(repo, q.year!, q.month!);
    case 'workout_stats':
      return getWorkoutStats(repo);
    case 'last_sets':
      return getLastExerciseSets(repo, q.exercise_name!, f);
    case 'max_e1rm':
      return getExerciseMaxE1RM(repo, q.exercise_name!, q.before_workout_id ?? '', f);
    case 'exercise_history':
      return getExerciseHistory(repo, q.exercise_name!, f);
    case 'exercise_list':
      return getExerciseList(repo);
    case 'unclassified':
      return getUnclassifiedExerciseNames(repo).then((r) => ({
        exercise_names: [...r.exercise_names].sort(compareCodePoints),
      }));
  }
}

/** compute.ts alone, over every own set, for the same case. */
function computeOnly(kind: Kind, c: GoldenCase): unknown {
  const q = c.query;
  const f = filterOf(q);
  const own = ownWorkouts(c);
  const rows: ExerciseSetRow[] = own.flatMap((w) =>
    w.sets.map((s) => ({ ...s, trained_on: w.trained_on, workout_id: w.id }))
  );
  switch (kind) {
    case 'workout_dates':
      return workoutDatesForMonth(own, q.year!, q.month!);
    case 'workout_stats':
      return workoutStats(own.length, rows);
    case 'last_sets':
      return lastExerciseSets(rows, q.exercise_name!, f);
    case 'max_e1rm':
      return exerciseMaxE1RM(rows, q.exercise_name!, q.before_workout_id ?? '', f);
    case 'exercise_history':
      return exerciseHistory(rows, q.exercise_name!, f);
    case 'exercise_list':
      return listExercises(rows);
    case 'unclassified':
      return unclassifiedExerciseNames(rows);
  }
}

function expectedOf(kind: Kind, c: GoldenCase): unknown {
  if (kind !== 'unclassified') return c.expected;
  const e = c.expected as { exercise_names: string[] };
  return { exercise_names: [...e.exercise_names].sort(compareCodePoints) };
}

describe.each(KINDS)('golden %s', (kind) => {
  const cases = loadCases(kind);
  let driver: SqlJsDriver;
  let repo: RecordsRepository;

  beforeEach(async () => {
    driver = await createSqlJsDriver();
    await runMigrations(driver);
    repo = createRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s: queries match the server', async (_name, c) => {
    const items: ImportWorkoutItem[] = ownWorkouts(c).map((w) => ({
      id: w.id,
      trained_on: w.trained_on,
      memo: w.memo,
      sets: w.sets,
    }));
    await repo.importPage(items, null, null);
    expect(await query(kind, repo, c)).toEqual(expectedOf(kind, c));
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s: compute matches the server', (_name, c) => {
    const got = computeOnly(kind, c);
    expect(got).toEqual(expectedOf(kind, c));
  });
});

describe('tombstones', () => {
  let driver: SqlJsDriver;
  let repo: RecordsRepository;
  const T = '2026-08-14T15:30:00.000Z';
  const set = (exercise_name: string, body_part: string | null) => ({
    exercise_name,
    weight: 100,
    reps: 5,
    sets: 1,
    memo: null,
    spotted: false,
    body_part,
  });

  beforeEach(async () => {
    driver = await createSqlJsDriver();
    await runMigrations(driver);
    repo = createRepository(driver);
    await repo.saveWorkout('live', { trained_on: T, memo: null, sets: [set('bench', '胸')] });
    await repo.saveWorkout('gone', { trained_on: '2026-08-15T00:00:00Z', memo: null, sets: [set('row', null)] });
    await repo.deleteWorkout('gone');
  });

  afterEach(async () => {
    await driver.close();
  });

  it('are excluded from every query', async () => {
    expect(await getWorkoutDates(repo, 2026, 8)).toEqual({ workouts: [{ date: '2026-08-14', workout_id: 'live' }] });
    expect(await getWorkoutStats(repo)).toEqual({ total_workouts: 1, total_volume_kg: 500 });
    expect(await getLastExerciseSets(repo, 'row', {})).toBeNull();
    expect((await getExerciseHistory(repo, 'row', {})).points).toEqual([]);
    expect(await getExerciseList(repo)).toEqual({
      items: [{ exercise_name: 'bench', body_part: '胸', last_trained_on: '2026-08-14', session_count: 1, best_e1rm: 100 / (1.0278 - 0.0278 * 5) }],
    });
    expect(await getUnclassifiedExerciseNames(repo)).toEqual({ exercise_names: [] });
    expect(await getWorkoutDetail(repo, 'gone')).toBeNull();
  });
});

describe('getWorkoutDetail', () => {
  it('is shaped like GET /workouts/{id}, empty memo and part omitted, NULL as 0', async () => {
    const driver = await createSqlJsDriver();
    await runMigrations(driver);
    const repo = createRepository(driver, { now: () => new Date('2026-11-06T00:00:00Z') });
    await repo.importPage(
      [
        {
          id: 'w1',
          trained_on: '2026-08-14T15:30:00Z',
          memo: null,
          created_at: '2026-08-14T15:31:00Z',
          sets: [
            { id: 's2', exercise_name: 'pullup', weight: null, reps: 10, sets: null, memo: null, spotted: false, body_part: '', sort_order: 1 },
            { id: 's1', exercise_name: 'bench', weight: 100, reps: 5, sets: 3, memo: 'ok', spotted: true, body_part: '胸', sort_order: 0 },
          ],
        },
      ],
      null,
      null
    );
    expect(await getWorkoutDetail(repo, 'w1')).toEqual({
      id: 'w1',
      trained_on: '2026-08-14T15:30:00.000Z',
      created_at: '2026-08-14T15:31:00.000Z',
      sets: [
        { id: 's1', exercise_name: 'bench', weight: 100, reps: 5, sets: 3, memo: 'ok', spotted: true, body_part: '胸' },
        { id: 's2', exercise_name: 'pullup', weight: 0, reps: 10, sets: 0, spotted: false },
      ],
    });
    expect(await getWorkoutDetail(repo, 'nope')).toBeNull();
    await driver.close();
  });
});

describe('compute helpers', () => {
  it('partMatches is scopeToPart', () => {
    expect(partMatches(null, {})).toBe(true);
    expect(partMatches('胸', { bodyPart: '' })).toBe(true);
    expect(partMatches(null, { unclassified: true })).toBe(true);
    expect(partMatches('', { unclassified: true })).toBe(true);
    expect(partMatches('胸', { unclassified: true })).toBe(false);
    expect(partMatches('胸', { bodyPart: '胸' })).toBe(true);
    expect(partMatches(null, { bodyPart: '胸' })).toBe(false);
  });

  it('filterForPart follows lib/exercise-filter.ts', () => {
    expect(filterForPart('')).toEqual({ unclassified: true });
    expect(filterForPart('胸')).toEqual({ bodyPart: '胸' });
  });

  it('compareCodePoints orders like Go strings, not UTF-16', () => {
    // U+1F4AA (surrogate pair) sorts after U+FF21 by code point, before it by UTF-16 unit.
    expect(compareCodePoints('\u{1F4AA}', 'Ａ')).toBe(1);
    expect('\u{1F4AA}' < 'Ａ').toBe(true);
    expect(compareCodePoints('a', 'ab')).toBe(-1);
    expect(compareCodePoints('b', 'b')).toBe(0);
  });

  it('workoutStats skips NULL weight or reps and floors sets at 1', () => {
    expect(
      workoutStats(2, [
        { weight: 100, reps: 5, sets: 0 },
        { weight: 100, reps: 5, sets: null },
        { weight: 100, reps: 5, sets: 3 },
        { weight: null, reps: 5, sets: 3 },
        { weight: 100, reps: null, sets: 3 },
      ])
    ).toEqual({ total_workouts: 2, total_volume_kg: 2500 });
  });

  it('workoutDatesForMonth keeps the greater id on a timestamp tie', () => {
    const t = '2026-08-20T10:00:00Z';
    expect(
      workoutDatesForMonth(
        [
          { id: 'a', trained_on: t },
          { id: 'b', trained_on: t },
          { id: 'c', trained_on: '2026-07-31T23:59:59Z' },
        ],
        2026,
        8
      )
    ).toEqual({ workouts: [{ date: '2026-08-20', workout_id: 'b' }] });
  });
});
