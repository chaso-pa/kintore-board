import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { invalidateAllRecords } from '@/lib/records/invalidate';
import { getUnclassifiedExerciseNames } from '@/lib/records/queries';
import { recordsQueryDefaults } from '@/lib/records/query-options';
import { notifyLocalWrite } from '@/lib/records/sync-engine';
import { useRecords } from '@/lib/records/use-records';

/**
 * Recorded exercise names that still have no body part, and a way to answer.
 *
 * The automatic pass fills in everything this device's catalog recognises. What it cannot
 * place — an exercise whose custom entry was deleted, or one recorded on a phone the user no
 * longer has — is left alone rather than guessed at, and would otherwise sit unclassified
 * forever without anyone being told.
 *
 * This is where the user is told. Read from the local records, same query key as the
 * automatic pass, so answering one here removes it from both. The answer is applied locally
 * at once (offline too) and reaches the server through pending_classifications (F2).
 */
export function useUnclassifiedExercises(enabled: boolean) {
  const qc = useQueryClient();
  const { repo, owner } = useRecords();

  const { data } = useQuery<string[]>({
    queryKey: queryKeys.records.unclassified(owner),
    queryFn: () => getUnclassifiedExerciseNames(repo!).then((r) => r.exercise_names),
    enabled: enabled && !!repo,
    ...recordsQueryDefaults,
  });

  const { mutate, isPending } = useMutation({
    networkMode: 'always',
    mutationFn: ({ name, bodyPart }: { name: string; bodyPart: string }) =>
      repo!.classifyExercises([{ name, part: bodyPart }]),
    onSuccess: () => {
      // The histories these sets belong to were computed without a part.
      invalidateAllRecords(qc, owner);
      notifyLocalWrite();
    },
  });

  return {
    unclassified: data ?? [],
    assign: (name: string, bodyPart: string) => mutate({ name, bodyPart }),
    assigning: isPending,
  };
}
