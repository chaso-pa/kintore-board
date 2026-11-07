/**
 * Pushes local changes to the server (plan §3.4).
 *
 * Single-flight: a kick while a cycle runs only asks for one more cycle afterwards. Each
 * cycle sends every due dirty workout (tombstone → DELETE, otherwise the full payload by
 * POST), settling each with a CAS on the version it sent so an edit made mid-send stays
 * dirty, and only then the pending classifications. The UI never awaits any of this.
 */
import { useConnectivityStore } from '@/lib/connectivity';
import {
  classifyError,
  errorMessage,
  PERMANENT_CAP_MS,
  retryDelay,
  type SyncErrorClass,
} from '@/lib/records/backoff';
import type { DirtyWorkout, RecordsRepository } from '@/lib/records/repository';
import type { RecordsSyncEngine } from '@/lib/records/records-store';
import * as serverApi from '@/lib/records/server-api';
import type { UpsertWorkoutBody } from '@/lib/records/server-api';

export type SyncServerApi = Pick<typeof serverApi, 'upsertWorkout' | 'deleteWorkout' | 'classifyExercises'>;

export interface SyncLogEntry {
  at: string;
  event: string;
  detail?: string;
}

export interface SyncEngineOptions {
  getRepo: () => RecordsRepository | null;
  api?: SyncServerApi;
  isOnline?: () => boolean;
  now?: () => Date;
  random?: () => number;
  /** Called after the engine changed local rows on the server's word (410), so the UI can refresh. */
  onLocalChange?: (repo: RecordsRepository) => void;
}

export interface SyncEngine extends RecordsSyncEngine {
  /** Runs a cycle now (or one more after the current). Resolves when the work it asked for is done. */
  kick(reason: string): Promise<void>;
  /** Kicks 2s after the last local write. */
  notifyLocalWrite(): void;
  readonly started: boolean;
  /** Set after a 403: no sends until this time. */
  readonly lowFrequencyUntil: number | null;
  getLog(): SyncLogEntry[];
}

const BATCH_SIZE = 20;
const CLASSIFY_BATCH = 100;
const LOCAL_WRITE_DEBOUNCE_MS = 2_000;
const LOG_SIZE = 100;

export function toUpsertBody(w: DirtyWorkout): UpsertWorkoutBody {
  return {
    id: w.id,
    trained_on: w.trained_on,
    memo: w.memo ?? '',
    sets: w.sets.map((s) => ({
      exercise_name: s.exercise_name,
      weight: s.weight ?? 0,
      reps: s.reps ?? 0,
      sets: s.sets ?? 0,
      memo: s.memo ?? '',
      spotted: s.spotted,
      ...(s.body_part ? { body_part: s.body_part } : {}),
    })),
  };
}

