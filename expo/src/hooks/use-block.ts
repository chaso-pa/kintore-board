import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { blockInvalidationKeys, queryKeys } from '@/lib/query-keys';

export interface BlockedUser {
  blocked_user_id: string;
  source_excerpt: string;
  created_at: string;
}

/**
 * Blocks the author of a post.
 *
 * Addressed by post id, never by user id — the app is never told who wrote anything, and the
 * server resolves the author. See the endpoint's own note for why that is not an accident.
 *
 * Unlike useReport, which deliberately invalidates nothing, this clears the board caches on
 * success. That is the "instantly" half of App Store guideline 1.2: the server stops
 * returning the blocked account's posts, and this is what makes the screen ask again rather
 * than keep showing what it already had.
 */
export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const res = await api.post(`/api/v1/posts/${postId}/block`, {});
      return res.data as BlockedUser;
    },
    onSuccess: () => {
      for (const key of blockInvalidationKeys()) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useBlockedUsers() {
  return useQuery({
    queryKey: queryKeys.blocks.list(),
    queryFn: async () => {
      const res = await api.get('/api/v1/users/me/blocks');
      return res.data.items as BlockedUser[];
    },
  });
}

/**
 * Lifts a block.
 *
 * Invalidates the same set as blocking. Unblocking puts posts back that are not in any
 * cached page, so the listings have to be refetched rather than patched.
 */
export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blockedUserId: string) => {
      await api.delete(`/api/v1/users/me/blocks/${blockedUserId}`);
    },
    onSuccess: () => {
      for (const key of blockInvalidationKeys()) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
