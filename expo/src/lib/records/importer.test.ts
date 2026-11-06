import { createSqlJsDriver, type SqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import { isDateComplete } from '@/lib/records/coverage';
import { createImporter, type Importer } from '@/lib/records/importer';
import { runMigrations } from '@/lib/records/migrations';
import { createRepository, type RecordsRepository } from '@/lib/records/repository';
import type { ExportPage, ExportWorkoutItem } from '@/lib/records/server-api';

jest.mock('@/lib/records/server-api', () => ({}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => undefined) },
}));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), deleteDatabaseAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

function item(id: string, trainedOn: string): ExportWorkoutItem {
  return {
    id,
    trained_on: trainedOn,
    memo: null,
    created_at: trainedOn,
    sets: [
      { id: `${id}-s0`, exercise_name: 'bench', weight: null, reps: 5, sets: null, memo: null, spotted: false, body_part: null, sort_order: 0 },
    ],
  };
}

const PAGES: Record<string, ExportPage> = {
  '': { items: [item('w3', '2026-11-05T10:00:00Z'), item('w2', '2026-11-03T10:00:00Z')], next_cursor: 'c1' },
  c1: { items: [item('w1', '2026-10-01T10:00:00Z')], next_cursor: '' },
};

let driver: SqlJsDriver;
let repo: RecordsRepository;
let online: boolean;
let authActive: boolean;
let exportPage: jest.Mock<Promise<ExportPage>, [string, number?]>;
let onDone: jest.Mock;
let importer: Importer;

beforeEach(async () => {
  driver = await createSqlJsDriver();
  await runMigrations(driver);
  repo = createRepository(driver);
  await repo.setMeta('import_state', 'pending');
  online = true;
  authActive = true;
  exportPage = jest.fn(async (cursor: string) => PAGES[cursor]);
  onDone = jest.fn();
  importer = createImporter({
    getRepo: () => repo,
    api: { exportPage },
    isOnline: () => online,
    isAuthActive: () => authActive,
    onDone,
    onProgress: () => undefined,
    random: () => 0.5,
  });
});

afterEach(async () => {
  await importer.stop();
  await driver.close();
});

async function startAndSettle() {
  importer.start();
  await importer.run('test');
}

