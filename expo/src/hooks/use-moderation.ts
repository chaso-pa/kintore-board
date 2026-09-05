import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { api } from '@/lib/api';
import { moderationInvalidationKeys, queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/store/auth';

export type ModerationTarget =
  | { kind: 'gym'; gymId: string }
  | { kind: 'machine'; machineId: string }
  | { kind: 'gym-photo'; gymId: string; photoId: string }
  | { kind: 'machine-photo'; machineId: string; photoId: string };

function statusPath(target: ModerationTarget): string {
  switch (target.kind) {
    case 'gym':
      return `/api/v1/gyms/${target.gymId}/status`;
    case 'machine':
      return `/api/v1/machines/${target.machineId}/status`;
    case 'gym-photo':
      return `/api/v1/gyms/${target.gymId}/photos/${target.photoId}/status`;
    case 'machine-photo':
      return `/api/v1/machines/${target.machineId}/photos/${target.photoId}/status`;
  }
}

export interface QueueDepth {
  pending: number;
  oldest_pending_age_hours: number;
}

export interface ModerationCounts {
  gyms: QueueDepth;
  machines: QueueDepth;
  gym_photos: QueueDepth;
  machine_photos: QueueDepth;
  /**
   * Reported content awaiting a decision, counted in targets rather than complaints.
   *
   * Unlike the four above this is not a submission queue: those are things waiting to be
   * published, this is something already published that someone objected to.
   */
  reports: QueueDepth;
}

/**
 * Pending counts, for the number beside the 審査中 chip.
 *
 * The client cannot derive this from the listings it already has: they are capped at 20
 * and 50 items with no total, so counting what came back would undercount exactly when the
 * queue is deep and the figure matters.
 *
 * Only requested for admins; the endpoint 403s otherwise.
 */
export function useModerationCounts() {
  const role = useAuthStore((s) => s.role);
  return useQuery<ModerationCounts>({
    queryKey: queryKeys.moderation.counts(),
    enabled: role === 'admin',
    queryFn: () => api.get('/api/v1/moderation/counts').then((r) => r.data),
  });
}

/**
 * Records an approve or reject decision.
 *
 * There is no optimistic update here on purpose. A decision moves a row between visibility
 * sets, so guessing at the outcome would mean rewriting several caches at once — and the
 * server can legitimately refuse, most often with a 409 when someone else already decided
 * the same row. Waiting for the answer and then refetching is both simpler and honest.
 */
export function useModerationDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      target,
      status,
    }: {
      target: ModerationTarget;
      status: 'active' | 'rejected';
    }) => {
      await api.patch(statusPath(target), { status });
    },
    onSuccess: () => {
      // A decision ripples further than the row: listings, the map, the detail page, the
      // favourites list and the pending counts all change. The set is enumerated once in
      // query-keys so the call sites cannot each remember a different subset.
      for (const key of moderationInvalidationKeys()) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        Alert.alert('すでに処理済みです', 'この項目は他の管理者がすでに承認または却下しています。');
        return;
      }
      if (status === 403) {
        Alert.alert('権限がありません', '管理者権限が必要です。アプリを再起動しても表示される場合は権限を確認してください。');
        return;
      }
      Alert.alert('処理に失敗しました', '通信状況を確認してもう一度お試しください。');
    },
  });
}
