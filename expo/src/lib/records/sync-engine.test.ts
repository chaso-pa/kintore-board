import { createSqlJsDriver, type SqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import { PERMANENT_CAP_MS } from '@/lib/records/backoff';
import { runMigrations } from '@/lib/records/migrations';
import { createRepository, type LocalSetInput, type RecordsRepository } from '@/lib/records/repository';
import { createSyncEngine, notifyLocalWrite, type SyncEngine, type SyncServerApi } from '@/lib/records/sync-engine';

jest.mock('@/lib/records/server-api', () => ({}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => undefined) },
}));

const T = '2026-11-01T06:30:00.000Z';

function set(exercise_name: string, body_part: string | null = 'chest'): LocalSetInput {
  return { exercise_name, weight: 100, reps: 5, sets: 1, memo: null, spotted: false, body_part };
}

function httpError(status: number, headers: Record<string, string> = {}) {
  return Object.assign(new Error(`status ${status}`), { response: { status, headers } });
}

let driver: SqlJsDriver;
let repo: RecordsRepository;
let clock: number;
let online: boolean;
let api: jest.Mocked<SyncServerApi>;
let engine: SyncEngine;
let calls: string[];

beforeEach(async () => {
  driver = await createSqlJsDriver();
  await runMigrations(driver);
  clock = Date.parse('2026-11-06T00:00:00.000Z');
  online = true;
  calls = [];
  repo = createRepository(driver, { now: () => new Date(clock) });
  api = {
    upsertWorkout: jest.fn(async (b) => {
      calls.push(`upsert:${b.id}`);
    }),
    deleteWorkout: jest.fn(async (id) => {
      calls.push(`delete:${id}`);
    }),
    classifyExercises: jest.fn(async (m) => {
      calls.push(`classify:${m.map((x) => x.exercise_name).join(',')}`);
      return m.length;
    }),
  };
  engine = createSyncEngine({
    getRepo: () => repo,
    api,
    isOnline: () => online,
    now: () => new Date(clock),
    random: () => 0.5, // no jitter
  });
});

afterEach(async () => {
  await engine.stop();
  jest.useRealTimers();
  await driver.close();
});

/** Starts (which kicks one cycle) and lets that cycle finish, without asking for another. */
async function start() {
  engine.start();
  await new Promise((r) => setTimeout(r, 20));
}

async function raw(id: string) {
  return driver.getFirst<{
    local_version: number;
    synced_version: number;
    deleted_at: string | null;
    next_attempt_at: string | null;
    sync_attempts: number;
    last_error: string | null;
  }>('SELECT local_version, synced_version, deleted_at, next_attempt_at, sync_attempts, last_error FROM workouts WHERE id = ?', [id]);
}

