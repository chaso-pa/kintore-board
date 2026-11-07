/**
 * The record-tab reads over the local DB (plan §3.2): SQL narrows and aggregates, compute.ts
 * shapes the answer. Every query skips tombstones (`deleted_at IS NULL`).
 *
 * Stored trained_on values all share normalizeIso's shape, so comparing and ordering them
 * as strings is ordering them in time.
 */
import {
  exerciseHistory,
  exerciseMaxE1RM,
  lastExerciseSets,
  summarizeExercises,
  unclassifiedExerciseNames,
  workoutDatesForMonth,
  type ExerciseE1RMRow,
  type ExerciseFilter,
  type ExerciseGroupRow,
  type ExerciseHistoryResponse,
  type ExerciseListResponse,
  type ExerciseSetRow,
  type LastExerciseSetsResponse,
  type MaxE1RMResponse,
  type UnclassifiedResponse,
  type WorkoutDatesResponse,
  type WorkoutKeyRow,
  type WorkoutStatsResponse,
} from '@/lib/records/compute';
import { monthRange } from '@/lib/records/date-key';
import type { RecordsRepository } from '@/lib/records/repository';
import type { SqlExecutor, SqlValue } from '@/lib/records/sql-driver';

type Reader = Pick<RecordsRepository, 'read' | 'getWorkout'>;

/** GET /workouts/{id}. memo and body_part are omitted when empty (Go `omitempty`). */
export interface WorkoutDetailSet {
  id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  memo?: string;
  spotted: boolean;
  body_part?: string;
}
export interface WorkoutDetailResponse {
  id: string;
  trained_on: string;
  memo?: string;
  created_at: string;
  sets: WorkoutDetailSet[];
}

/** scopeToPart as a WHERE fragment over `s`. */
function scopeSql(f: ExerciseFilter): { sql: string; params: SqlValue[] } {
  if (f.unclassified) return { sql: " AND (s.body_part IS NULL OR s.body_part = '')", params: [] };
  if (f.bodyPart) return { sql: ' AND s.body_part = ?', params: [f.bodyPart] };
  return { sql: '', params: [] };
}

interface RawExerciseSetRow extends Omit<ExerciseSetRow, 'spotted'> {
  spotted: number;
}

const SET_COLUMNS = `w.trained_on AS trained_on, s.workout_id AS workout_id, s.id AS id,
  s.exercise_name AS exercise_name, s.weight AS weight, s.reps AS reps, s.sets AS sets,
  s.memo AS memo, s.spotted AS spotted, s.body_part AS body_part, s.sort_order AS sort_order`;

async function exerciseRows(
  db: SqlExecutor,
  where: string,
  params: SqlValue[],
  order = ''
): Promise<ExerciseSetRow[]> {
  const rows = await db.getAll<RawExerciseSetRow>(
    `SELECT ${SET_COLUMNS} FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE w.deleted_at IS NULL ${where} ${order}`,
    params
  );
  return rows.map((r) => ({ ...r, spotted: r.spotted !== 0 }));
}

export function getWorkoutDates(repo: Reader, year: number, month: number): Promise<WorkoutDatesResponse> {
  const { start, end } = monthRange(year, month);
  return repo.read(async (db) =>
    workoutDatesForMonth(
      await db.getAll<WorkoutKeyRow>(
        `SELECT id, trained_on FROM workouts
         WHERE deleted_at IS NULL AND trained_on >= ? AND trained_on < ?
         ORDER BY trained_on DESC, id DESC`,
        [start, end]
      ),
      year,
      month
    )
  );
}

/** SQL COUNT / SUM, the same statement the server runs. */
export function getWorkoutStats(repo: Reader): Promise<WorkoutStatsResponse> {
  return repo.read(async (db) => {
    const row = await db.getFirst<{ n: number; v: number }>(
      `SELECT
         (SELECT COUNT(*) FROM workouts WHERE deleted_at IS NULL) AS n,
         (SELECT COALESCE(SUM(s.weight * s.reps * MAX(COALESCE(s.sets, 1), 1)), 0)
            FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
            WHERE w.deleted_at IS NULL) AS v`
    );
    return { total_workouts: row?.n ?? 0, total_volume_kg: row?.v ?? 0 };
  });
}

