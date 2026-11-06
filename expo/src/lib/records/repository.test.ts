import { createSqlJsDriver, type SqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import { getUserVersion, MIGRATIONS, runMigrations } from '@/lib/records/migrations';
import { createRepository, type LocalSetInput, type RecordsRepository } from '@/lib/records/repository';

const T = '2026-11-01T06:30:00.000Z';

function set(exercise_name: string, weight: number | null = 100, body_part: string | null = 'chest'): LocalSetInput {
  return { exercise_name, weight, reps: 5, sets: 1, memo: null, spotted: false, body_part };
}

let driver: SqlJsDriver;
let repo: RecordsRepository;
let clock: number;

beforeEach(async () => {
  driver = await createSqlJsDriver();
  await runMigrations(driver);
  clock = Date.parse('2026-11-06T00:00:00.000Z');
  repo = createRepository(driver, { now: () => new Date(clock) });
});

afterEach(async () => {
  await driver.close();
});

async function rawWorkout(id: string) {
  return driver.getFirst<{ local_version: number; synced_version: number; deleted_at: string | null; origin: string }>(
    'SELECT local_version, synced_version, deleted_at, origin FROM workouts WHERE id = ?',
    [id]
  );
}

describe('saveWorkout', () => {
  it('upserts and fully replaces the sets, bumping local_version', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: 'a', sets: [set('bench'), set('fly')] });
    clock += 1000;
    await repo.saveWorkout('w1', { trained_on: T, memo: 'b', sets: [set('squat', 140, 'legs')] });

    const w = await repo.getWorkout('w1');
    expect(w?.memo).toBe('b');
    expect(w?.updated_at).toBe('2026-11-06T00:00:01.000Z');
    expect(w?.created_at).toBe('2026-11-06T00:00:00.000Z');
    expect(w?.sets.map((s) => [s.exercise_name, s.sort_order])).toEqual([['squat', 0]]);
    expect(await rawWorkout('w1')).toMatchObject({ local_version: 2, synced_version: 0, origin: 'local' });
  });

  it('normalizes trained_on to UTC ISO with milliseconds', async () => {
    await repo.saveWorkout('w1', { trained_on: '2026-11-01T15:30:00+09:00', memo: null, sets: [] });
    expect((await repo.getWorkout('w1'))?.trained_on).toBe('2026-11-01T06:30:00.000Z');
  });

  it('is a no-op on a tombstone', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.deleteWorkout('w1');
    const before = await rawWorkout('w1');

    expect(await repo.saveWorkout('w1', { trained_on: T, memo: 'late', sets: [set('bench')] })).toBe(false);
    expect(await repo.getWorkout('w1')).toBeNull();
    expect(await rawWorkout('w1')).toEqual(before);
  });
});

describe('deleteWorkout', () => {
  it('keeps a tombstone row, drops sets and bumps the version', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.deleteWorkout('w1');

    expect(await rawWorkout('w1')).toMatchObject({ local_version: 2, deleted_at: '2026-11-06T00:00:00.000Z' });
    expect(await driver.getAll('SELECT * FROM workout_sets')).toEqual([]);
    expect(await repo.getAllWorkoutRows()).toEqual([]);
    const [dirty] = await repo.listDirty(10, new Date(clock));
    expect(dirty).toMatchObject({ id: 'w1', deleted: true, local_version: 2 });
  });

  it('tombstones an id it has never seen', async () => {
    await repo.deleteWorkout('ghost');
    expect(await rawWorkout('ghost')).toMatchObject({ local_version: 1, synced_version: 0 });
    expect((await rawWorkout('ghost'))?.deleted_at).not.toBeNull();
  });
});

