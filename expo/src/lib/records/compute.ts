/**
 * The record-tab aggregates, computed on the device (plan §3.2).
 *
 * Each function is the TypeScript twin of a server function and returns the same body the
 * matching endpoint does, so screens can swap the API call for a local query without a
 * shape change. Both sides are pinned by backend/internal/services/testdata/*_cases.json.
 *
 * Inputs are rows as stored locally: nullable like the server's columns. Where the server
 * scans into non-pointer Go fields NULL reads as 0 / ""; where SQL does the work it follows
 * SQL (NULL fails `> 0`, SUM skips NULL). Each function says which.
 *
 * Day keys come from date-key.ts only, the e1RM from utils/rm.ts only.
 */
import type { ExerciseHistoryPoint, ExerciseHistorySet } from '@/components/record/chart-scale';
import { dateKey, monthRange, normalizeIso } from '@/lib/records/date-key';
import { estimateOneRM } from '@/utils/rm';

// --- Response bodies (same JSON as the endpoints) ---

export interface WorkoutDateEntry {
  date: string;
  workout_id: string;
}
export interface WorkoutDatesResponse {
  workouts: WorkoutDateEntry[];
}
export interface WorkoutStatsResponse {
  total_workouts: number;
  total_volume_kg: number;
}
export interface LastExerciseSetItem {
  weight: number;
  reps: number;
}
/** null is the endpoint's 404: the entry was never trained. */
export type LastExerciseSetsResponse = { date: string; sets: LastExerciseSetItem[] } | null;
export interface MaxE1RMResponse {
  max_e1rm: number;
}
export interface ExerciseHistoryResponse {
  exercise_name: string;
  has_weight_data: boolean;
  points: ExerciseHistoryPoint[];
}
export interface ExerciseSummaryItem {
  exercise_name: string;
  body_part: string;
  last_trained_on: string;
  session_count: number;
  best_e1rm: number;
}
export interface ExerciseListResponse {
  items: ExerciseSummaryItem[];
}
export interface UnclassifiedResponse {
  exercise_names: string[];
}

// --- Inputs ---

export interface WorkoutKeyRow {
  id: string;
  trained_on: string;
}

/** One set joined to its workout's trained_on. */
export interface ExerciseSetRow {
  trained_on: string;
  workout_id: string;
  id: string;
  exercise_name: string;
  weight: number | null;
  reps: number | null;
  sets: number | null;
  memo: string | null;
  spotted: boolean;
  body_part: string | null;
  sort_order: number;
}

// --- Ordering and scoping ---

/**
 * Go's string `<`: UTF-8 byte order, which is code-point order. JS `<` compares UTF-16
 * units and differs for characters outside the BMP.
 */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0;
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done) return y.done ? 0 : -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

function compareInstants(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return ta === tb ? 0 : ta < tb ? -1 : 1;
}

/** ORDER BY trained_on DESC, id DESC. */
export function newerFirst<T extends { trained_on: string; id: string }>(a: T, b: T): number {
  return compareInstants(b.trained_on, a.trained_on) || compareCodePoints(b.id, a.id);
}

/**
 * Which entries of a name a query covers: the server's ExerciseFilter. Empty bodyPart with
 * unclassified unset is every part.
 */
export interface ExerciseFilter {
  bodyPart?: string;
  unclassified?: boolean;
}

/** The filter for one picker entry, as lib/exercise-filter.ts sends it ('' = unclassified). */
export function filterForPart(bodyPart: string): ExerciseFilter {
  return bodyPart === '' ? { unclassified: true } : { bodyPart };
}

/** scopeToPart. */
export function partMatches(bodyPart: string | null, f: ExerciseFilter): boolean {
  if (f.unclassified) return bodyPart === null || bodyPart === '';
  if (f.bodyPart) return bodyPart === f.bodyPart;
  return true;
}

function scoped(rows: ExerciseSetRow[], exerciseName: string, f: ExerciseFilter): ExerciseSetRow[] {
  return rows.filter((r) => r.exercise_name === exerciseName && partMatches(r.body_part, f));
}

// --- Aggregates ---

