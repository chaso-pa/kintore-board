/**
 * Every read and write of the local records DB (plan §3.1).
 *
 * Writes are serialized twice over: a JS mutex orders them, and each runs inside the
 * driver's exclusive transaction so no other query can interleave (R8). Reads wait for the
 * writes already queued, so a read issued after a save sees it.
 */
import type { ImportState } from '@/lib/records/coverage';
import { normalizeIso } from '@/lib/records/date-key';
import type { SqlDriver, SqlExecutor, SqlValue } from '@/lib/records/sql-driver';

export type MetaKey = 'owner_user_id' | 'import_state' | 'import_cursor' | 'covered_from' | 'import_count' | 'import_skipped_at';

/** A set as stored: nullable like the server's columns, so imported raw values survive. */
export interface LocalSetInput {
  exercise_name: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  memo: string | null;
  spotted: boolean;
  body_part: string | null;
}

export interface SaveWorkoutPayload {
  trained_on: string;
  memo: string | null;
  sets: LocalSetInput[];
}

export interface LocalSet extends LocalSetInput {
  id: string;
  sort_order: number;
}

export interface LocalWorkout {
  id: string;
  trained_on: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  sets: LocalSet[];
}

export interface DirtyWorkout {
  id: string;
  trained_on: string;
  memo: string | null;
  /** A tombstone: send DELETE, not the payload. */
  deleted: boolean;
  /** The version being sent; pass it back to markSynced. */
  local_version: number;
  sync_attempts: number;
  sets: LocalSet[];
}

/** One workout of an export page, values raw (NULL stays NULL). */
export interface ImportWorkoutItem {
  id: string;
  trained_on: string;
  memo: string | null;
  created_at?: string;
  updated_at?: string;
  sets: (Partial<LocalSetInput> & { id: string; exercise_name: string; sort_order?: number })[];
}

export interface ClassificationMapping {
  name: string;
  part: string;
}

export interface PendingClassification {
  exercise_name: string;
  body_part: string;
  created_at: string;
  attempts: number;
}

