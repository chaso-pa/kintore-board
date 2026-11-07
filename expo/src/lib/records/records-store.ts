/**
 * Which user's records DB is open (plan §3.6).
 *
 * One file per user, `records_<userId>.db`. The DB follows the auth user id but outlives it:
 * a 401 clears the auth user id, and records must keep working, so null leaves the DB open.
 * Only account deletion removes a file.
 *
 * On web (no local records, U3) everything is a no-op apart from remembering the owner.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { runMigrations } from '@/lib/records/migrations';
import { createRepository, type RecordsRepository } from '@/lib/records/repository';
import type { SqlDriver } from '@/lib/records/sql-driver';
import { deleteDatabase, isRecordsSupported, openDriver } from '@/lib/records/sqlite-driver';

export const RECORDS_OWNER_KEY = 'records_owner_user_id';

export interface RecordsDriverFactory {
  isSupported: boolean;
  open(name: string): Promise<SqlDriver>;
  remove(name: string): Promise<void>;
}

/** Wired in Phase 5. `stop` resolves once any running cycle has finished. */
export interface RecordsSyncEngine {
  start(): void;
  stop(): Promise<void>;
}

export type RecordsStatus = 'closed' | 'opening' | 'open' | 'error' | 'unsupported';

const defaultFactory: RecordsDriverFactory = {
  isSupported: isRecordsSupported,
  open: openDriver,
  remove: deleteDatabase,
};

let factory = defaultFactory;

/** Tests inject a sql.js-backed factory; pass null to restore the platform one. */
export function setRecordsDriverFactory(f: RecordsDriverFactory | null): void {
  factory = f ?? defaultFactory;
}

export function recordsDbName(userId: string): string {
  return `records_${userId.replace(/[^A-Za-z0-9_-]/g, '_')}.db`;
}

interface RecordsState {
  ownerUserId: string | null;
  repo: RecordsRepository | null;
  status: RecordsStatus;
  engine: RecordsSyncEngine | null;
  /** Set by pauseSync (account deletion in progress); blocks engine starts. */
  syncPaused: boolean;
  /** Whether auth currently has a user, i.e. the engine may run. */
  authActive: boolean;
  openForUser: (userId: string) => Promise<void>;
  restoreOwnerOnBoot: () => Promise<void>;
  handleAuthUserId: (userId: string | null) => Promise<void>;
  destroyForUser: (userId: string) => Promise<void>;
  setEngine: (engine: RecordsSyncEngine | null) => void;
  pauseSync: () => Promise<void>;
  resumeSync: () => void;
}

// Opens, switches and destroys run one at a time so a quick user switch cannot leave two
// DBs half-open.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export const useRecordsStore = create<RecordsState>((set, get) => {
  const startEngineIfAllowed = () => {
    const { engine, repo, syncPaused, authActive } = get();
    if (engine && repo && !syncPaused && authActive) engine.start();
  };

  const closeCurrent = async () => {
    const { engine, repo } = get();
    await engine?.stop();
    if (repo) await repo.close();
    set({ repo: null, status: 'closed' });
  };

  const open = async (userId: string) => {
    if (!factory.isSupported) {
      set({ ownerUserId: userId, status: 'unsupported' });
      return;
    }
    const current = get();
    if (current.ownerUserId === userId && current.repo) return;
    await closeCurrent();
    set({ ownerUserId: userId, status: 'opening' });
    let driver: SqlDriver | null = null;
    try {
      driver = await factory.open(recordsDbName(userId));
      await runMigrations(driver);
      const repo = createRepository(driver);
      const owner = await repo.getMeta('owner_user_id');
      if (owner === null) await repo.setMeta('owner_user_id', userId);
      else if (owner !== userId) throw new Error('Records DB belongs to another user');
      if ((await repo.getMeta('import_state')) === null) await repo.setMeta('import_state', 'pending');
      await SecureStore.setItemAsync(RECORDS_OWNER_KEY, userId);
      set({ repo, status: 'open' });
    } catch (e) {
      await driver?.close().catch(() => undefined);
      set({ repo: null, status: 'error' });
      throw e;
    }
    startEngineIfAllowed();
  };

  return {
    ownerUserId: null,
    repo: null,
    status: 'closed',
    engine: null,
    syncPaused: false,
    authActive: false,

    openForUser: (userId) => serial(() => open(userId)),

    /** Opens the last owner's DB even when there is no token yet (offline launch, 401). */
    restoreOwnerOnBoot: () =>
      serial(async () => {
        if (!factory.isSupported || get().repo) return;
        const owner = await SecureStore.getItemAsync(RECORDS_OWNER_KEY);
        if (owner) await open(owner);
      }),

    handleAuthUserId: (userId) =>
      serial(async () => {
        if (userId === null) {
          set({ authActive: false });
          await get().engine?.stop();
          return;
        }
        set({ authActive: true });
        if (get().ownerUserId !== userId || (factory.isSupported && !get().repo)) await open(userId);
        else startEngineIfAllowed();
      }),

    destroyForUser: (userId) =>
      serial(async () => {
        if (!factory.isSupported) {
          if (get().ownerUserId === userId) set({ ownerUserId: null, status: 'unsupported' });
          return;
        }
        if (get().ownerUserId === userId) {
          await closeCurrent();
          set({ ownerUserId: null });
        }
        await factory.remove(recordsDbName(userId));
        if ((await SecureStore.getItemAsync(RECORDS_OWNER_KEY)) === userId) {
          await SecureStore.deleteItemAsync(RECORDS_OWNER_KEY);
        }
      }),

    setEngine: (engine) => {
      set({ engine });
      startEngineIfAllowed();
    },

    pauseSync: async () => {
      set({ syncPaused: true });
      await get().engine?.stop();
    },

    resumeSync: () => {
      set({ syncPaused: false });
      startEngineIfAllowed();
    },
  };
});
