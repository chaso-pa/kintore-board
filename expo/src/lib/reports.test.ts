import {
  canSubmitReport,
  DETAIL_MAX_LENGTH,
  normalizeDetail,
  REPORT_REASONS,
  reasonLabel,
  reportErrorMessage,
  reportTargetLabel,
  requiresDetail,
  resolveDetail,
  type ReportReason,
  type ReportTargetType,
} from '@/lib/reports';

describe('canSubmitReport', () => {
  it('refuses until a reason is chosen', () => {
    // The sheet opens with nothing selected, so this is the state the button starts in.
    expect(canSubmitReport(null, '')).toBe(false);
    expect(canSubmitReport(null, 'なにか書いた')).toBe(false);
  });

  it('allows a reason on its own', () => {
    // Six of the seven reasons say enough by themselves. Demanding text for all of them
    // would make reporting slow enough that people stop doing it.
    expect(canSubmitReport('harassment', '')).toBe(true);
  });

  it('requires text for その他 and nothing else', () => {
    expect(canSubmitReport('other', '')).toBe(false);
    expect(canSubmitReport('other', '常連の悪口が書かれている')).toBe(true);
  });

  it('does not accept whitespace as an explanation', () => {
    // Otherwise the required field is satisfiable with the space bar, and the moderation
    // queue fills with reports that say nothing.
    expect(canSubmitReport('other', '   \n ')).toBe(false);
  });

  it('refuses a detail longer than the server accepts', () => {
    // maxLength on the input stops typing; this stops a paste. Without it the request
    // reaches the server and comes back 422, which reads as a bug rather than a limit.
    const tooLong = 'あ'.repeat(DETAIL_MAX_LENGTH + 1);
    expect(canSubmitReport('spam', tooLong)).toBe(false);
    expect(canSubmitReport('spam', 'あ'.repeat(DETAIL_MAX_LENGTH))).toBe(true);
  });
});

describe('requiresDetail', () => {
  it('is true only for その他', () => {
    const needing = REPORT_REASONS.filter((r) => requiresDetail(r.value)).map((r) => r.value);
    expect(needing).toEqual(['other']);
  });

  it('is false when nothing is selected yet', () => {
    expect(requiresDetail(null)).toBe(false);
  });
});

describe('REPORT_REASONS', () => {
  // The codes are a contract with the server's allowlist. A drifted value is a 422 the
  // user cannot do anything about, and the sheet would look like it was broken.
  it('matches the server allowlist exactly', () => {
    const serverAllowlist: ReportReason[] = [
      'harassment',
      'personal_attack',
      'personal_info',
      'sexual',
      'false_info',
      'spam',
      'other',
    ];
    expect(REPORT_REASONS.map((r) => r.value).sort()).toEqual([...serverAllowlist].sort());
  });

  it('has no duplicate codes', () => {
    const values = REPORT_REASONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('gives every reason a label', () => {
    // An unlabelled row renders as an empty tappable line — selectable, and impossible to
    // tell apart from its neighbours.
    for (const r of REPORT_REASONS) {
      expect(r.label.trim()).not.toBe('');
    }
  });

  it('keeps その他 last', () => {
    // It is the catch-all. Above the specific reasons it would absorb reports that belong
    // to a code a moderator can act on directly.
    expect(REPORT_REASONS[REPORT_REASONS.length - 1].value).toBe('other');
  });
});

describe('normalizeDetail', () => {
  it('trims, so blank becomes absent', () => {
    expect(normalizeDetail('  \n ')).toBe('');
    expect(normalizeDetail('  内容  ')).toBe('内容');
  });
});

describe('reasonLabel', () => {
  it('returns the wording the reporter saw', () => {
    expect(reasonLabel('personal_attack')).toBe('スタッフや利用者個人への言及');
  });
});

describe('resolveDetail', () => {
  it('falls back to the reason label when nothing was typed', () => {
    // The point of the whole function: six of the seven reasons take no text, and without
    // this those rows reach the moderation queue with a bare code and an empty detail.
    expect(resolveDetail('personal_attack', '')).toBe('スタッフや利用者個人への言及');
    expect(resolveDetail('false_info', '')).toBe('虚偽の料金・設備情報');
  });

  it('never leaves the detail empty, whichever reason was picked', () => {
    for (const { value } of REPORT_REASONS) {
      // その他 is the one that cannot reach here blank — the form requires text for it —
      // but the fallback still has to produce something rather than an empty string.
      expect(resolveDetail(value, '').trim()).not.toBe('');
    }
  });

  it('prefers what the reporter actually wrote', () => {
    // The label is a default, not a prefix. The reason code is still on the row, so
    // repeating the label alongside the text would only pad the queue.
    expect(resolveDetail('harassment', '3レス目がひどい')).toBe('3レス目がひどい');
  });

  it('trims before deciding, so whitespace is not mistaken for an explanation', () => {
    expect(resolveDetail('spam', '   ')).toBe('宣伝・スパム');
    expect(resolveDetail('spam', '  URLが貼られている  ')).toBe('URLが貼られている');
  });

  it('sends the typed text for その他 rather than the useless label', () => {
    // 'その他' as a detail says nothing, which is exactly why the form demands text for it.
    expect(resolveDetail('other', '常連の悪口')).toBe('常連の悪口');
  });
});

describe('reportTargetLabel', () => {
  it('names every target type', () => {
    const targets: ReportTargetType[] = ['thread', 'post', 'gym', 'machine'];
    for (const t of targets) {
      expect(reportTargetLabel(t).trim()).not.toBe('');
    }
  });

  it('distinguishes a thread from a post', () => {
    // The sheet is opened from both on the same screen, and the only thing telling the
    // reporter which one they are reporting is this string.
    expect(reportTargetLabel('thread')).not.toBe(reportTargetLabel('post'));
  });
});

describe('reportErrorMessage', () => {
  it('tells a rate-limited user to wait rather than to check their connection', () => {
    const rateLimited = reportErrorMessage(429);
    const generic = reportErrorMessage(500);
    expect(rateLimited.title).not.toBe(generic.title);
    expect(rateLimited.message).toContain('時間');
    expect(rateLimited.message).not.toContain('通信');
  });

  it('falls back to the generic message for an unknown status', () => {
    expect(reportErrorMessage(undefined)).toEqual(reportErrorMessage(500));
  });

  it('always returns a non-empty title and message', () => {
    for (const status of [undefined, 400, 404, 422, 429, 500]) {
      const m = reportErrorMessage(status);
      expect(m.title.trim()).not.toBe('');
      expect(m.message.trim()).not.toBe('');
    }
  });
});