export function getLastExerciseSets(
  repo: Reader,
  exerciseName: string,
  f: ExerciseFilter
): Promise<LastExerciseSetsResponse> {
  const scope = scopeSql(f);
  return repo.read(async (db) => {
    const latest = await db.getFirst<{ id: string }>(
      `SELECT w.id AS id FROM workouts w JOIN workout_sets s ON s.workout_id = w.id
       WHERE w.deleted_at IS NULL AND s.exercise_name = ?${scope.sql}
       ORDER BY w.trained_on DESC, w.id DESC LIMIT 1`,
      [exerciseName, ...scope.params]
    );
    if (!latest) return null;
    const rows = await exerciseRows(db, `AND s.workout_id = ? AND s.exercise_name = ?${scope.sql}`, [
      latest.id,
      exerciseName,
      ...scope.params,
    ]);
    return lastExerciseSets(rows, exerciseName, f);
  });
}

export function getExerciseMaxE1RM(
  repo: Reader,
  exerciseName: string,
  excludeWorkoutId: string,
  f: ExerciseFilter
): Promise<MaxE1RMResponse> {
  const scope = scopeSql(f);
  return repo.read(async (db) =>
    exerciseMaxE1RM(
      await exerciseRows(
        db,
        `AND s.exercise_name = ? AND w.id != ? AND s.weight > 0 AND s.reps > 0${scope.sql}`,
        [exerciseName, excludeWorkoutId, ...scope.params]
      ),
      exerciseName,
      excludeWorkoutId,
      f
    )
  );
}

export function getExerciseHistory(
  repo: Reader,
  exerciseName: string,
  f: ExerciseFilter
): Promise<ExerciseHistoryResponse> {
  const scope = scopeSql(f);
  return repo.read(async (db) =>
    exerciseHistory(
      await exerciseRows(
        db,
        `AND s.exercise_name = ?${scope.sql}`,
        [exerciseName, ...scope.params],
        'ORDER BY w.trained_on, s.workout_id, s.sort_order, s.id'
      ),
      exerciseName,
      f
    )
  );
}

/**
 * GROUP BY for count and last date; the best e1RM needs the rep count per row (Brzycki),
 * so only the rows that can be estimated are read and the maximum is taken in TS.
 */
export function getExerciseList(repo: Reader): Promise<ExerciseListResponse> {
  return repo.read(async (db) => {
    const groups = await db.getAll<ExerciseGroupRow>(
      `SELECT s.exercise_name AS exercise_name, COALESCE(s.body_part, '') AS body_part,
         MAX(w.trained_on) AS last_trained_on, COUNT(DISTINCT s.workout_id) AS session_count
       FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
       WHERE w.deleted_at IS NULL
       GROUP BY s.exercise_name, COALESCE(s.body_part, '')`
    );
    const e1rmRows = await db.getAll<ExerciseE1RMRow>(
      `SELECT s.exercise_name AS exercise_name, COALESCE(s.body_part, '') AS body_part,
         s.weight AS weight, s.reps AS reps
       FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
       WHERE w.deleted_at IS NULL AND s.weight > 0 AND s.reps BETWEEN 1 AND 36`
    );
    return summarizeExercises(groups, e1rmRows);
  });
}

export function getUnclassifiedExerciseNames(repo: Reader): Promise<UnclassifiedResponse> {
  return repo.read(async (db) =>
    unclassifiedExerciseNames(
      await db.getAll<{ exercise_name: string; body_part: string | null }>(
        `SELECT DISTINCT s.exercise_name AS exercise_name, NULL AS body_part
         FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
         WHERE w.deleted_at IS NULL AND (s.body_part IS NULL OR s.body_part = '')`
      )
    )
  );
}

/** GET /workouts/{id}; null is the 404 (unknown or tombstoned). */
export async function getWorkoutDetail(repo: Reader, id: string): Promise<WorkoutDetailResponse | null> {
  const w = await repo.getWorkout(id);
  if (!w) return null;
  return {
    id: w.id,
    trained_on: w.trained_on,
    ...(w.memo ? { memo: w.memo } : {}),
    created_at: w.created_at,
    sets: w.sets.map((s) => ({
      id: s.id,
      exercise_name: s.exercise_name,
      weight: s.weight ?? 0,
      reps: s.reps ?? 0,
      sets: s.sets ?? 0,
      ...(s.memo ? { memo: s.memo } : {}),
      spotted: s.spotted,
      ...(s.body_part ? { body_part: s.body_part } : {}),
    })),
  };
}
