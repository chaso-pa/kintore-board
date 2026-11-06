import { createSqlJsFactory } from '@/lib/records/__testutils__/sqljs-driver';
import {
  RECORDS_OWNER_KEY,
  recordsDbName,
  setRecordsDriverFactory,
  useRecordsStore,
} from '@/lib/records/records-store';

const mockSecure = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecure.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockSecure.delete(k);
  }),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(),
}));

const T = '2026-11-01T06:30:00.000Z';
let fs: ReturnType<typeof createSqlJsFactory>;
const initial = useRecordsStore.getState();

beforeEach(() => {
  mockSecure.clear();
  fs = createSqlJsFactory();
  setRecordsDriverFactory(fs.factory);
  useRecordsStore.setState(initial, true);
});

afterEach(async () => {
  await useRecordsStore.getState().repo?.close();
  setRecordsDriverFactory(null);
});

function repo() {
  const r = useRecordsStore.getState().repo;
  if (!r) throw new Error('no repo');
  return r;
}

describe('records-store', () => {
  it('opens a different file per user and keeps the old one', async () => {
    const store = useRecordsStore.getState();
    await store.handleAuthUserId('alice');
    expect(useRecordsStore.getState()).toMatchObject({ ownerUserId: 'alice', status: 'open' });
    expect(await repo().getMeta('owner_user_id')).toBe('alice');
    expect(await repo().getMeta('import_state')).toBe('pending');
    await repo().saveWorkout('a1', { trained_on: T, memo: null, sets: [] });

    await store.handleAuthUserId('bob');
    expect(fs.opened).toEqual([recordsDbName('alice'), recordsDbName('bob')]);
    expect(fs.files.has(recordsDbName('alice'))).toBe(true);
    expect(await repo().getWorkout('a1')).toBeNull();
    expect(mockSecure.get(RECORDS_OWNER_KEY)).toBe('bob');

    await store.handleAuthUserId('alice');
    expect(await repo().getWorkout('a1')).not.toBeNull();
  });

  it('keeps the DB and owner open when auth drops to null', async () => {
    const engine = { start: jest.fn(), stop: jest.fn(async () => undefined) };
    const store = useRecordsStore.getState();
    store.setEngine(engine);
    await store.handleAuthUserId('alice');
    expect(engine.start).toHaveBeenCalledTimes(1);
    const before = useRecordsStore.getState().repo;

    await store.handleAuthUserId(null);
    expect(useRecordsStore.getState()).toMatchObject({ ownerUserId: 'alice', status: 'open' });
    expect(useRecordsStore.getState().repo).toBe(before);
    expect(engine.stop).toHaveBeenCalled();
    await repo().saveWorkout('a1', { trained_on: T, memo: null, sets: [] });

    await store.handleAuthUserId('alice');
    expect(useRecordsStore.getState().repo).toBe(before);
    expect(engine.start).toHaveBeenCalledTimes(2);
  });

  it('restores the last owner on boot without a token', async () => {
    await useRecordsStore.getState().openForUser('alice');
    await repo().close();
    useRecordsStore.setState(initial, true);

    await useRecordsStore.getState().restoreOwnerOnBoot();
    expect(useRecordsStore.getState()).toMatchObject({ ownerUserId: 'alice', status: 'open' });
  });

  it('rejects a file owned by someone else', async () => {
    await useRecordsStore.getState().openForUser('alice');
    await repo().setMeta('owner_user_id', 'mallory');
    await repo().close();
    useRecordsStore.setState(initial, true);

    await expect(useRecordsStore.getState().openForUser('alice')).rejects.toThrow(/another user/);
    expect(useRecordsStore.getState()).toMatchObject({ repo: null, status: 'error' });
  });

  it('destroyForUser closes and deletes the file and forgets the owner', async () => {
    const store = useRecordsStore.getState();
    await store.handleAuthUserId('alice');
    await repo().saveWorkout('a1', { trained_on: T, memo: null, sets: [] });

    await store.destroyForUser('alice');
    expect(useRecordsStore.getState()).toMatchObject({ ownerUserId: null, repo: null, status: 'closed' });
    expect(fs.files.has(recordsDbName('alice'))).toBe(false);
    expect(fs.open.size).toBe(0);
    expect(mockSecure.has(RECORDS_OWNER_KEY)).toBe(false);

    await store.openForUser('alice');
    expect(await repo().getWorkout('a1')).toBeNull();
  });

  it('pauseSync blocks engine starts until resumeSync', async () => {
    const engine = { start: jest.fn(), stop: jest.fn(async () => undefined) };
    const store = useRecordsStore.getState();
    await store.pauseSync();
    store.setEngine(engine);
    await store.handleAuthUserId('alice');
    expect(engine.start).not.toHaveBeenCalled();
    store.resumeSync();
    expect(engine.start).toHaveBeenCalledTimes(1);
  });

  it('only holds the owner on an unsupported platform', async () => {
    const open = jest.fn();
    const remove = jest.fn();
    setRecordsDriverFactory({ isSupported: false, open, remove });
    const store = useRecordsStore.getState();

    await store.handleAuthUserId('alice');
    expect(useRecordsStore.getState()).toMatchObject({ ownerUserId: 'alice', repo: null, status: 'unsupported' });
    await store.restoreOwnerOnBoot();
    await store.destroyForUser('alice');
    expect(useRecordsStore.getState().ownerUserId).toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(mockSecure.size).toBe(0);
  });
});