type SendOutcome = 'ok' | 'retry' | 'halt';

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const api = options.api ?? serverApi;
  const isOnline = options.isOnline ?? (() => useConnectivityStore.getState().isOnline);
  const now = options.now ?? (() => new Date());
  const random = options.random;

  let started = false;
  let current: Promise<void> | null = null;
  let again = false;
  let lowFrequencyUntil: number | null = null;
  let classifyAttempts = 0;
  let classifyNotBefore = 0;
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeAt = Infinity;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const log: SyncLogEntry[] = [];

  function record(event: string, detail?: string) {
    log.push({ at: now().toISOString(), event, detail });
    if (log.length > LOG_SIZE) log.shift();
    if (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test') {
      console.log(`[sync] ${event}${detail ? ` ${detail}` : ''}`);
    }
  }

  function clearTimers() {
    if (wakeTimer) clearTimeout(wakeTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    wakeTimer = null;
    debounceTimer = null;
    wakeAt = Infinity;
  }

  /** Wakes the engine for the earliest retry this engine has scheduled. */
  function wakeIn(ms: number) {
    const at = now().getTime() + ms;
    if (at >= wakeAt) return;
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeAt = at;
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      wakeAt = Infinity;
      void engine.kick('retry');
    }, ms);
  }

  /** 401 and 403 halt the cycle; the caller decides what that means for the engine. */
  function onHalt(c: SyncErrorClass): boolean {
    if (c.kind === 'unauthorized') {
      // The api interceptor clears auth; the records store restarts us after re-auth.
      started = false;
      clearTimers();
      record('stopped', '401');
      return true;
    }
    if (c.kind === 'forbidden') {
      // Blocked, not signed out: keep auth, keep the DB, just ask rarely (R6).
      lowFrequencyUntil = now().getTime() + PERMANENT_CAP_MS;
      record('low-frequency', '403');
      wakeIn(PERMANENT_CAP_MS);
      return true;
    }
    return false;
  }

  async function sendWorkout(repo: RecordsRepository, w: DirtyWorkout): Promise<SendOutcome> {
    try {
      if (w.deleted) {
        try {
          await api.deleteWorkout(w.id);
        } catch (e) {
          // Servers before the tombstone change answer 404 for an unknown id.
          if (classifyError(e).kind !== 'not_found') throw e;
        }
        await repo.markSynced(w.id, w.local_version);
        record('delete', w.id);
      } else {
        await api.upsertWorkout(toUpsertBody(w));
        const settled = await repo.markSynced(w.id, w.local_version);
        record('upsert', settled ? w.id : `${w.id} (edited during send, stays dirty)`);
      }
      lowFrequencyUntil = null;
      return 'ok';
    } catch (e) {
      const c = classifyError(e, now().getTime());
      if (c.kind === 'gone') {
        await repo.markDeletedFromServer(w.id);
        record('gone', w.id);
        options.onLocalChange?.(repo);
        return 'ok';
      }
      if (onHalt(c)) return 'halt';
      const delay = retryDelay(c, w.sync_attempts, random);
      await repo.recordAttemptFailure(w.id, new Date(now().getTime() + delay), errorMessage(e));
      record('error', `${w.id} ${errorMessage(e)} retry in ${delay}ms`);
      wakeIn(delay);
      // No response at all (network down, timeout): the rest of the batch would only wait
      // out the same 20s timeout one by one. End the cycle; the wake above resumes it.
      if (c.kind === 'transient' && c.status === null) return 'halt';
      return 'retry';
    }
  }

  async function sendClassifications(repo: RecordsRepository): Promise<SendOutcome> {
    if (now().getTime() < classifyNotBefore) return 'retry';
    const pending = await repo.listPendingClassifications(CLASSIFY_BATCH, now());
    if (pending.length === 0) return 'ok';
    try {
      await api.classifyExercises(pending.map((p) => ({ exercise_name: p.exercise_name, body_part: p.body_part })));
    } catch (e) {
      const c = classifyError(e, now().getTime());
      if (onHalt(c)) return 'halt';
      const delay = retryDelay(c, classifyAttempts++, random);
      classifyNotBefore = now().getTime() + delay;
      record('error', `classify ${errorMessage(e)} retry in ${delay}ms`);
      wakeIn(delay);
      return 'retry';
    }
    classifyAttempts = 0;
    classifyNotBefore = 0;
    lowFrequencyUntil = null;
    for (const p of pending) await repo.deletePendingClassificationCAS(p.exercise_name, p.created_at);
    record('classify', String(pending.length));
    return 'ok';
  }

  async function cycle(reason: string): Promise<void> {
    const repo = options.getRepo();
    if (!repo || !started) return;
    if (lowFrequencyUntil !== null && now().getTime() < lowFrequencyUntil) return;
    if (!isOnline()) {
      record('skip', 'offline');
      return;
    }
    record('cycle', reason);

    // An id sent in this cycle is not sent again in it, even if still dirty (edited mid-send):
    // the local write's own kick covers that.
    const attempted = new Set<string>();
    for (;;) {
      const due = (await repo.listDirty(BATCH_SIZE + attempted.size, now())).filter((w) => !attempted.has(w.id));
      if (due.length === 0) break;
      for (const w of due.slice(0, BATCH_SIZE)) {
        attempted.add(w.id);
        if ((await sendWorkout(repo, w)) === 'halt') return;
        if (!started) return;
      }
    }
    // After every upsert, so new workouts exist on the server when classify runs.
    await sendClassifications(repo);
  }

  async function loop(reason: string) {
    try {
      do {
        again = false;
        try {
          await cycle(reason);
        } catch (e) {
          record('cycle-failed', errorMessage(e));
        }
        reason = 'again';
      } while (again && started);
    } finally {
      current = null;
    }
  }

  const engine: SyncEngine = {
    start() {
      if (started) return;
      started = true;
      activeEngine = engine;
      record('started');
      void engine.kick('start');
    },

    async stop() {
      started = false;
      clearTimers();
      if (activeEngine === engine) activeEngine = null;
      await current?.catch(() => undefined);
      record('stopped');
    },

    kick(reason) {
      if (!started) return current ?? Promise.resolve();
      if (current) {
        again = true;
        return current;
      }
      current = loop(reason);
      return current;
    },

    notifyLocalWrite() {
      if (!started) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void engine.kick('local-write');
      }, LOCAL_WRITE_DEBOUNCE_MS);
    },

    get started() {
      return started;
    },
    get lowFrequencyUntil() {
      return lowFrequencyUntil;
    },
    getLog: () => [...log],
  };
  return engine;
}

let activeEngine: SyncEngine | null = null;

/** Call after any local records write; the running engine sends it 2s after the last one. */
export function notifyLocalWrite(): void {
  activeEngine?.notifyLocalWrite();
}

/** Kicks the running engine, if any. */
export function kickSync(reason: string): Promise<void> {
  return activeEngine?.kick(reason) ?? Promise.resolve();
}

/** The running engine's recent events (100 max), for diagnostics. */
export function getSyncLog(): SyncLogEntry[] {
  return activeEngine?.getLog() ?? [];
}
