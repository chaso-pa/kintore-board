import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type CustomExercise } from '@/lib/custom-exercises';
import { resolveMappings } from '@/lib/exercise-backfill';
import { queryKeys } from '@/lib/query-keys';
import { useImportState } from '@/lib/records/import-state';
import { invalidateAllRecords } from '@/lib/records/invalidate';
import { getUnclassifiedExerciseNames } from '@/lib/records/queries';
import { recordsQueryDefaults } from '@/lib/records/query-options';
import { notifyLocalWrite } from '@/lib/records/sync-engine';
import { useRecords } from '@/lib/records/use-records';

/**
 * Fills in the body part for sets recorded before the field existed.
 *
 * Only this device can. The server has no map from an exercise name to a part — the presets
 * ship inside the app and anything custom lives in a file here — so the local records are
 * asked which names still have no part, and this answers from the local catalog (F2): the
 * local rows are updated at once and the server is told through pending_classifications.
 *
 * Runs once per launch, only after the initial import is done (so the list reflects the
 * whole history), and only while there is a catalog to answer from: on the very first
 * render the custom lists are still being read off disk, and answering then would classify
 * a user's own exercises as though they did not exist.
 *
 * Failure is silent. Nothing on screen depends on this having finished — an unclassified row
 * still displays, still counts, and is simply offered again next time.
 */
export function useExerciseBackfill(custom: CustomExercise[], customParts: string[], ready: boolean) {
  const qc = useQueryClient();
  const { repo, owner } = useRecords();
  const importDone = useImportState().importState === 'done';
  const done = useRef(false);
  const active = ready && importDone && !!repo;

  const { data: names } = useQuery<string[]>({
    queryKey: queryKeys.records.unclassified(owner),
    queryFn: () => getUnclassifiedExerciseNames(repo!).then((r) => r.exercise_names),
    enabled: active,
    ...recordsQueryDefaults,
  });

  const classify = useMutation({
    networkMode: 'always',
    mutationFn: (mappings: { exercise_name: string; body_part: string }[]) =>
      repo!.classifyExercises(mappings.map((m) => ({ name: m.exercise_name, part: m.body_part }))),
    onSuccess: () => {
      // The histories these rows belong to were computed without a part.
      invalidateAllRecords(qc, owner);
      notifyLocalWrite();
    },
  });

  useEffect(() => {
    if (done.current || !active || !names || names.length === 0) return;
    const mappings = resolveMappings(names, custom, customParts);
    if (mappings.length === 0) return;
    done.current = true;
    classify.mutate(mappings);
    // classify is recreated each render; depending on it would re-run this forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, names, custom, customParts]);
}
