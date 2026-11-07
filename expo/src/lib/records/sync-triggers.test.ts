import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { createSqlJsDriver, type SqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import { createImporter } from '@/lib/records/importer';
import { runMigrations } from '@/lib/records/migrations';
import { getWorkoutStats } from '@/lib/records/queries';
import { recordsQueryDefaults } from '@/lib/records/query-options';
import { useRecordsStore } from '@/lib/records/records-store';
import { createRepository, type RecordsRepository } from '@/lib/records/repository';
import type { ExportPage } from '@/lib/records/server-api';
import { createSyncEngine } from '@/lib/records/sync-engine';
import { invalidateRecordsFor, onImportProgress } from '@/lib/records/sync-triggers';

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

const O = 'u1';
const T = '2026-11-01T06:30:00.000Z';

function exportItem(id: string, trainedOn: string) {
  return {
    id,
    trained_on: trainedOn,
    memo: null,
    created_at: trainedOn,
    sets: [
      { id: `${id}-s0`, exercise_name: 'bench', weight: 100, reps: 5, sets: 1, memo: null, spotted: false, body_part: null, sort_order: 0 },
    ],
  };
}

let driver: SqlJsDriver;
let repo: RecordsRepository;
let qc: QueryClient;
let unsubscribe: () => void;
const initial = useRecordsStore.getState();

/** An active stats query (as a mounted screen holds it), cached forever like every records query. */
function watchStats() {
  const observer = new QueryObserver(qc, {
    queryKey: queryKeys.records.stats(O),
    queryFn: () => getWorkoutStats(repo),
    ...recordsQueryDefaults,
  });
  unsubscribe = observer.subscribe(() => undefined);
  return observer;
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

beforeEach(async () => {
  driver = await createSqlJsDriver();
  await runMigrations(driver);
  repo = createRepository(driver);
  qc = new QueryClient();
  unsubscribe = () => undefined;
  useRecordsStore.setState({ repo, ownerUserId: O });
});

afterEach(async () => {
  unsubscribe();
  qc.clear();
  useRecordsStore.setState(initial, true);
  await driver.close();
});

describe('records sync triggers', () => {
  it('refetches cached records queries after an import page lands', async () => {
    await repo.setMeta('import_state', 'pending');
    const observer = watchStats();
    await waitFor(() => observer.getCurrentResult().data?.total_workouts === 0);

    const pages: Record<string, ExportPage> = {
      '': { items: [exportItem('w2', '2026-11-03T10:00:00Z')], next_cursor: 'c1' },
      c1: { items: [exportItem('w1', '2026-10-01T10:00:00Z')], next_cursor: '' },
    };
    const importer = createImporter({
      getRepo: () => repo,
      api: { exportPage: async (cursor: string) => pages[cursor] },
      isOnline: () => true,
      isAuthActive: () => true,
      onProgress: (r, change) => onImportProgress(r, change, qc),
    });
    importer.start();
    await importer.run('test');
    await importer.stop();

    await waitFor(() => observer.getCurrentResult().data?.total_workouts === 2);
  });

  it('refetches cached records queries after a 410 settles a workout as deleted', async () => {
    await repo.saveWorkout('w1', {
      trained_on: T,
      memo: null,
      sets: [{ exercise_name: 'bench', weight: 100, reps: 5, sets: 1, memo: null, spotted: false, body_part: null }],
    });
    const observer = watchStats();
    await waitFor(() => observer.getCurrentResult().data?.total_workouts === 1);

    const gone = Object.assign(new Error('status 410'), { response: { status: 410, headers: {} } });
    const engine = createSyncEngine({
      getRepo: () => repo,
      api: {
        upsertWorkout: jest.fn(async () => {
          throw gone;
        }),
        deleteWorkout: jest.fn(async () => undefined),
        classifyExercises: jest.fn(async () => 0),
      },
      isOnline: () => true,
      onLocalChange: (r) => invalidateRecordsFor(r, qc),
    });
    engine.start();
    await engine.kick('test');
    await engine.stop();

    await waitFor(() => observer.getCurrentResult().data?.total_workouts === 0);
  });

  it('leaves the cache alone for a repo that is no longer open', () => {
    qc.setQueryData(queryKeys.records.stats(O), { total_workouts: 5, total_volume_kg: 0 });
    useRecordsStore.setState({ repo: null });
    invalidateRecordsFor(repo, qc);
    expect(qc.getQueryState(queryKeys.records.stats(O))?.isInvalidated).toBe(false);
  });
});
