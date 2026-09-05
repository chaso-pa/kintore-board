import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { api } from '@/lib/api';
import { queryKeys, type ReportQueueStatus } from '@/lib/query-keys';
import type { ReportGroup } from '@/lib/report-queue';
import type { ReportTargetType } from '@/lib/reports';
import { useAuthStore } from '@/store/auth';

/**
 * The moderation queue.
 *
 * Only requested for admins; the endpoint 403s otherwise. The query is not enabled for
 * everyone-and-ignored, because a failed request per screen visit would fill the logs with
 * a permission error that is the expected outcome.
 */
export function useReportQueue(status: ReportQueueStatus) {
  const role = useAuthStore((s) => s.role);
  return useQuery<ReportGroup[]>({
    queryKey: queryKeys.moderation.reports(status),
    enabled: role === 'admin',
    queryFn: () =>
      api
        .get<{ items: ReportGroup[] }>('/api/v1/reports', { params: { status } })
        .then((r) => r.data.items ?? []),
  });
}

export interface ResolveInput {
  targetType: ReportTargetType;
  targetId: string;
  status: 'reviewed' | 'dismissed';
}

/**
 * Records a decision about one reported target.
 *
 * No optimistic update. A decision moves a group between three lists and changes the badge
 * count, so guessing at the outcome means rewriting several caches — and the server can
 * legitimately refuse with a 409 when another moderator got there first. Waiting for the
 * answer and refetching is simpler and honest.
 */
export function useResolveReports() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetType, targetId, status }: ResolveInput) => {
      const res = await api.post('/api/v1/reports/resolve', {
        target_type: targetType,
        target_id: targetId,
        status,
      });
      return res.data as { resolved: number };
    },
    onSuccess: () => {
      // Every tab changes, not just the one being looked at: the group leaves 未対応 and
      // arrives in one of the other two. The root covers all three plus the counts.
      queryClient.invalidateQueries({ queryKey: queryKeys.moderation.root });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        Alert.alert('すでに処理済みです', '他の管理者がこの通報をすでに処理しています。');
        return;
      }
      if (status === 403) {
        Alert.alert('権限がありません', '管理者権限が必要です。');
        return;
      }
      Alert.alert('処理に失敗しました', '通信状況を確認してもう一度お試しください。');
    },
  });
}
