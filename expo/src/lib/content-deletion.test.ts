import {
  canDelete,
  deletionDoneMessage,
  deletionErrorMessage,
  deletionPrompt,
  isModeratorAction,
} from '@/lib/content-deletion';

describe('canDelete', () => {
  it('lets an author delete their own', () => {
    expect(canDelete('user', true)).toBe(true);
  });

  it('refuses someone else’s', () => {
    // The server refuses it too, but a control that always 403s teaches people the app is
    // broken rather than that the action was not theirs to take.
    expect(canDelete('user', false)).toBe(false);
  });

  it('treats a missing is_mine as not mine', () => {
    // Older responses, or a screen that forgot to thread the field through, must fail
    // closed — a delete button on every post would be the loudest possible bug.
    expect(canDelete('user', undefined)).toBe(false);
  });

  it('lets an admin delete anything', () => {
    // A moderator reading a reported thread has to be able to act where they are.
    expect(canDelete('admin', false)).toBe(true);
    expect(canDelete('admin', undefined)).toBe(true);
  });
});

describe('isModeratorAction', () => {
  it('is true only when an admin deletes something that is not theirs', () => {
    expect(isModeratorAction('admin', false)).toBe(true);
    expect(isModeratorAction('admin', undefined)).toBe(true);
  });

  it('is false for an admin deleting their own post', () => {
    // They are the author here. Calling it moderation would inflate the only record of how
    // much moderation is happening, and mislabel the confirmation they see.
    expect(isModeratorAction('admin', true)).toBe(false);
  });

  it('is false for an ordinary user', () => {
    expect(isModeratorAction('user', true)).toBe(false);
    expect(isModeratorAction('user', false)).toBe(false);
  });
});

describe('deletionPrompt', () => {
  it('warns an admin that the removal is attributed to them', () => {
    const p = deletionPrompt('post', 'admin', false);
    expect(p.message).toContain('運営');
  });

  it('does not say that to an author deleting their own', () => {
    expect(deletionPrompt('post', 'user', true).message).not.toContain('運営');
    // Including an admin deleting their own post.
    expect(deletionPrompt('post', 'admin', true).message).not.toContain('運営');
  });

  it('warns that a thread takes its replies with it', () => {
    // Deleting a busy thread removes other people's writing from view, which should not be
    // a surprise discovered afterwards.
    expect(deletionPrompt('thread', 'user', true).message).toContain('返信');
    expect(deletionPrompt('post', 'user', true).message).not.toContain('返信');
  });

  it('always says it cannot be undone', () => {
    // Nothing in the app restores a deleted post, so every path has to say so.
    for (const kind of ['post', 'thread'] as const) {
      for (const [role, mine] of [
        ['user', true],
        ['admin', false],
        ['admin', true],
      ] as const) {
        expect(deletionPrompt(kind, role, mine).message).toContain('取り消せません');
      }
    }
  });

  it('names the right kind of content', () => {
    expect(deletionPrompt('thread', 'user', true).title).toContain('スレッド');
    expect(deletionPrompt('post', 'user', true).title).toContain('投稿');
  });
});

describe('deletionDoneMessage', () => {
  it('distinguishes an author deletion from a moderator removal', () => {
    expect(deletionDoneMessage('removed')).toContain('運営');
    expect(deletionDoneMessage('deleted')).not.toContain('運営');
  });
});

describe('deletionErrorMessage', () => {
  it('tells a stale screen to refresh rather than to retry', () => {
    expect(deletionErrorMessage(409).message).toContain('更新');
  });

  it('explains a 403 as ownership rather than as a network problem', () => {
    expect(deletionErrorMessage(403).message).toContain('自分の投稿');
  });

  it('falls back for an unknown status', () => {
    expect(deletionErrorMessage(undefined)).toEqual(deletionErrorMessage(500));
  });

  it('always returns a non-empty title and message', () => {
    for (const s of [undefined, 400, 403, 404, 409, 500]) {
      const m = deletionErrorMessage(s);
      expect(m.title.trim()).not.toBe('');
      expect(m.message.trim()).not.toBe('');
    }
  });
});
