import { TERMS_SECTIONS, TERMS_VERSION } from './terms';

/**
 * The terms are prose, and prose is not usually worth testing. These three are, because each
 * one is a specific thing App Store review checks for, and each would fail silently: the app
 * would build, run, show a consent screen, and be rejected again for the same guideline.
 *
 * Guideline 1.2 asks that the terms make clear there is "no tolerance for objectionable
 * content or abusive users". That is a claim about the wording, so the wording is what is
 * pinned.
 */
describe('terms content', () => {
  const allText = TERMS_SECTIONS.map((s) => `${s.heading}\n${s.body}`).join('\n');

  it('states that objectionable content and abusive users are not tolerated', () => {
    expect(allText).toContain('一切の寛容');
  });

  // Both mechanisms have to be described, because both are things a reviewer is told to look
  // for in the app and then expects the terms to back up.
  it('describes both reporting and blocking', () => {
    expect(allText).toContain('通報');
    expect(allText).toContain('ブロック');
  });

  it('names a contact address', () => {
    expect(allText).toMatch(/[\w.]+@[\w.]+/);
  });

  // The version gates re-presentation. A non-integer or a zero would make the comparison in
  // _layout.tsx behave in ways nobody intended — zero in particular is falsy, and would
  // invite an `if (!accepted)` refactor that silently stops re-prompting.
  it('has a positive integer version', () => {
    expect(Number.isInteger(TERMS_VERSION)).toBe(true);
    expect(TERMS_VERSION).toBeGreaterThan(0);
  });
});