describe('sync engine', () => {
  it('sends a single DELETE for a workout created, edited and deleted offline', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.saveWorkout('w1', { trained_on: T, memo: 'more', sets: [set('bench'), set('fly')] });
    await repo.deleteWorkout('w1');

    online = false;
    await start();
    expect(calls).toEqual([]);

    online = true;
    await engine.kick('online');
    expect(calls).toEqual(['delete:w1']);
    expect(await repo.unsyncedCount()).toBe(0);
    expect((await raw('w1'))?.deleted_at).not.toBeNull();
  });

  it('posts the full payload, coercing nulls, and settles it', async () => {
    await repo.saveWorkout('w1', {
      trained_on: T,
      memo: null,
      sets: [{ exercise_name: 'bench', weight: null, reps: 5, sets: null, memo: null, spotted: true, body_part: null }],
    });
    await start();
    expect(api.upsertWorkout).toHaveBeenCalledWith({
      id: 'w1',
      trained_on: T,
      memo: '',
      sets: [{ exercise_name: 'bench', weight: 0, reps: 5, sets: 0, memo: '', spotted: true }],
    });
    expect(await repo.unsyncedCount()).toBe(0);
  });

  it('keeps a workout dirty when it is edited while being sent (CAS)', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    api.upsertWorkout.mockImplementationOnce(async () => {
      await repo.saveWorkout('w1', { trained_on: T, memo: 'appended', sets: [set('bench'), set('fly')] });
    });
    await start();
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);
    expect(await raw('w1')).toMatchObject({ local_version: 2, synced_version: 1 });

    await engine.kick('local-write');
    expect(api.upsertWorkout).toHaveBeenCalledTimes(2);
    expect(api.upsertWorkout.mock.calls[1][0].memo).toBe('appended');
    expect(await repo.unsyncedCount()).toBe(0);
  });

  it('settles a 410 as a tombstone', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    api.upsertWorkout.mockRejectedValueOnce(httpError(410));
    await start();
    expect(await repo.getWorkout('w1')).toBeNull();
    expect(await raw('w1')).toMatchObject({ synced_version: 1 });
    expect((await raw('w1'))?.deleted_at).not.toBeNull();
    expect(await repo.unsyncedCount()).toBe(0);
    expect(engine.getLog().some((e) => e.event === 'gone')).toBe(true);
  });

  it('treats a 404 on DELETE (older server) as success', async () => {
    await repo.deleteWorkout('w1');
    api.deleteWorkout.mockRejectedValueOnce(httpError(404));
    await start();
    expect(await repo.unsyncedCount()).toBe(0);
  });

  it('backs off exponentially on 5xx and network errors', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    api.upsertWorkout.mockRejectedValueOnce(httpError(503)).mockRejectedValueOnce(new Error('Network Error'));
    await start();
    let r = await raw('w1');
    expect(r).toMatchObject({ sync_attempts: 1, synced_version: 0 });
    expect(Date.parse(r!.next_attempt_at!) - clock).toBe(2_000);
    expect(r?.last_error).toContain('HTTP 503');

    await engine.kick('again'); // not due yet
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await engine.kick('retry');
    r = await raw('w1');
    expect(r).toMatchObject({ sync_attempts: 2 });
    expect(Date.parse(r!.next_attempt_at!) - clock).toBe(4_000);

    clock += 4_000;
    await engine.kick('retry');
    expect(await repo.unsyncedCount()).toBe(0);
  });

  it('ends the cycle on a no-response error instead of timing out every workout', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.saveWorkout('w2', { trained_on: T, memo: null, sets: [set('squat')] });
    api.upsertWorkout.mockRejectedValueOnce(new Error('Network Error'));
    await start();
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);
    expect(await repo.unsyncedCount()).toBe(2);
  });

  it('moves on to the next workout after a server error response', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.saveWorkout('w2', { trained_on: T, memo: null, sets: [set('squat')] });
    api.upsertWorkout.mockRejectedValueOnce(httpError(503));
    await start();
    expect(api.upsertWorkout).toHaveBeenCalledTimes(2);
    expect(await repo.unsyncedCount()).toBe(1);
  });

  it('honours Retry-After on 429', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    api.upsertWorkout.mockRejectedValueOnce(httpError(429, { 'retry-after': '30' }));
    await start();
    const r = await raw('w1');
    expect(Date.parse(r!.next_attempt_at!) - clock).toBe(30_000);
  });

  it('keeps retrying permanent errors up to a 6h cap', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await driver.run('UPDATE workouts SET sync_attempts = 20');
    api.upsertWorkout.mockRejectedValueOnce(httpError(409));
    await start();
    const r = await raw('w1');
    expect(Date.parse(r!.next_attempt_at!) - clock).toBe(PERMANENT_CAP_MS);
    expect(r?.last_error).toContain('HTTP 409');
    expect(r?.synced_version).toBe(0);
  });

  it('stops on 401 and resumes after re-auth', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    await repo.saveWorkout('w2', { trained_on: T, memo: null, sets: [set('bench')] });
    api.upsertWorkout.mockRejectedValueOnce(httpError(401));
    await start();
    expect(engine.started).toBe(false);
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1); // w2 not attempted
    expect((await raw('w1'))?.sync_attempts).toBe(0);

    await engine.kick('ignored');
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);

    await start(); // records-store restarts it after re-auth
    expect(await repo.unsyncedCount()).toBe(0);
  });

  it('drops to a 6h low-frequency mode on 403 without stopping', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    api.upsertWorkout.mockRejectedValueOnce(httpError(403));
    await start();
    expect(engine.started).toBe(true);
    expect(engine.lowFrequencyUntil).toBe(clock + PERMANENT_CAP_MS);

    clock += 60_000;
    await engine.kick('timer');
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);

    clock += PERMANENT_CAP_MS;
    await engine.kick('retry');
    expect(api.upsertWorkout).toHaveBeenCalledTimes(2);
    expect(engine.lowFrequencyUntil).toBeNull();
    expect(await repo.unsyncedCount()).toBe(0);
  });

  it('sends classifications after the upserts and CAS-deletes them', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('mystery', null)] });
    await repo.classifyExercises([{ name: 'mystery', part: 'back' }]);
    await start();
    expect(calls).toEqual(['upsert:w1', 'classify:mystery']);
    expect(await repo.listPendingClassifications()).toEqual([]);
  });

  it('re-sends a classification changed while it was in flight', async () => {
    await repo.classifyExercises([{ name: 'mystery', part: 'back' }]);
    api.classifyExercises.mockImplementationOnce(async () => {
      clock += 1;
      await repo.classifyExercises([{ name: 'mystery', part: 'legs' }]);
      return 1;
    });
    await start();
    expect(await repo.listPendingClassifications()).toMatchObject([{ exercise_name: 'mystery', body_part: 'legs' }]);

    await engine.kick('again');
    expect(api.classifyExercises).toHaveBeenLastCalledWith([{ exercise_name: 'mystery', body_part: 'legs' }]);
    expect(await repo.listPendingClassifications()).toEqual([]);
  });

  it('backs classification off on failure and still sends upserts first', async () => {
    await repo.classifyExercises([{ name: 'mystery', part: 'back' }]);
    api.classifyExercises.mockRejectedValueOnce(httpError(500));
    await start();
    expect(await repo.listPendingClassifications()).toHaveLength(1);
    await engine.kick('soon');
    expect(api.classifyExercises).toHaveBeenCalledTimes(1);
    clock += 2_000;
    await engine.kick('retry');
    expect(await repo.listPendingClassifications()).toEqual([]);
  });

  it('runs one cycle at a time and stop waits for it', async () => {
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    let release!: () => void;
    api.upsertWorkout.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    engine.start();
    await new Promise((r) => setTimeout(r, 10));
    void engine.kick('second');
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = engine.stop().then(() => {
      stopped = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);
  });

  it('kicks 2s after the last local write', async () => {
    jest.useFakeTimers();
    engine.start();
    await jest.advanceTimersByTimeAsync(0);
    await engine.kick('drain');
    await repo.saveWorkout('w1', { trained_on: T, memo: null, sets: [set('bench')] });
    notifyLocalWrite();
    await jest.advanceTimersByTimeAsync(1_500);
    notifyLocalWrite();
    await jest.advanceTimersByTimeAsync(1_500);
    expect(api.upsertWorkout).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(600);
    await engine.kick('drain');
    expect(api.upsertWorkout).toHaveBeenCalledTimes(1);
  });
});