/** GetWorkoutDates: the latest workout of each day in the month, newest day first. */
export function workoutDatesForMonth(workouts: WorkoutKeyRow[], year: number, month: number): WorkoutDatesResponse {
  const { start, end } = monthRange(year, month);
  const inMonth = workouts
    .filter((w) => {
      const t = normalizeIso(w.trained_on);
      return t >= start && t < end;
    })
    .sort(newerFirst);
  const seen = new Set<string>();
  const out: WorkoutDateEntry[] = [];
  for (const w of inMonth) {
    const d = dateKey(w.trained_on);
    if (seen.has(d)) continue;
    seen.add(d);
    out.push({ date: d, workout_id: w.id });
  }
  return { workouts: out };
}

/**
 * GetWorkoutStats, SQL semantics: weight × reps × max(COALESCE(sets, 1), 1), and a set with
 * NULL weight or reps adds nothing. Two workouts on one day count twice.
 */
export function workoutStats(
  workoutCount: number,
  sets: Pick<ExerciseSetRow, 'weight' | 'reps' | 'sets'>[]
): WorkoutStatsResponse {
  let volume = 0;
  for (const s of sets) {
    if (s.weight === null || s.reps === null) continue;
    volume += s.weight * s.reps * Math.max(s.sets ?? 1, 1);
  }
  return { total_workouts: workoutCount, total_volume_kg: volume };
}

/** GetLastExerciseSets: the entry's sets from the newest workout that has any. */
export function lastExerciseSets(
  rows: ExerciseSetRow[],
  exerciseName: string,
  f: ExerciseFilter
): LastExerciseSetsResponse {
  const own = scoped(rows, exerciseName, f);
  if (own.length === 0) return null;
  const latest = own
    .map((r) => ({ id: r.workout_id, trained_on: r.trained_on }))
    .sort(newerFirst)[0];
  const sets = own
    .filter((r) => r.workout_id === latest.id)
    .sort((a, b) => a.sort_order - b.sort_order || compareCodePoints(a.id, b.id));
  return {
    date: dateKey(latest.trained_on),
    // Scanned into non-pointer fields on the server: NULL is 0.
    sets: sets.map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 })),
  };
}

/**
 * GetExerciseMaxE1RM: best estimate over the entry's sets outside `excludeWorkoutId`, 0
 * when none. `weight > 0 AND reps > 0` in SQL, so NULL never qualifies.
 */
export function exerciseMaxE1RM(
  rows: ExerciseSetRow[],
  exerciseName: string,
  excludeWorkoutId: string,
  f: ExerciseFilter
): MaxE1RMResponse {
  let max = 0;
  for (const r of scoped(rows, exerciseName, f)) {
    if (r.workout_id === excludeWorkoutId || r.weight === null || r.reps === null) continue;
    if (r.weight <= 0 || r.reps <= 0) continue;
    const e = estimateOneRM(r.weight, r.reps);
    if (e !== null && e > max) max = e;
  }
  return { max_e1rm: max };
}

/** effectiveSets: a missing or zero count is one. */
function effectiveSets(sets: number): number {
  return sets < 1 ? 1 : sets;
}

/**
 * GetExerciseHistory (aggregateExerciseHistory): one point per day, oldest first. NULL
 * weight / reps / sets / memo read as 0 / 0 / 0 / "". Weight-based metrics use weighted
 * sets only; max_reps uses every set.
 */
