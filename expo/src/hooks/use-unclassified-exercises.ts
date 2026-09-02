import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * Recorded exercise names the server still has no body part for, and a way to answer.
 *
 * The automatic pass fills in everything this device's catalog recognises. What it cannot
 * place — an exercise whose custom entry was deleted, or one recorded on a phone the user no
 * longer has — is left alone rather than guessed at, and would otherwise sit unclassified
 * forever without anyone being told.
 *
 * This is where the user is told. Same query key as the automatic pass, so answering one
 * here removes it from both.
 */
export function useUnclassifiedExercises(enabled: boolean) {
  const qc = useQueryClient();

  const { data } = useQuery<string[]>({
    queryKey: queryKeys.exercises.unclassified(),
    queryFn: () =>
      api
        .get<{ exercise_names: string[] }>('/api/v1/workouts/unclassified-exercises')
        .then((r) => r.data.exercise_names),
    enabled,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ name, bodyPart }: { name: string; bodyPart: string }) =>
      api.post('/api/v1/workouts/classify-exercises', {
        mappings: [{ exercise_name: name, body_part: bodyPart }],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.exercises.unclassified() });
      // The histories these sets belong to were computed without a part.
      qc.invalidateQueries({ queryKey: queryKeys.exercises.root });
      qc.invalidateQueries({ queryKey: queryKeys.workouts.root });
    },
  });

  return {
    unclassified: data ?? [],
    assign: (name: string, bodyPart: string) => mutate({ name, bodyPart }),
    assigning: isPending,
  };
}
