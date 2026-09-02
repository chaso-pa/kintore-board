import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { type CustomExercise } from '@/lib/custom-exercises';
import { resolveMappings } from '@/lib/exercise-backfill';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Fills in the body part for sets recorded before the field existed.
 *
 * Only this device can. The server has no map from an exercise name to a part — the presets
 * ship inside the app and anything custom lives in a file here — so it asks which of the
 * user's names it still has no part for, and this answers from the local catalog.
 *
 * Runs once per launch, and only while there is a catalog to answer from: on the very first
 * render the custom lists are still being read off disk, and answering then would classify
 * a user's own exercises as though they did not exist.
 *
 * Failure is silent. Nothing on screen depends on this having finished — an unclassified row
 * still displays, still counts, and is simply offered again next time.
 */
export function useExerciseBackfill(custom: CustomExercise[], customParts: string[], ready: boolean) {
  const qc = useQueryClient();
  const done = useRef(false);

  const { data: names } = useQuery<string[]>({
    queryKey: queryKeys.exercises.unclassified(),
    queryFn: () =>
      api
        .get<{ exercise_names: string[] }>('/api/v1/workouts/unclassified-exercises')
        .then((r) => r.data.exercise_names),
    enabled: ready,
    staleTime: Infinity,
  });

  const classify = useMutation({
    mutationFn: (mappings: { exercise_name: string; body_part: string }[]) =>
      api.post('/api/v1/workouts/classify-exercises', { mappings }),
    onSuccess: () => {
      // The histories these rows belong to were computed without a part.
      qc.invalidateQueries({ queryKey: queryKeys.exercises.root });
      qc.invalidateQueries({ queryKey: queryKeys.workouts.root });
      qc.invalidateQueries({ queryKey: queryKeys.exercises.unclassified() });
    },
  });

  useEffect(() => {
    if (done.current || !ready || !names || names.length === 0) return;
    const mappings = resolveMappings(names, custom, customParts);
    if (mappings.length === 0) return;
    done.current = true;
    classify.mutate(mappings);
    // classify is recreated each render; depending on it would re-run this forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, names, custom, customParts]);
}
