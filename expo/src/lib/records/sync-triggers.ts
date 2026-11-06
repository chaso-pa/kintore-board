/**
 * Builds the records sync (engine + importer), hands it to records-store, and kicks it at
 * the moments plan §3.4 lists: offline → online, app back to the foreground, a DB opened or
 * auth regained, the import finishing (importer onDone), and every 60s in the foreground
 * while something is unsynced. Local writes kick through notifyLocalWrite.
 *
 * On web there is no local DB (U3): nothing is created or subscribed.
 */
import type { QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import { useConnectivityStore } from '@/lib/connectivity';
import { queryClient } from '@/lib/query-client';
import { refreshImportState } from '@/lib/records/import-state';
import { createImporter, type ImportChange } from '@/lib/records/importer';
import { invalidateAllRecords } from '@/lib/records/invalidate';
import { useRecordsStore } from '@/lib/records/records-store';
import { isRecordsSupported } from '@/lib/records/sqlite-driver';
import type { RecordsRepository } from '@/lib/records/repository';
import { createSyncEngine } from '@/lib/records/sync-engine';

const FOREGROUND_INTERVAL_MS = 60_000;

/**
 * Invalidates every records query after the sync side changed rows in `repo` (import, 410).
 * Records queries never go stale on their own, so without this the UI keeps old data.
 * Ignored once another DB has been opened.
 */
export function invalidateRecordsFor(repo: RecordsRepository, qc: QueryClient = queryClient): void {
  const { repo: current, ownerUserId } = useRecordsStore.getState();
  if (current !== repo || !ownerUserId) return;
  invalidateAllRecords(qc, ownerUserId);
}

/** Importer onProgress: mirrors the import state and, once rows landed or it finished, the records. */
export function onImportProgress(repo: RecordsRepository, change?: ImportChange, qc: QueryClient = queryClient): void {
  refreshImportState(repo).catch(() => undefined);
  if (change && (change.inserted > 0 || change.done)) invalidateRecordsFor(repo, qc);
}

/** Returns a teardown that unsubscribes and stops the engine. */
export function startRecordsSync(): () => void {
  if (!isRecordsSupported) return () => undefined;

  const getRepo = () => useRecordsStore.getState().repo;
  const engine = createSyncEngine({ getRepo, onLocalChange: (repo) => invalidateRecordsFor(repo) });
  const importer = createImporter({
    getRepo,
    isAuthActive: () => useRecordsStore.getState().authActive,
    onDone: () => void engine.kick('import-done'),
    onProgress: (repo, change) => onImportProgress(repo, change),
  });

  const kickAll = (reason: string) => {
    void importer.run(reason);
    void engine.kick(reason);
  };

  useRecordsStore.getState().setEngine({
    start() {
      engine.start();
      importer.start();
    },
    async stop() {
      await Promise.all([engine.stop(), importer.stop()]);
    },
  });

  const unsubConnectivity = useConnectivityStore.subscribe((s, prev) => {
    if (s.isOnline && !prev.isOnline) kickAll('online');
  });

  // The store already starts the engine on open / re-auth; this covers a repo or auth
  // change while it was already started.
  const unsubRecords = useRecordsStore.subscribe((s, prev) => {
    if (s.repo && s.repo !== prev.repo) kickAll('db-open');
    else if (s.authActive && !prev.authActive) kickAll('reauth');
  });

  let interval: ReturnType<typeof setInterval> | null = null;
  const tick = async () => {
    const repo = getRepo();
    if (!repo || !engine.started) return;
    try {
      if ((await repo.unsyncedCount()) > 0) void engine.kick('timer');
    } catch {
      // DB closing under us; the next tick or trigger will do.
    }
  };
  const setForeground = (active: boolean) => {
    if (active && !interval) interval = setInterval(() => void tick(), FOREGROUND_INTERVAL_MS);
    if (!active && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
  setForeground(AppState.currentState === 'active' || AppState.currentState == null);
  const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    setForeground(state === 'active');
    if (state === 'active') kickAll('foreground');
  });

  return () => {
    unsubConnectivity();
    unsubRecords();
    appStateSub.remove();
    setForeground(false);
    useRecordsStore.getState().setEngine(null);
    void engine.stop();
    void importer.stop();
  };
}
