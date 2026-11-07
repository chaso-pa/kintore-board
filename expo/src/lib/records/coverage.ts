import { dateKey } from '@/lib/records/date-key';

export type ImportState = 'pending' | 'running' | 'done';

export interface CoverageState {
  importState: ImportState;
  /** Oldest trained_on imported so far (ISO), or null before the first page. */
  coveredFrom: string | null;
}

/**
 * Whether every server workout on `dateKeyStr` (`YYYY-MM-DD`) is already in the local DB
 * (plan §3.5 step 4). The export runs newest first, so the days after the oldest imported
 * day are complete; that day itself is not, as the rest of it may be on the next page.
 */
export function isDateComplete(dateKeyStr: string, { importState, coveredFrom }: CoverageState): boolean {
  if (importState === 'done') return true;
  if (!coveredFrom) return false;
  return dateKeyStr > dateKey(coveredFrom);
}
