import {
  isLinkable,
  normalizeStatus,
  pendingBadgeCount,
  shouldShowModerationActions,
  shouldShowStatusFilter,
  statusBadgeLabel,
} from './moderation';

describe('normalizeStatus', () => {
  // The API omits status on active rows, so undefined is the common case rather than an
  // error case.
  it.each([undefined, null, '', 'active', 'something-new'])('treats %p as active', (input) => {
    expect(normalizeStatus(input)).toBe('active');
  });

  it('keeps the two statuses that change what is rendered', () => {
    expect(normalizeStatus('pending')).toBe('pending');
    expect(normalizeStatus('rejected')).toBe('rejected');
  });
});

describe('shouldShowModerationActions', () => {
  it('shows the controls to an admin on a pending row', () => {
    expect(shouldShowModerationActions('admin', 'pending')).toBe(true);
  });

  it('hides them from an ordinary user even on a pending row', () => {
    // The submitter can see their own pending row; that is not the same as deciding it.
    expect(shouldShowModerationActions('user', 'pending')).toBe(false);
  });

  it.each(['active', 'rejected', undefined])(
    'hides them on a %p row even for an admin',
    (status) => {
      // The server pins the transition to pending -> decided, so a button here could only
      // ever produce a 409.
      expect(shouldShowModerationActions('admin', status)).toBe(false);
    }
  );
});

describe('statusBadgeLabel', () => {
  it('labels the two states worth calling out', () => {
    expect(statusBadgeLabel('pending')).toBe('審査中');
    expect(statusBadgeLabel('rejected')).toBe('却下済み');
  });

  it.each(['active', undefined, null])('returns null for %p', (status) => {
    // Badging every row would make the badge mean nothing.
    expect(statusBadgeLabel(status)).toBeNull();
  });
});

describe('shouldShowStatusFilter', () => {
  it('is admin-only', () => {
    expect(shouldShowStatusFilter('admin')).toBe(true);
    expect(shouldShowStatusFilter('user')).toBe(false);
  });
});

describe('pendingBadgeCount', () => {
  it('returns the count when there is a queue', () => {
    expect(pendingBadgeCount(7)).toBe(7);
  });

  it.each([0, undefined, null, -1])('returns null for %p so no dot is drawn', (n) => {
    expect(pendingBadgeCount(n)).toBeNull();
  });
});

describe('isLinkable', () => {
  it('allows an approved machine', () => {
    expect(isLinkable('active')).toBe(true);
  });

  it('refuses a machine still awaiting review', () => {
    // Its submitter can see it in the catalogue the link screen is built from, which is
    // what makes this reachable rather than theoretical.
    expect(isLinkable('pending')).toBe(false);
  });

  it('refuses a rejected machine', () => {
    expect(isLinkable('rejected')).toBe(false);
  });
});