describe('importer', () => {
  it('imports every page, updating coverage, then goes done and kicks sync', async () => {
    const seen: { state: string; coveredFrom: string | null }[] = [];
    exportPage.mockImplementation(async (cursor) => {
      const s = await repo.getCoverageState();
      seen.push({ state: s.importState, coveredFrom: s.coveredFrom });
      return PAGES[cursor];
    });
    await startAndSettle();

    expect(exportPage.mock.calls.map((c) => c[0])).toEqual(['', 'c1']);
    expect(exportPage).toHaveBeenCalledWith('', 200);
    // Before page 2: running, covered back to page 1's oldest day (that day itself incomplete).
    expect(seen[1]).toEqual({ state: 'running', coveredFrom: '2026-11-03T10:00:00.000Z' });
    const mid = { importState: 'running' as const, coveredFrom: seen[1].coveredFrom };
    expect(isDateComplete('2026-11-04', mid)).toBe(true);
    expect(isDateComplete('2026-11-03', mid)).toBe(false);

    const s = await repo.getCoverageState();
    expect(s).toMatchObject({ importState: 'done', importCount: 3 });
    expect(onDone).toHaveBeenCalledTimes(1);
    const w = await repo.getWorkout('w1');
    expect(w?.sets[0]).toMatchObject({ id: 'w1-s0', weight: null, sets: null, reps: 5, body_part: null });
    expect(await repo.unsyncedCount()).toBe(0); // imported rows are clean
  });

  it('skips ids tombstoned locally', async () => {
    await repo.deleteWorkout('w2');
    const before = await repo.unsyncedCount();
    await startAndSettle();
    expect(await repo.getWorkout('w2')).toBeNull();
    expect(await repo.getWorkout('w3')).not.toBeNull();
    expect(await repo.unsyncedCount()).toBe(before);
  });

  it('falls back to pending on failure and resumes from the saved cursor', async () => {
    exportPage.mockImplementationOnce(async (c) => PAGES[c]).mockRejectedValueOnce(new Error('Network Error'));
    await startAndSettle();
    expect(await repo.getCoverageState()).toMatchObject({ importState: 'pending' });
    expect(await repo.getMeta('import_cursor')).toBe('c1');
    expect(onDone).not.toHaveBeenCalled();

    await importer.run('retry');
    expect(exportPage.mock.calls.map((c) => c[0])).toEqual(['', 'c1', 'c1']);
    expect(await repo.getCoverageState()).toMatchObject({ importState: 'done' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('resumes a run left as running (app killed mid-import)', async () => {
    await repo.importPage(PAGES[''].items.map((i) => ({ ...i })), 'c1', '2026-11-03T10:00:00Z');
    expect(await repo.getMeta('import_state')).toBe('running');
    await startAndSettle();
    expect(exportPage.mock.calls.map((c) => c[0])).toEqual(['c1']);
    expect(await repo.getCoverageState()).toMatchObject({ importState: 'done' });
  });

  it('waits for online and auth, and does nothing once done', async () => {
    online = false;
    await startAndSettle();
    authActive = false;
    online = true;
    await importer.run('online');
    expect(exportPage).not.toHaveBeenCalled();

    authActive = true;
    await importer.run('reauth');
    expect(exportPage).toHaveBeenCalledTimes(2);
    await importer.run('again');
    expect(exportPage).toHaveBeenCalledTimes(2);
  });

  it('treats an empty export as done', async () => {
    exportPage.mockResolvedValueOnce({ items: [], next_cursor: '' });
    await startAndSettle();
    expect(await repo.getCoverageState()).toMatchObject({ importState: 'done', coveredFrom: null });
  });

  it('settles as done when the server has no export endpoint (404), so coverage stops blocking', async () => {
    exportPage.mockRejectedValueOnce(Object.assign(new Error('status 404'), { response: { status: 404, headers: {} } }));
    await startAndSettle();
    const s = await repo.getCoverageState();
    expect(s).toMatchObject({ importState: 'done' });
    expect(isDateComplete('2020-01-01', s)).toBe(true);
    expect(exportPage).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  const notFound = () => Object.assign(new Error('status 404'), { response: { status: 404, headers: {} } });
  const hourAgo = () => new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  it('records import_skipped_at on 404', async () => {
    exportPage.mockRejectedValueOnce(notFound());
    await startAndSettle();
    expect(await repo.getMeta('import_skipped_at')).toBeTruthy();
  });

  it('retries a skipped import later: imports rows, clears the flag, stays done throughout', async () => {
    await repo.setMeta('import_state', 'done');
    await repo.setMeta('import_skipped_at', hourAgo());
    const states: string[] = [];
    exportPage.mockImplementation(async (cursor: string) => {
      states.push((await repo.getCoverageState()).importState);
      return PAGES[cursor];
    });
    await startAndSettle();
    expect(states.every((x) => x === 'done')).toBe(true);
    expect(exportPage).toHaveBeenCalledTimes(2);
    expect(exportPage.mock.calls[0][0]).toBe('');
    expect(await repo.getMeta('import_skipped_at')).toBeFalsy();
    expect(await repo.getCoverageState()).toMatchObject({ importState: 'done', importCount: 3 });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not retry within an hour of the skip', async () => {
    await repo.setMeta('import_state', 'done');
    await repo.setMeta('import_skipped_at', new Date().toISOString());
    await startAndSettle();
    expect(exportPage).not.toHaveBeenCalled();
  });

  it('stays done and refreshes the flag when the retry hits 404 again', async () => {
    const old = hourAgo();
    await repo.setMeta('import_state', 'done');
    await repo.setMeta('import_skipped_at', old);
    exportPage.mockRejectedValueOnce(notFound());
    await startAndSettle();
    const now = await repo.getMeta('import_skipped_at');
    expect(now && now > old).toBe(true);
    expect((await repo.getCoverageState()).importState).toBe('done');
    expect(onDone).not.toHaveBeenCalled();
  });
});
