import type { Role } from '@/store/auth';

/**
 * Who may delete what, and what the app says about it afterwards.
 *
 * The server decides for real — it re-checks authorship on every call — so none of this is
 * a permission. It decides what to *offer*, and getting it wrong is still bad in both
 * directions: a control that always 403s teaches people the app is broken, and a missing
 * one leaves someone unable to take down their own post, which is the thing App Store
 * guideline 1.2 and every "delete my content" request depend on.
 */

/** Which kind of removal the server recorded. */
export type DeletionStatus = 'deleted' | 'removed';

export type DeletableKind = 'post' | 'thread';

/**
 * Whether to show a delete control.
 *
 * An admin sees one on everything, because a moderator reading a reported thread needs to
 * act where they are rather than going back to the queue and looking the post up again.
 */
export function canDelete(role: Role, isMine: boolean | undefined): boolean {
  return role === 'admin' || isMine === true;
}

/**
 * Whether this particular deletion is a moderation action rather than an author's own.
 *
 * Drives the wording of the confirmation, which has to differ: removing someone else's post
 * is a decision that gets logged and attributed, and an admin should be told that before
 * they tap it, not after.
 */
export function isModeratorAction(role: Role, isMine: boolean | undefined): boolean {
  return role === 'admin' && isMine !== true;
}

export interface DeletionPrompt {
  title: string;
  message: string;
  confirmLabel: string;
}

const KIND_LABEL: Record<DeletableKind, string> = {
  post: '投稿',
  thread: 'スレッド',
};

/**
 * The confirmation text.
 *
 * Deleting is not reversible from anywhere in the app, so the prompt says so. The thread
 * case says more because it takes its replies out of reach too — someone deleting a busy
 * thread is removing other people's writing, and that should not be a surprise.
 */
export function deletionPrompt(
  kind: DeletableKind,
  role: Role,
  isMine: boolean | undefined
): DeletionPrompt {
  const noun = KIND_LABEL[kind];
  if (isModeratorAction(role, isMine)) {
    return {
      title: `${noun}を削除しますか`,
      message: `運営による削除として記録されます。この操作は取り消せません。`,
      confirmLabel: '削除する',
    };
  }
  return {
    title: `${noun}を削除しますか`,
    message:
      kind === 'thread'
        ? 'このスレッドと、ぶら下がっている返信が見られなくなります。この操作は取り消せません。'
        : 'この操作は取り消せません。',
    confirmLabel: '削除する',
  };
}

/** What to show once it is done. */
export function deletionDoneMessage(status: DeletionStatus): string {
  return status === 'removed' ? '運営による削除として記録しました。' : '削除しました。';
}

/**
 * What to show when it fails.
 *
 * 409 is separated because it is not really a failure: someone else — or the same person on
 * a stale screen — already removed it, and the right response is to refresh rather than to
 * retry.
 */
export function deletionErrorMessage(status?: number): { title: string; message: string } {
  switch (status) {
    case 409:
      return { title: 'すでに削除されています', message: '画面を更新してください。' };
    case 403:
      return { title: '削除できません', message: '自分の投稿のみ削除できます。' };
    case 404:
      return { title: '見つかりません', message: 'すでに削除された可能性があります。' };
    default:
      return { title: '削除に失敗しました', message: '通信状況を確認してもう一度お試しください。' };
  }
}
