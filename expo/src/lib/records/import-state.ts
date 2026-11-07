/**
 * The initial import's progress, for ImportStatusCard (plan §3.5 U5).
 *
 * The truth is in the DB's meta table; this mirrors it for rendering. The importer publishes
 * after every transition and page, and the hook re-reads whenever the open DB changes.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

import type { ImportState } from '@/lib/records/coverage';
import { useRecordsStore } from '@/lib/records/records-store';
import type { RecordsRepository } from '@/lib/records/repository';

interface ImportStatus {
  /** null while no DB is open (web, before boot). */
  importState: ImportState | null;
  importCount: number;
}

export const useImportStatusStore = create<ImportStatus>(() => ({ importState: null, importCount: 0 }));

/** Re-reads `repo`'s import meta, unless another DB has been opened meanwhile. */
export async function refreshImportState(repo: RecordsRepository): Promise<void> {
  const s = await repo.getCoverageState();
  if (useRecordsStore.getState().repo !== repo) return;
  useImportStatusStore.setState({ importState: s.importState, importCount: s.importCount });
}

export function useImportState(): ImportStatus {
  const repo = useRecordsStore((s) => s.repo);
  useEffect(() => {
    if (!repo) {
      useImportStatusStore.setState({ importState: null, importCount: 0 });
      return;
    }
    refreshImportState(repo).catch(() => undefined);
  }, [repo]);
  const importState = useImportStatusStore((s) => s.importState);
  const importCount = useImportStatusStore((s) => s.importCount);
  return { importState, importCount };
}