describe('sync bookkeeping', () => {
  it('CAS keeps the row dirty when it was edited during the send', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    const [sent] = await repo.listDirty(10, new Date(clock));
    expect(sent.local_version).toBe(1);

    await repo.saveWorkout('w1', { trained_on: T, memo: 'edited', sets: [set('bench')] });
    await repo.markSynced('w1', sent.local_version);

    expect(await rawWorkout('w1')).toMatchObject({ local_version: 2, synced_version: 1 });
    expect(await repo.listDirty(10, new Date(clock))).toHaveLength(1);

    await repo.markSynced('w1', 2);
    expect(await repo.listDirty(10, new Date(clock))).toHaveLength(0);
    // A stale ack can never move synced_version backwards.
    expect(await repo.markSynced('w1', 1)).toBe(false);
    expect(await rawWorkout('w1')).toMatchObject({ synced_version: 2 });
  });

  it('respects next_attempt_at after a failure', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [] });
    await repo.recordAttemptFailure('w1', new Date(clock + 60_000), 'timeout');

    expect(await repo.listDirty(10, new Date(clock))).toEqual([]);
    const [d] = await repo.listDirty(10, new Date(clock + 60_000));
    expect(d.sync_attempts).toBe(1);
  });

  it('settles a 410 as a synced tombstone', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.markDeletedFromServer('w1');

    const row = await rawWorkout('w1');
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.synced_version).toBe(row?.local_version);
    expect(await driver.getAll('SELECT * FROM workout_sets')).toEqual([]);
  });
});

describe('importPage', () => {
  it('skips tombstones, leaves local rows alone and tracks coverage', async () => {
    await repo.saveWorkout('local', { trained_on: T, memo: 'mine', sets: [set('bench')] });
    await repo.deleteWorkout('gone');

    const result = await repo.importPage(
      [
        { id: 'local', trained_on: T, memo: 'server', sets: [{ id: 'x1', exercise_name: 'other' }] },
        { id: 'gone', trained_on: T, memo: null, sets: [{ id: 'x2', exercise_name: 'zombie' }] },
        {
          id: 'new',
          trained_on: '2026-10-30T15:30:00Z',
          memo: null,
          sets: [{ id: 's1', exercise_name: 'dl', weight: null, reps: null, sets: null, memo: null, body_part: null }],
        },
      ],
      'cursor-2',
      '2026-10-30T15:30:00Z'
    );

    expect(result.inserted).toBe(1);
    expect((await repo.getWorkout('local'))?.memo).toBe('mine');
    expect((await repo.getWorkout('local'))?.sets[0].exercise_name).toBe('bench');
    expect(await repo.getWorkout('gone')).toBeNull();
    const imported = await repo.getWorkout('new');
    expect(imported?.sets[0]).toMatchObject({ id: 's1', weight: null, reps: null, sets: null, body_part: null });
    expect(await rawWorkout('new')).toMatchObject({ local_version: 1, synced_version: 1, origin: 'import' });
    expect(await repo.getCoverageState()).toEqual({
      importState: 'running',
      coveredFrom: '2026-10-30T15:30:00.000Z',
      importCount: 3,
    });
    expect(await repo.getMeta('import_cursor')).toBe('cursor-2');

    await repo.importPage([], null, null);
    expect(await repo.getCoverageState()).toMatchObject({ importState: 'done', coveredFrom: '2026-10-30T15:30:00.000Z' });
    // Imported rows are clean: nothing to send.
    expect((await repo.listDirty(10, new Date(clock))).map((d) => d.id).sort()).toEqual(['gone', 'local']);
  });
});

describe('classification', () => {
  it('fills only empty parts, keeps versions and queues the server update', async () => {
    await repo.importPage(
      [
        {
          id: 'w1',
          trained_on: T,
          memo: null,
          sets: [
            { id: 'a', exercise_name: 'dl', body_part: null },
            { id: 'b', exercise_name: 'dl', body_part: '' },
            { id: 'c', exercise_name: 'dl', body_part: 'legs' },
          ],
        },
      ],
      null,
      T
    );
    await repo.classifyExercises([{ name: 'dl', part: 'back' }]);

    expect((await repo.getWorkout('w1'))?.sets.map((s) => s.body_part)).toEqual(['back', 'back', 'legs']);
    expect(await rawWorkout('w1')).toMatchObject({ local_version: 1, synced_version: 1 });
    expect(await repo.listPendingClassifications()).toEqual([
      { exercise_name: 'dl', body_part: 'back', created_at: '2026-11-06T00:00:00.000Z', attempts: 0 },
    ]);
  });

  it('deletes a pending row only if it was not re-classified meanwhile', async () => {
    await repo.classifyExercises([{ name: 'dl', part: 'back' }]);
    const [sent] = await repo.listPendingClassifications();
    await repo.classifyExercises([{ name: 'dl', part: 'legs' }]); // same millisecond

    expect(await repo.deletePendingClassificationCAS('dl', sent.created_at)).toBe(false);
    const [current] = await repo.listPendingClassifications();
    expect(current.body_part).toBe('legs');
    expect(await repo.deletePendingClassificationCAS('dl', current.created_at)).toBe(true);
    expect(await repo.listPendingClassifications()).toEqual([]);
  });
});

