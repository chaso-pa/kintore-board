import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { resolveDetail, type ReportReason, type ReportTargetType } from '@/lib/reports';

export interface ReportSubmission {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detail: string;
}

/**
 * Submits a report.
 *
 * Nothing is invalidated afterwards. A report changes no cache the reporter can see: the
 * post stays where it was, and there is no screen listing what they have reported. That is
 * the design, not an omission — showing someone their own report history invites them to
 * check whether it "worked", and the honest answer is that a human has to look first.
 *
 * The server treats a repeat report of the same target as the same report and returns the
 * original, so a double tap is a success rather than an error.
 */
export function useReport() {
  return useMutation({
    mutationFn: async ({ targetType, targetId, reason, detail }: ReportSubmission) => {
      // detail is always sent: what the reporter wrote, or the label of the reason they
      // picked. A report that reaches the queue with an empty detail and a bare code is
      // readable only to someone who has the allowlist to hand.
      const res = await api.post('/api/v1/reports', {
        target_type: targetType,
        target_id: targetId,
        reason,
        detail: resolveDetail(reason, detail),
      });
      return res.data;
    },
  });
}

/** Pulls the HTTP status off an axios error without dragging axios types into the screens. */
export function reportErrorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}