export interface WorkoutRow {
  id: string;
  trained_on: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface SetRow extends LocalSet {
  workout_id: string;
}

interface RawSetRow {
  id: string;
  workout_id: string;
  sort_order: number;
  exercise_name: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  memo: string | null;
  spotted: number;
  body_part: string | null;
}

export interface RepositoryOptions {
  now?: () => Date;
}

function toSet(r: RawSetRow): SetRow {
  return { ...r, spotted: r.spotted !== 0 };
}

function stripWorkoutId({ workout_id: _w, ...set }: SetRow): LocalSet {
  return set;
}

async function setsFor(db: SqlExecutor, ids: string[]): Promise<Map<string, LocalSet[]>> {
  const out = new Map<string, LocalSet[]>();
  if (ids.length === 0) return out;
  const rows = await db.getAll<RawSetRow>(
    `SELECT * FROM workout_sets WHERE workout_id IN (${ids.map(() => '?').join(',')})
     ORDER BY workout_id, sort_order, id`,
    ids
  );
  for (const r of rows) {
    const list = out.get(r.workout_id) ?? [];
    list.push(stripWorkoutId(toSet(r)));
    out.set(r.workout_id, list);
  }
  return out;
}

async function insertSet(
  tx: SqlExecutor,
  workoutId: string,
  id: string,
  sortOrder: number,
  s: Partial<LocalSetInput> & { exercise_name: string }
): Promise<void> {
  await tx.run(
    `INSERT INTO workout_sets (id, workout_id, sort_order, exercise_name, weight, reps, sets, memo, spotted, body_part)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workoutId,
      sortOrder,
      s.exercise_name,
      s.weight ?? null,
      s.reps ?? null,
      s.sets ?? null,
      s.memo ?? null,
      s.spotted ? 1 : 0,
      s.body_part ?? null,
    ]
  );
}

async function upsertMeta(tx: SqlExecutor, key: MetaKey, value: string): Promise<void> {
  await tx.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

export function createRepository(driver: SqlDriver, options: RepositoryOptions = {}) {
  const now = () => (options.now ? options.now() : new Date()).toISOString();
  let tail: Promise<unknown> = Promise.resolve();

  function write<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const result = tail.then(() => driver.exclusiveTransaction(fn));
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async function read<T>(fn: (db: SqlExecutor) => Promise<T>): Promise<T> {
    await tail;
    return fn(driver);
  }

  return {
    /** Runs a read after queued writes. For the query layer (Phase 3). */
    read,

    getMeta: (key: MetaKey) =>
      read(async (db) => (await db.getFirst<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]))?.value ?? null),

    setMeta: (key: MetaKey, value: string) => write((tx) => upsertMeta(tx, key, value)),

    /** Coverage inputs for isDateComplete. A missing import_state is 'pending'. */
    getCoverageState: () =>
      read(async (db) => {
        const rows = await db.getAll<{ key: string; value: string }>(
          "SELECT key, value FROM meta WHERE key IN ('import_state', 'covered_from', 'import_count')"
        );
        const m = new Map(rows.map((r) => [r.key, r.value]));
        return {
          importState: (m.get('import_state') as ImportState | undefined) ?? 'pending',
          coveredFrom: m.get('covered_from') || null,
          importCount: Number(m.get('import_count') ?? 0),
        };
      }),

    /**
     * Upserts a workout and replaces its sets. A tombstoned id is left alone (returns false):
     * a late autosave flush after delete must not bring the workout back (R2).
     */
    saveWorkout: (id: string, payload: SaveWorkoutPayload) =>
      write(async (tx) => {
        const existing = await tx.getFirst<{ deleted_at: string | null }>(
          'SELECT deleted_at FROM workouts WHERE id = ?',
          [id]
        );
        if (existing?.deleted_at) return false;
        const ts = now();
        await tx.run(
          `INSERT INTO workouts (id, trained_on, memo, created_at, updated_at, local_version, synced_version, origin)
           VALUES (?, ?, ?, ?, ?, 1, 0, 'local')
           ON CONFLICT(id) DO UPDATE SET
             trained_on = excluded.trained_on,
             memo = excluded.memo,
             updated_at = excluded.updated_at,
             local_version = workouts.local_version + 1,
             sync_attempts = 0,
             next_attempt_at = NULL`,
          [id, normalizeIso(payload.trained_on), payload.memo, ts, ts]
        );
        await tx.run('DELETE FROM workout_sets WHERE workout_id = ?', [id]);
        for (let i = 0; i < payload.sets.length; i++) {
          await insertSet(tx, id, `${id}:${i}`, i, payload.sets[i]);
        }
        return true;
      }),

    /**
     * Tombstones a workout: sets removed, row kept forever with deleted_at so imports skip it
     * and the sync engine sends DELETE. An unknown id gets a tombstone too.
     */
    deleteWorkout: (id: string) =>
      write(async (tx) => {
        const ts = now();
        const existing = await tx.getFirst<{ deleted_at: string | null }>(
          'SELECT deleted_at FROM workouts WHERE id = ?',
          [id]
        );
        if (existing?.deleted_at) return;
        await tx.run('DELETE FROM workout_sets WHERE workout_id = ?', [id]);
        if (existing) {
          await tx.run(
            `UPDATE workouts SET deleted_at = ?, updated_at = ?, local_version = local_version + 1,
               sync_attempts = 0, next_attempt_at = NULL
             WHERE id = ?`,
            [ts, ts, id]
          );
        } else {
          await tx.run(
            `INSERT INTO workouts (id, trained_on, memo, created_at, updated_at, deleted_at, local_version, synced_version)
             VALUES (?, ?, NULL, ?, ?, ?, 1, 0)`,
            [id, ts, ts, ts, ts]
          );
        }
      }),

    getWorkout: (id: string) =>
      read(async (db): Promise<LocalWorkout | null> => {
        const w = await db.getFirst<WorkoutRow>(
          'SELECT id, trained_on, memo, created_at, updated_at FROM workouts WHERE id = ? AND deleted_at IS NULL',
          [id]
        );
        if (!w) return null;
        return { ...w, sets: (await setsFor(db, [id])).get(id) ?? [] };
      }),

    /** Dirty workouts due by `at`, oldest edit first, with sets for upserts. */
    listDirty: (limit: number, at: Date) =>
      read(async (db): Promise<DirtyWorkout[]> => {
        const rows = await db.getAll<{
          id: string;
          trained_on: string;
          memo: string | null;
          deleted_at: string | null;
          local_version: number;
          sync_attempts: number;
        }>(
          `SELECT id, trained_on, memo, deleted_at, local_version, sync_attempts FROM workouts
           WHERE local_version > synced_version AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
           ORDER BY updated_at, id LIMIT ?`,
          [at.toISOString(), limit]
        );
        const sets = await setsFor(
          db,
          rows.filter((r) => !r.deleted_at).map((r) => r.id)
        );
        return rows.map(({ deleted_at, ...r }) => ({
          ...r,
          deleted: deleted_at !== null,
          sets: sets.get(r.id) ?? [],
        }));
      }),

    /**
     * CAS after a successful send of `sentVersion`. If the user edited during the send,
     * local_version is already past it and the row stays dirty.
     */
    markSynced: (id: string, sentVersion: number) =>
      write(
        async (tx) =>
          (
            await tx.run(
              `UPDATE workouts SET synced_version = ?, sync_attempts = 0, next_attempt_at = NULL, last_error = NULL
               WHERE id = ? AND synced_version < ?`,
              [sentVersion, id, sentVersion]
            )
          ).changes > 0
      ),

    /** 410 from the server: the workout is gone there for good, so settle it as a tombstone. */
    markDeletedFromServer: (id: string) =>
      write(async (tx) => {
        await tx.run(
          `UPDATE workouts SET deleted_at = COALESCE(deleted_at, ?), synced_version = local_version,
             sync_attempts = 0, next_attempt_at = NULL, last_error = NULL
           WHERE id = ?`,
          [now(), id]
        );
        await tx.run('DELETE FROM workout_sets WHERE workout_id = ?', [id]);
      }),

    recordAttemptFailure: (id: string, nextAttemptAt: Date, error: string) =>
      write(async (tx) => {
        await tx.run(
          `UPDATE workouts SET sync_attempts = sync_attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?`,
          [nextAttemptAt.toISOString(), error, id]
        );
      }),

    /**
     * Applies one export page atomically (plan §3.5). Local rows win: existing ids
     * (tombstones included) are skipped. Imported rows are clean (local = synced = 1), so
     * they are never re-sent unless the user edits them.
     */
    importPage: (
      items: ImportWorkoutItem[],
      nextCursor: string | null,
      coveredFrom: string | null,
      /** Retry of a skipped import: never flip import_state to running (would block creation). */
      keepDone = false
    ) =>
      write(async (tx) => {
        let inserted = 0;
        for (const item of items) {
          const trainedOn = normalizeIso(item.trained_on);
          const createdAt = item.created_at ? normalizeIso(item.created_at) : trainedOn;
          const updatedAt = item.updated_at ? normalizeIso(item.updated_at) : createdAt;
          const r = await tx.run(
            `INSERT INTO workouts (id, trained_on, memo, created_at, updated_at, local_version, synced_version, origin)
             VALUES (?, ?, ?, ?, ?, 1, 1, 'import')
             ON CONFLICT(id) DO NOTHING`,
            [item.id, trainedOn, item.memo ?? null, createdAt, updatedAt]
          );
          if (r.changes === 0) continue;
          inserted++;
          for (let i = 0; i < item.sets.length; i++) {
            const s = item.sets[i];
            await insertSet(tx, item.id, s.id, s.sort_order ?? i, s);
          }
        }
        const countRow = await tx.getFirst<{ value: string }>("SELECT value FROM meta WHERE key = 'import_count'");
        await upsertMeta(tx, 'import_count', String(Number(countRow?.value ?? 0) + items.length));
        await upsertMeta(tx, 'import_cursor', nextCursor ?? '');
        if (coveredFrom) await upsertMeta(tx, 'covered_from', normalizeIso(coveredFrom));
        await upsertMeta(tx, 'import_state', nextCursor && !keepDone ? 'running' : 'done');
        return { inserted };
      }),

    /**
     * Dev-only seeding (SyncDiagnostics): inserts `items` in one transaction already settled
     * (local = synced = 1), so the sync engine never sees them. Import meta is untouched.
     */
    devInsertSynced: (items: ImportWorkoutItem[]) =>
      write(async (tx) => {
        if (!__DEV__) throw new Error('devInsertSynced is dev-only');
        const ts = now();
        for (const item of items) {
          await tx.run(
            `INSERT INTO workouts (id, trained_on, memo, created_at, updated_at, local_version, synced_version)
             VALUES (?, ?, ?, ?, ?, 1, 1)`,
            [item.id, normalizeIso(item.trained_on), item.memo ?? null, ts, ts]
          );
          for (let i = 0; i < item.sets.length; i++) {
            const s = item.sets[i];
            await insertSet(tx, item.id, s.id, s.sort_order ?? i, s);
          }
        }
      }),

    /**
     * Fills in parts for sets that have none (F2). Versions are untouched, so imported rows
     * are not re-sent; the server is told through pending_classifications instead.
     */
    classifyExercises: (mappings: ClassificationMapping[]) =>
      write(async (tx) => {
        const ts = now();
        for (const { name, part } of mappings) {
          await tx.run(
            `UPDATE workout_sets SET body_part = ? WHERE exercise_name = ? AND (body_part IS NULL OR body_part = '')`,
            [part, name]
          );
          // created_at is the CAS token for deletePendingClassificationCAS, so it must change
          // on every re-classification, even within the same millisecond.
          const prev = await tx.getFirst<{ created_at: string }>(
            'SELECT created_at FROM pending_classifications WHERE exercise_name = ?',
            [name]
          );
          const createdAt =
            prev && prev.created_at >= ts ? new Date(new Date(prev.created_at).getTime() + 1).toISOString() : ts;
          await tx.run(
            `INSERT INTO pending_classifications (exercise_name, body_part, created_at, attempts, next_attempt_at)
             VALUES (?, ?, ?, 0, NULL)
             ON CONFLICT(exercise_name) DO UPDATE SET
               body_part = excluded.body_part, created_at = excluded.created_at, attempts = 0, next_attempt_at = NULL`,
            [name, part, createdAt]
          );
        }
      }),

    /** Pending classifications, due by `at` when given. */
    listPendingClassifications: (limit = 100, at?: Date) =>
      read((db) => {
        const params: SqlValue[] = [];
        let where = '';
        if (at) {
          where = 'WHERE next_attempt_at IS NULL OR next_attempt_at <= ?';
          params.push(at.toISOString());
        }
        params.push(limit);
        return db.getAll<PendingClassification>(
          `SELECT exercise_name, body_part, created_at, attempts FROM pending_classifications ${where}
           ORDER BY created_at, exercise_name LIMIT ?`,
          params
        );
      }),

    /** Deletes only if not re-classified since it was read. */
    deletePendingClassificationCAS: (name: string, createdAt: string) =>
      write(
        async (tx) =>
          (
            await tx.run('DELETE FROM pending_classifications WHERE exercise_name = ? AND created_at = ?', [
              name,
              createdAt,
            ])
          ).changes > 0
      ),

    /** R13: dirty workouts (tombstones included) + pending classifications. */
    unsyncedCount: () =>
      read(async (db) => {
        const row = await db.getFirst<{ n: number }>(
          `SELECT (SELECT COUNT(*) FROM workouts WHERE local_version > synced_version)
                + (SELECT COUNT(*) FROM pending_classifications) AS n`
        );
        return row?.n ?? 0;
      }),

    /** Live workouts, for the compute layer. */
    getAllWorkoutRows: () =>
      read((db) =>
        db.getAll<WorkoutRow>(
          `SELECT id, trained_on, memo, created_at, updated_at FROM workouts
           WHERE deleted_at IS NULL ORDER BY trained_on DESC, id DESC`
        )
      ),

    /** Sets of live workouts, for the compute layer. */
    getAllSetRows: () =>
      read(async (db) =>
        (
          await db.getAll<RawSetRow>(
            `SELECT s.* FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
             WHERE w.deleted_at IS NULL ORDER BY s.workout_id, s.sort_order, s.id`
          )
        ).map(toSet)
      ),

    /** Waits for queued writes, then closes the driver. */
    close: async () => {
      await tail;
      await driver.close();
    },
  };
}

export type RecordsRepository = ReturnType<typeof createRepository>;
