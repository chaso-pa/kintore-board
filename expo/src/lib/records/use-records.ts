import { useRecordsStore } from '@/lib/records/records-store';

/**
 * The open records repository and the owner its query keys are scoped to (plan §3.3).
 *
 * The owner is records-store's ownerUserId, not auth's userId, so a 401 does not change the
 * keys. `repo` is null until the DB is open; queries over it stay disabled until then.
 */
export function useRecords() {
  const repo = useRecordsStore((s) => s.repo);
  const owner = useRecordsStore((s) => s.ownerUserId) ?? '';
  return { repo, owner };
}
