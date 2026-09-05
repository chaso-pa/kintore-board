import {
  distinctReasonLabels,
  QUEUE_TABS,
  targetHref,
  targetKindLabel,
  targetStateLabel,
  waitingHours,
  waitingLabel,
  writtenDetails,
  type QueuedReport,
  type ReportGroup,
} from '@/lib/report-queue';
import { reasonLabel } from '@/lib/reports';

function report(over: Partial<QueuedReport> = {}): QueuedReport {
  return {
    reason: 'harassment',
    detail: reasonLabel('harassment'),
    created_at: '2026-09-05T00:00:00Z',
    ...over,
  };
}

function group(over: Partial<ReportGroup> = {}): ReportGroup {
  return {
    target_type: 'post',
    target_id: 'post-1',
    report_count: 1,
    first_reported_at: '2026-09-05T00:00:00Z',
    last_reported_at: '2026-09-05T00:00:00Z',
    reports: [report()],
    target_preview: '本文',
    target_status: 'active',
    target_exists: true,
    thread_id: 'thread-1',
    ...over,
  };
}

describe('distinctReasonLabels', () => {
  it('collapses repeats, since five people picking one reason is one thing to know', () => {
    const labels = distinctReasonLabels([report(), report(), report({ reason: 'spam' })]);
    expect(labels).toEqual([reasonLabel('harassment'), reasonLabel('spam')]);
  });

  it('keeps the order they were first reported in', () => {
    const labels = distinctReasonLabels([report({ reason: 'spam' }), report()]);
    expect(labels[0]).toBe(reasonLabel('spam'));
  });
});

describe('writtenDetails', () => {
  it('hides details that are only the reason label repeated', () => {
    // Every report carries a detail now, and for most it is the label filled in as a
    // default. Showing those under the labels would print the same words twice.
    expect(writtenDetails([report()])).toEqual([]);
  });

  it('keeps text somebody actually typed', () => {
    const typed = report({ reason: 'other', detail: '常連の外見について書かれている' });
    expect(writtenDetails([report(), typed])).toEqual(['常連の外見について書かれている']);
  });

  it('does not repeat identical text from two reporters', () => {
    const a = report({ reason: 'other', detail: '同じ指摘' });
    const b = report({ reason: 'other', detail: '同じ指摘' });
    expect(writtenDetails([a, b])).toEqual(['同じ指摘']);
  });

  it('ignores whitespace-only detail', () => {
    expect(writtenDetails([report({ detail: '   ' })])).toEqual([]);
  });
});

describe('targetStateLabel', () => {
  it('says nothing about ordinary live content', () => {
    // Badging everything makes the badge meaningless exactly where it matters.
    expect(targetStateLabel(group())).toBeNull();
  });

  it('flags content that is already hidden', () => {
    expect(targetStateLabel(group({ target_status: 'rejected' }))).toBe('非表示');
    expect(targetStateLabel(group({ target_status: 'pending' }))).toBe('審査中');
  });

  it('flags deleted content ahead of its status', () => {
    // A report about content that is gone is the ordinary case, but an unexplained blank
    // preview reads as a rendering fault.
    expect(targetStateLabel(group({ target_exists: false, target_status: 'active' }))).toBe(
      '削除済み'
    );
  });
});

describe('waitingHours / waitingLabel', () => {
  const now = new Date('2026-09-05T12:00:00Z').getTime();

  it('counts whole hours since the first complaint', () => {
    expect(waitingHours(group({ first_reported_at: '2026-09-05T09:30:00Z' }), now)).toBe(2);
  });

  it('never goes negative on a clock skew', () => {
    // The server's timestamp can be slightly ahead of the device. "-1時間前" would look
    // like a bug in the one place a moderator is judging urgency.
    expect(waitingHours(group({ first_reported_at: '2026-09-05T13:00:00Z' }), now)).toBe(0);
  });

  it('switches to days so a long wait stays readable', () => {
    expect(waitingLabel(group({ first_reported_at: '2026-09-05T11:10:00Z' }), now)).toBe('たった今');
    expect(waitingLabel(group({ first_reported_at: '2026-09-05T09:00:00Z' }), now)).toBe('3時間前');
    expect(waitingLabel(group({ first_reported_at: '2026-08-20T12:00:00Z' }), now)).toBe('16日前');
  });

  it('does not crash on an unparseable timestamp', () => {
    expect(waitingHours(group({ first_reported_at: 'nonsense' }), now)).toBe(0);
  });
});

describe('targetHref', () => {
  it('sends a reported post to the thread it lives in', () => {
    // The post has no page of its own, so the thread is the only place to read it in
    // context — which is what a moderator needs to judge it.
    expect(targetHref(group())).toBe('/board/thread-1');
  });

  it('sends gyms and machines to their own pages', () => {
    expect(targetHref(group({ target_type: 'gym', target_id: 'g1' }))).toBe('/gym/g1');
    expect(targetHref(group({ target_type: 'machine', target_id: 'm1' }))).toBe('/machine/m1');
  });

  it('refuses to navigate to deleted content', () => {
    // Landing on an error screen would look like the queue itself was broken.
    expect(targetHref(group({ target_exists: false }))).toBeNull();
  });

  it('refuses when a post has no thread id', () => {
    expect(targetHref(group({ thread_id: undefined }))).toBeNull();
  });
});

describe('targetKindLabel', () => {
  it('names every target type', () => {
    for (const t of ['thread', 'post', 'gym', 'machine'] as const) {
      expect(targetKindLabel(t).trim()).not.toBe('');
    }
  });
});

describe('QUEUE_TABS', () => {
  it('opens on the untriaged queue', () => {
    // Any other default shows a moderator an empty list of decided items, which reads as
    // "there is nothing to do".
    expect(QUEUE_TABS[0].value).toBe('pending');
  });

  it('covers all three report states exactly once', () => {
    expect(QUEUE_TABS.map((t) => t.value).sort()).toEqual(['dismissed', 'pending', 'reviewed']);
  });
});
