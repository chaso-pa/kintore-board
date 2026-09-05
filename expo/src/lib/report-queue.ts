import { reasonLabel, type ReportReason, type ReportTargetType } from '@/lib/reports';
import type { ReportQueueStatus } from '@/lib/query-keys';

/**
 * Presentation rules for the moderation queue.
 *
 * Extracted from the screen for the same reason the moderation badges were: a queue that
 * mislabels what it is showing is worse than no queue. Sending a moderator to the wrong
 * thread, or telling them content is live when it is already hidden, produces a confident
 * decision about the wrong thing — and neither mistake is visible to `tsc`.
 */

export interface QueuedReport {
  reason: ReportReason;
  detail: string;
  created_at: string;
}

export interface ReportGroup {
  target_type: ReportTargetType;
  target_id: string;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  reports: QueuedReport[];
  target_preview: string;
  target_status?: string;
  target_exists: boolean;
  thread_id?: string;
}

export const QUEUE_TABS: { value: ReportQueueStatus; label: string }[] = [
  { value: 'pending', label: '未対応' },
  { value: 'reviewed', label: '対応済み' },
  { value: 'dismissed', label: '問題なし' },
];

/** What kind of thing was reported, for the card's heading. */
export function targetKindLabel(target: ReportTargetType): string {
  switch (target) {
    case 'thread':
      return 'スレッド';
    case 'post':
      return '投稿';
    case 'gym':
      return 'ジム';
    case 'machine':
      return 'マシン';
  }
}

/**
 * The distinct reasons on a group, in the order they were first reported.
 *
 * Deduplicated because five people picking 誹謗中傷 is one thing to know, not five. The
 * count is shown separately, so nothing is lost by collapsing them.
 */
export function distinctReasonLabels(reports: QueuedReport[]): string[] {
  const seen = new Set<ReportReason>();
  const out: string[] = [];
  for (const r of reports) {
    if (seen.has(r.reason)) continue;
    seen.add(r.reason);
    out.push(reasonLabel(r.reason));
  }
  return out;
}

/**
 * The free-text a moderator still needs to read after the reason labels.
 *
 * Every report now carries a detail, but for most it is just the reason label filled in as
 * a default — showing those again under the labels would be the same words twice, and the
 * one report where somebody actually typed something would be lost among them.
 */
export function writtenDetails(reports: QueuedReport[]): string[] {
  const labels = new Set(reports.map((r) => reasonLabel(r.reason)));
  const out: string[] = [];
  for (const r of reports) {
    const text = r.detail.trim();
    if (text === '' || labels.has(text)) continue;
    if (out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

/**
 * What to say about the reported content's own state.
 *
 * Returning null for ordinary live content keeps the badge meaningful: badging everything
 * makes the label disappear exactly where it matters. The deleted case is not an error —
 * it is what a report about removed content looks like — but it has to be stated, or the
 * blank preview reads as a broken screen.
 */
export function targetStateLabel(group: ReportGroup): string | null {
  if (!group.target_exists) return '削除済み';
  switch (group.target_status) {
    case 'deleted':
      return '投稿者が削除';
    case 'removed':
      return '運営が削除';
    case 'rejected':
      return '非表示';
    case 'pending':
      return '審査中';
    default:
      return null;
  }
}

/**
 * Whether the queue can offer to take this content down.
 *
 * Only posts and threads. Gyms and machines have their own approval lifecycle, and that
 * flow only moves rows out of `pending` — there is deliberately no way to un-publish an
 * approved gym, so offering the button here would be a control that always fails.
 *
 * Content already gone cannot be removed again, and the server would answer 409.
 */
export function canRemoveFromQueue(group: ReportGroup): boolean {
  if (!group.target_exists) return false;
  if (group.target_status === 'deleted' || group.target_status === 'removed') return false;
  return group.target_type === 'post' || group.target_type === 'thread';
}

/** How long the oldest complaint has been waiting, in whole hours. */
export function waitingHours(group: ReportGroup, now: number = Date.now()): number {
  const first = new Date(group.first_reported_at).getTime();
  if (Number.isNaN(first)) return 0;
  return Math.max(0, Math.floor((now - first) / 3_600_000));
}

/**
 * The wait, phrased for a person.
 *
 * Hours up to a day, then days. A queue measured only in hours stops being readable at the
 * point it starts mattering — "412時間待ち" is a number you have to do arithmetic on.
 */
export function waitingLabel(group: ReportGroup, now: number = Date.now()): string {
  const hours = waitingHours(group, now);
  if (hours < 1) return 'たった今';
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

/**
 * Where tapping a card should go, or null when there is nowhere to go.
 *
 * A reported post lives inside a thread, so the destination is the thread rather than the
 * post. Deleted content has no destination at all — navigating to it would land on an error
 * screen and look like the queue was broken.
 */
export function targetHref(group: ReportGroup): string | null {
  if (!group.target_exists) return null;
  switch (group.target_type) {
    case 'post':
    case 'thread':
      return group.thread_id ? `/board/${group.thread_id}` : null;
    case 'gym':
      return `/gym/${group.target_id}`;
    case 'machine':
      return `/machine/${group.target_id}`;
  }
}
