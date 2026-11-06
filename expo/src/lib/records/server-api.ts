/**
 * The records endpoints, for the sync engine and importer only (plan §3.3 R10, §3.4).
 *
 * Screens never call these: they read and write the local DB, and the engine carries the
 * changes. 20s timeout, longer than the app default, as an export page or a batch of sets
 * on a slow line can take a while and a timeout here only means a retry later.
 */
import { api } from '@/lib/api';

const TIMEOUT_MS = 20_000;

export interface UpsertWorkoutSet {
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  memo: string;
  spotted: boolean;
  body_part?: string;
}

export interface UpsertWorkoutBody {
  id: string;
  trained_on: string;
  memo: string;
  sets: UpsertWorkoutSet[];
}

export interface ExportSetItem {
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

export interface ExportWorkoutItem {
  id: string;
  trained_on: string;
  memo: string | null;
  created_at: string;
  sets: ExportSetItem[];
}

export interface ExportPage {
  items: ExportWorkoutItem[];
  /** Empty on the last page. */
  next_cursor: string;
}

export interface ClassifyMapping {
  exercise_name: string;
  body_part: string;
}

/** Upserts by id. 410 if the id was deleted by this user, 409 if another user owns it. */
export async function upsertWorkout(body: UpsertWorkoutBody): Promise<void> {
  await api.post('/api/v1/workouts', body, { timeout: TIMEOUT_MS });
}

/** Idempotent: 204 whether or not the workout existed. Older servers answer 404 instead. */
export async function deleteWorkout(id: string): Promise<void> {
  await api.delete(`/api/v1/workouts/${encodeURIComponent(id)}`, { timeout: TIMEOUT_MS });
}

export async function exportPage(cursor: string, limit = 200): Promise<ExportPage> {
  const res = await api.get<ExportPage>('/api/v1/workouts/export', {
    params: { cursor, limit },
    timeout: TIMEOUT_MS,
  });
  return { items: res.data?.items ?? [], next_cursor: res.data?.next_cursor ?? '' };
}

/** Fills in body parts for sets that have none. Returns the number of sets updated. */
export async function classifyExercises(mappings: ClassifyMapping[]): Promise<number> {
  const res = await api.post<{ updated: number }>(
    '/api/v1/workouts/classify-exercises',
    { mappings },
    { timeout: TIMEOUT_MS }
  );
  return res.data?.updated ?? 0;
}
