import type { Role } from '@/store/auth';
import type { ModerationStatusFilter } from '@/lib/query-keys';

/**
 * Moderation rendering rules, kept as plain functions.
 *
 * These decide who sees an approve button and what a badge says. Screens read as JSX and
 * are only checkable by eye; the same rules extracted here can be asserted, which matters
 * because getting one backwards shows a stranger a control that will 403, or hides one an
 * admin needs.
 *
 * None of this is a permission. The server checks the role on every moderation call, so a
 * client that renders the buttons anyway achieves nothing.
 */

export type ModerationStatus = 'active' | 'pending' | 'rejected';

/** A status the server may attach to a row. Absent means active — the API omits it. */
export function normalizeStatus(status?: string | null): ModerationStatus {
  if (status === 'pending' || status === 'rejected') return status;
  return 'active';
}

/**
 * Whether the approve/reject pair belongs on this row.
 *
 * Only pending rows, and only for an admin. A decided row is not re-decidable: the server
 * pins the source state to pending, so buttons on an active row would always fail.
 */
export function shouldShowModerationActions(role: Role, status?: string | null): boolean {
  return role === 'admin' && normalizeStatus(status) === 'pending';
}

/**
 * The badge text, or null when the row needs no badge.
 *
 * Active rows are the normal case and get nothing — badging everything would make the
 * label meaningless exactly where it matters.
 */
export function statusBadgeLabel(status?: string | null): string | null {
  switch (normalizeStatus(status)) {
    case 'pending':
      return '審査中';
    case 'rejected':
      return '却下済み';
    default:
      return null;
  }
}

/**
 * Whether the admin-only filter chips belong on a listing.
 *
 * A signed-out or ordinary user has nothing to filter: their listing already contains only
 * what they may see.
 */
export function shouldShowStatusFilter(role: Role): boolean {
  return role === 'admin';
}

/**
 * The badge count next to the 審査中 chip.
 *
 * Returns null rather than 0 so an empty queue renders no dot at all, instead of a "0"
 * that reads as a broken counter.
 */
export function pendingBadgeCount(pending?: number | null): number | null {
  if (!pending || pending <= 0) return null;
  return pending;
}

/**
 * Machines that may be attached to a gym.
 *
 * The submitter of a machine can see their own pending row in the global catalogue, and
 * the link screen is built from that catalogue — so without this filter they could attach
 * an unreviewed machine to any gym. The server refuses it, but the optimistic update would
 * still show it as linked until the request came back.
 */
export function isLinkable(status?: string | null): boolean {
  return normalizeStatus(status) === 'active';
}

/** The chip options for a listing, in display order. */
export const STATUS_FILTERS: { value: ModerationStatusFilter; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'pending', label: '審査中' },
];
