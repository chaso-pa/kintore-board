/**
 * The one-time import of the server's existing workouts (plan §3.5).
 *
 * Runs while import_state is pending|running, online and signed in. Pages come newest first
 * and each lands in one transaction together with its cursor and covered_from, so a kill at
 * any point resumes from the last applied page. A failure sets the state back to pending and
 * retries with backoff from the saved cursor.
 */
import { useConnectivityStore } from '@/lib/connectivity';
import { classifyError, errorMessage, retryDelay } from '@/lib/records/backoff';
import { refreshImportState } from '@/lib/records/import-state';
import type { ImportWorkoutItem, RecordsRepository } from '@/lib/records/repository';
import * as serverApi from '@/lib/records/server-api';
import type { ExportWorkoutItem } from '@/lib/records/server-api';

export const IMPORT_PAGE_SIZE = 200;
/** How long after a 404 (export unavailable) before the next start retries the import. */
export const SKIPPED_RETRY_MS = 60 * 60 * 1000;

export interface ImporterOptions {
  getRepo: () => RecordsRepository | null;
  api?: Pick<typeof serverApi, 'exportPage'>;
  isOnline?: () => boolean;
  /** Whether auth has a user (records-store authActive). */
  isAuthActive: () => boolean;
  /** Called once the import reaches done, e.g. to kick the sync engine. */
  onDone?: () => void;
  /**
   * Called after every state change or page, e.g. to refresh the UI. `change` is set after a
   * page lands (and when the import is settled as done): how many workouts it added locally
   * and whether the import is now done. Defaults to refreshImportState.
   */
  onProgress?: (repo: RecordsRepository, change?: ImportChange) => void;
  random?: () => number;
}

export interface ImportChange {
  inserted: number;
  done: boolean;
}

export interface Importer {
  start(): void;
  stop(): Promise<void>;
  /** Imports if needed. Single-flight: resolves with the run in progress. */
  run(reason: string): Promise<void>;
  readonly started: boolean;
}

export function toImportItem(item: ExportWorkoutItem): ImportWorkoutItem {
  return {
    id: item.id,
    trained_on: item.trained_on,
    memo: item.memo ?? null,
    created_at: item.created_at,
    sets: item.sets.map((s) => ({
      id: s.id,
      exercise_name: s.exercise_name,
      weight: s.weight ?? null,
      reps: s.reps ?? null,
      sets: s.sets ?? null,
      memo: s.memo ?? null,
      spotted: !!s.spotted,
      body_part: s.body_part ?? null,
      sort_order: s.sort_order,
    })),
  };
}

export function createImporter(options: ImporterOptions): Importer {
  const api = options.api ?? serverApi;
  const isOnline = options.isOnline ?? (() => useConnectivityStore.getState().isOnline);
  const progress =
    options.onProgress ??
    ((repo: RecordsRepository) => {
      refreshImportState(repo).catch(() => undefined);
    });

  let started = false;
  let current: Promise<void> | null = null;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  /** Fetches and applies pages from cursor. Returns false when stopped early (resumable). */
  async function pageLoop(repo: RecordsRepository, startCursor: string, keepDone = false): Promise<boolean> {
    let cursor = startCursor;
    for (;;) {
      const page = await api.exportPage(cursor, IMPORT_PAGE_SIZE);
      const items = page.items.map(toImportItem);
      // Newest first, so the last item is the oldest covered so far.
      const coveredFrom = items.length > 0 ? items[items.length - 1].trained_on : null;
      const { inserted } = await repo.importPage(items, page.next_cursor || null, coveredFrom, keepDone);
      progress(repo, { inserted, done: !page.next_cursor });
      if (!page.next_cursor) return true;
      cursor = page.next_cursor;
      // Left with its cursor: the next start resumes from here.
      if (!started) return false;
    }
  }

  /**
   * Retries an import that was skipped by a 404, at most once an hour. import_state stays
   * 'done' for the whole retry (never 'running'), so the openDate guard cannot start
   * blocking creation of past-dated workouts; importPage skips ids already present or
   * tombstoned, so local rows are untouched. The skip flag is cleared only once every page
   * has landed; any other failure keeps it, and the next start tries again from the top.
   */
  async function retrySkipped(repo: RecordsRepository): Promise<void> {
    const skippedAt = await repo.getMeta('import_skipped_at');
    if (!skippedAt) return;
    const since = Date.now() - new Date(skippedAt).getTime();
    if (since >= 0 && since < SKIPPED_RETRY_MS) return;
    try {
      if (!(await pageLoop(repo, '', true))) return;
    } catch (e) {
      if (classifyError(e).kind === 'not_found') {
        await repo.setMeta('import_skipped_at', new Date().toISOString());
      }
      return;
    }
    await repo.setMeta('import_skipped_at', '');
    options.onDone?.();
  }

  async function importAll(repo: RecordsRepository): Promise<void> {
    const state = (await repo.getCoverageState()).importState;
    if (state === 'done') return retrySkipped(repo);
    await repo.setMeta('import_state', 'running');
    progress(repo);
    let cursor = (await repo.getMeta('import_cursor')) ?? '';
    try {
      if (!(await pageLoop(repo, cursor))) return;
    } catch (e) {
      const c = classifyError(e);
      if (c.kind === 'not_found') {
        // A server without /workouts/export (deployed before the app): there is nothing to
        // import from it, so settle as done rather than block coverage forever. The skip is
        // remembered so a later start can retry once the server has the endpoint.
        await repo.setMeta('import_state', 'done');
        await repo.setMeta('import_skipped_at', new Date().toISOString());
        progress(repo, { inserted: 0, done: true });
        if (__DEV__ && process.env.NODE_ENV !== 'test') {
          console.log('[import] export unavailable (404); marked done');
        }
        attempts = 0;
        options.onDone?.();
        return;
      }
      await repo.setMeta('import_state', 'pending').catch(() => undefined);
      progress(repo);
      if (c.kind === 'unauthorized') return; // Restarted after re-auth.
      const delay = retryDelay(c, attempts++, options.random);
      if (started) {
        clearRetry();
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void importer.run('retry');
        }, delay);
      }
      if (__DEV__ && process.env.NODE_ENV !== 'test') {
        console.log(`[import] failed: ${errorMessage(e)}; retry in ${delay}ms`);
      }
      return;
    }
    attempts = 0;
    options.onDone?.();
  }

  const importer: Importer = {
    start() {
      if (started) return;
      started = true;
      void importer.run('start');
    },

    async stop() {
      started = false;
      clearRetry();
      await current?.catch(() => undefined);
    },

    run(_reason) {
      if (current) return current;
      if (!started || !isOnline() || !options.isAuthActive()) return Promise.resolve();
      const repo = options.getRepo();
      if (!repo) return Promise.resolve();
      clearRetry();
      current = importAll(repo)
        .catch(() => undefined)
        .finally(() => {
          current = null;
        });
      return current;
    },

    get started() {
      return started;
    },
  };
  return importer;
}