describe('unsyncedCount', () => {
  it('counts dirty workouts, dirty tombstones and pending classifications', async () => {
    expect(await repo.unsyncedCount()).toBe(0);
    await repo.importPage([{ id: 'imp', trained_on: T, memo: null, sets: [] }], 'c', T);
    expect(await repo.unsyncedCount()).toBe(0);

    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [] });
    await repo.deleteWorkout('imp');
    await repo.classifyExercises([{ name: 'dl', part: 'back' }]);
    expect(await repo.unsyncedCount()).toBe(3);

    await repo.markSynced('w1', 1);
    expect(await repo.unsyncedCount()).toBe(2);
  });
});

describe('serialization', () => {
  it('reads see writes issued before them', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      repo.saveWorkout(`w${i}`, { trained_on: T, memo: null, sets: [set('bench', i)] })
    );
    const rows = await repo.getAllWorkoutRows();
    await Promise.all(writes);
    expect(rows).toHaveLength(10);
  });

  it('rolls back a failed write and keeps the queue going', async () => {
    await expect(
      repo.saveWorkout('w1', { trained_on: 'not a date', memo: null, sets: [] })
    ).rejects.toThrow();
    await repo.saveWorkout('w2', { trained_on: T, memo: null, sets: [] });
    expect((await repo.getAllWorkoutRows()).map((r) => r.id)).toEqual(['w2']);
  });
});

describe('migrations', () => {
  it('sets user_version to the latest', async () => {
    expect(await getUserVersion(driver)).toBe(MIGRATIONS.length);
  });

  it('upgrades v1 to a dummy v2 keeping the data', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: 'keep', sets: [set('bench')] });
    await repo.classifyExercises([{ name: 'bench', part: 'chest' }]);
    const file = driver.export();

    const reopened = await createSqlJsDriver(file);
    try {
      const v2 = [...MIGRATIONS, "ALTER TABLE workouts ADD COLUMN rating INTEGER; UPDATE workouts SET rating = 3;"];
      expect(await runMigrations(reopened, v2)).toBe(2);
      expect(await getUserVersion(reopened)).toBe(2);

      const repo2 = createRepository(reopened);
      expect((await repo2.getWorkout('w1'))?.memo).toBe('keep');
      expect((await repo2.getWorkout('w1'))?.sets).toHaveLength(1);
      expect(await repo2.listPendingClassifications()).toHaveLength(1);
      expect(await reopened.getFirst('SELECT rating FROM workouts WHERE id = ?', ['w1'])).toEqual({ rating: 3 });
      // Running again is a no-op.
      expect(await runMigrations(reopened, v2)).toBe(2);
    } finally {
      await reopened.close();
    }
  });

  it('refuses a DB newer than the app', async () => {
    await driver.exec('PRAGMA user_version = 99');
    await expect(runMigrations(driver)).rejects.toThrow(/newer/);
  });
});

describe('devInsertSynced', () => {
  it('inserts workouts already settled, leaving import meta alone', async () => {
    await repo.devInsertSynced([
      { id: 'a1', trained_on: '2026-11-01T06:30:00.000Z', memo: null, sets: [{ id: 'a1-s0', exercise_name: 'bench', reps: 5 }] },
    ]);
    expect(await repo.unsyncedCount()).toBe(0);
    expect(await repo.listDirty(10, new Date(Date.now() + 86_400_000))).toEqual([]);
    expect((await repo.getWorkout('a1'))?.sets).toHaveLength(1);
    expect(await repo.getMeta('import_count')).toBeNull();
  });
});