export function exerciseHistory(
  rows: ExerciseSetRow[],
  exerciseName: string,
  f: ExerciseFilter
): ExerciseHistoryResponse {
  const ordered = scoped(rows, exerciseName, f).sort(
    (a, b) =>
      compareInstants(a.trained_on, b.trained_on) ||
      compareCodePoints(a.workout_id, b.workout_id) ||
      a.sort_order - b.sort_order ||
      compareCodePoints(a.id, b.id)
  );
  const byDate = new Map<string, ExerciseHistoryPoint>();
  let hasWeightData = false;
  for (const r of ordered) {
    const date = dateKey(r.trained_on);
    let p = byDate.get(date);
    if (!p) {
      p = { date, workout_ids: [], e1rm: 0, max_weight: 0, total_volume: 0, max_reps: 0, sets: [] };
      byDate.set(date, p);
    }
    if (!p.workout_ids.includes(r.workout_id)) p.workout_ids.push(r.workout_id);
    const weight = r.weight ?? 0;
    const reps = r.reps ?? 0;
    const sets = r.sets ?? 0;
    const set: ExerciseHistorySet = {
      workout_id: r.workout_id,
      weight,
      reps,
      sets,
      spotted: r.spotted,
      memo: r.memo ?? '',
    };
    p.sets.push(set);
    if (reps > p.max_reps) p.max_reps = reps;
    if (weight <= 0) continue;
    hasWeightData = true;
    if (weight > p.max_weight) p.max_weight = weight;
    const e = estimateOneRM(weight, reps);
    if (e !== null && e > p.e1rm) p.e1rm = e;
    p.total_volume += weight * reps * effectiveSets(sets);
  }
  const points = [...byDate.keys()].sort().map((d) => byDate.get(d)!);
  return { exercise_name: exerciseName, has_weight_data: hasWeightData, points };
}

/** One (name, part) entry of the list, as SQL GROUP BY produces it. */
export interface ExerciseGroupRow {
  exercise_name: string;
  /** COALESCE(body_part, ''). */
  body_part: string;
  /** MAX(trained_on). */
  last_trained_on: string;
  /** COUNT(DISTINCT workout_id). */
  session_count: number;
}

/** A set that may hold the entry's best e1RM. */
export interface ExerciseE1RMRow {
  exercise_name: string;
  body_part: string | null;
  weight: number | null;
  reps: number | null;
}

/**
 * summarizeExercises from grouped rows: best e1RM per entry, most recently trained first,
 * ties by name then part.
 */
export function summarizeExercises(groups: ExerciseGroupRow[], e1rmRows: ExerciseE1RMRow[]): ExerciseListResponse {
  const key = (name: string, part: string) => `${name}\u0000${part}`;
  const best = new Map<string, number>();
  for (const r of e1rmRows) {
    const e = estimateOneRM(r.weight ?? 0, r.reps ?? 0);
    if (e === null) continue;
    const k = key(r.exercise_name, r.body_part ?? '');
    if (e > (best.get(k) ?? 0)) best.set(k, e);
  }
  const items = [...groups]
    .sort(
      (a, b) =>
        compareInstants(b.last_trained_on, a.last_trained_on) ||
        compareCodePoints(a.exercise_name, b.exercise_name) ||
        compareCodePoints(a.body_part, b.body_part)
    )
    .map((g) => ({
      exercise_name: g.exercise_name,
      body_part: g.body_part,
      last_trained_on: dateKey(g.last_trained_on),
      session_count: g.session_count,
      best_e1rm: best.get(key(g.exercise_name, g.body_part)) ?? 0,
    }));
  return { items };
}

/** ListExercises over raw set rows: groups them, then summarizeExercises. */
export function listExercises(rows: ExerciseSetRow[]): ExerciseListResponse {
  const groups = new Map<string, ExerciseGroupRow & { workouts: Set<string> }>();
  for (const r of rows) {
    const part = r.body_part ?? '';
    const k = `${r.exercise_name}\u0000${part}`;
    let g = groups.get(k);
    if (!g) {
      g = { exercise_name: r.exercise_name, body_part: part, last_trained_on: r.trained_on, session_count: 0, workouts: new Set() };
      groups.set(k, g);
    }
    g.workouts.add(r.workout_id);
    if (compareInstants(r.trained_on, g.last_trained_on) > 0) g.last_trained_on = r.trained_on;
  }
  return summarizeExercises(
    [...groups.values()].map(({ workouts, ...g }) => ({ ...g, session_count: workouts.size })),
    rows
  );
}

/** UnclassifiedExerciseNames: distinct names with a NULL or "" part. Sorted; the server's order is unspecified. */
export function unclassifiedExerciseNames(rows: Pick<ExerciseSetRow, 'exercise_name' | 'body_part'>[]): UnclassifiedResponse {
  const names = new Set<string>();
  for (const r of rows) if (r.body_part === null || r.body_part === '') names.add(r.exercise_name);
  return { exercise_names: [...names].sort(compareCodePoints) };
}
