import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { api } from '@/lib/api';
import {
  deletionDoneMessage,
  deletionErrorMessage,
  type DeletableKind,
  type DeletionStatus,
} from '@/lib/content-deletion';
import { queryKeys } from '@/lib/query-keys';

export interface DeleteContentInput {
  kind: DeletableKind;
  id: string;
  /** Thread the post belongs to, so its post list and reply count can be refreshed. */
  threadId?: string;
}

/**
 * Removes a post or a thread.
 *
 * No optimistic update. The server can refuse — 403 for someone else's post, 409 when it is
 * already gone — and removing a row from the list before knowing would show content
 * vanishing that is still there. It is also not worth it: the request is one round trip and
 * the confirmation dialog already dominates the perceived wait.
 */
export function useDeleteContent(onDeleted?: (kind: DeletableKind) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ kind, id }: DeleteContentInput) => {
      const path = kind === 'thread' ? `/api/v1/threads/${id}` : `/api/v1/posts/${id}`;
      const res = await api.delete(path);
      return res.data as { id: string; status: DeletionStatus };
    },
    onSuccess: (data, { kind, threadId }) => {
      // The whole thread family: the listing, the hot list, bookmarks and the detail page
      // all count replies, and that count is derived from active posts alone.
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.root });
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.posts(threadId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.detail(threadId) });
      }
      // A removal usually settles a report, and the queue shows the target's status.
      queryClient.invalidateQueries({ queryKey: queryKeys.moderation.root });

      Alert.alert('削除しました', deletionDoneMessage(data.status));
      onDeleted?.(kind);
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const { title, message } = deletionErrorMessage(status);
      Alert.alert(title, message);
    },
  });
}
