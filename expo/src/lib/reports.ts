/**
 * Reporting: what can be reported, why, and when the form is ready to send.
 *
 * The rules live here rather than inside the sheet because a screen is only checkable by
 * eye. Getting the submit condition backwards ships either a dead button or a report with
 * no usable content in it, and neither shows up in `tsc`.
 *
 * The reason codes are duplicated from the server's allowlist on purpose. They are a
 * contract, not shared state: the server refuses anything outside its own list, so a value
 * that drifts here becomes a 422 rather than a bad row. The labels are the part that is
 * genuinely local — they are what a reporter reads, and changing them must not need a
 * migration.
 */

export type ReportTargetType = 'thread' | 'post' | 'gym' | 'machine';

export type ReportReason =
  | 'harassment'
  | 'personal_attack'
  | 'personal_info'
  | 'sexual'
  | 'false_info'
  | 'spam'
  | 'other';

export interface ReportReasonOption {
  value: ReportReason;
  label: string;
  /** One line under the label. Present where the label alone is ambiguous. */
  hint?: string;
}

/**
 * The reasons, in the order they are shown.
 *
 * personal_attack is not generic moderation vocabulary — it is this product's central rule.
 * The board is built on keeping talk about equipment separate from talk about the people in
 * the gym, so "this is about a person" has to be one tap rather than something a reporter
 * has to explain in free text. Putting it second, right after harassment, is deliberate:
 * it is the report this app expects to receive most.
 *
 * other is last and is the only one that demands an explanation, because a bare "other"
 * tells a moderator nothing they can act on.
 */
export const REPORT_REASONS: ReportReasonOption[] = [
  { value: 'harassment', label: '誹謗中傷・攻撃的な内容' },
  {
    value: 'personal_attack',
    label: 'スタッフや利用者個人への言及',
    hint: '設備ではなく人についての投稿',
  },
  { value: 'personal_info', label: '個人情報・写り込み' },
  { value: 'sexual', label: '性的・不快な内容' },
  { value: 'false_info', label: '虚偽の料金・設備情報' },
  { value: 'spam', label: '宣伝・スパム' },
  { value: 'other', label: 'その他', hint: '内容を入力してください' },
];

/** Matches the server's `maxLength` on the same field. */
export const DETAIL_MAX_LENGTH = 1000;

/** What the sheet calls the thing being reported. */
export function reportTargetLabel(target: ReportTargetType): string {
  switch (target) {
    case 'thread':
      return 'このスレッド';
    case 'post':
      return 'この投稿';
    case 'gym':
      return 'このジム情報';
    case 'machine':
      return 'このマシン情報';
  }
}

/**
 * Whether the reason needs the reporter to write something.
 *
 * Only "other" does. Demanding text for every reason would make reporting slow enough that
 * people stop doing it, which costs more than the occasional thin report.
 */
export function requiresDetail(reason: ReportReason | null): boolean {
  return reason === 'other';
}

/**
 * Whether 送信 should be enabled.
 *
 * Length is checked here as well as by `maxLength` on the input, because the two protect
 * against different things: the input stops typing, this stops a paste.
 */
export function canSubmitReport(reason: ReportReason | null, detail: string): boolean {
  if (reason === null) return false;
  if (detail.length > DETAIL_MAX_LENGTH) return false;
  if (requiresDetail(reason) && detail.trim() === '') return false;
  return true;
}

/**
 * Detail is trimmed before sending, and blank becomes absent.
 *
 * A string of spaces is not an explanation, and storing one makes "gave a reason" and "gave
 * whitespace" indistinguishable in the moderation queue.
 */
export function normalizeDetail(detail: string): string {
  return detail.trim();
}

/** The human wording for a code. Falls back to the code itself, which beats an empty cell. */
export function reasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/**
 * What actually goes in the detail column.
 *
 * Whatever the reporter wrote, or the label of the reason they picked when they wrote
 * nothing. Six of the seven reasons take no text, so without this those rows reach the
 * moderation queue with an empty detail and a bare code like `personal_attack` — readable
 * only to someone who knows the allowlist. Filling it in means every report says in words
 * what it is about.
 *
 * The label is used rather than the code because the labels are the wording the reporter
 * actually saw and chose, so the stored text matches what they think they said.
 *
 * Typed text always wins: it is more specific than the label by definition, and the reason
 * code is still on the row, so nothing is lost by not repeating the label alongside it.
 */
export function resolveDetail(reason: ReportReason, detail: string): string {
  const typed = normalizeDetail(detail);
  return typed !== '' ? typed : reasonLabel(reason);
}

export interface ReportErrorMessage {
  title: string;
  message: string;
}

/**
 * What to show when the submission fails.
 *
 * 429 is the one worth separating: it is the only failure the user can do something about,
 * and the generic "check your connection" would send them to look at their signal instead
 * of waiting.
 */
export function reportErrorMessage(status?: number): ReportErrorMessage {
  switch (status) {
    case 429:
      return {
        title: '通報の送信が続いています',
        message: '短時間に多くの通報が送信されました。しばらく時間をおいてからお試しください。',
      };
    case 404:
      return {
        title: '対象が見つかりません',
        message: 'すでに削除されている可能性があります。',
      };
    case 422:
      return {
        title: '送信できませんでした',
        message: '入力内容を確認してもう一度お試しください。',
      };
    default:
      return {
        title: '送信できませんでした',
        message: '通信状況を確認してもう一度お試しください。',
      };
  }
}
