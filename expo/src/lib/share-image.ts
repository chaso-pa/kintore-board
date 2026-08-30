export type ShareImageResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'capture-failed' | 'share-failed' };

interface Deps {
  /** Renders the view to a file and returns its uri. */
  capture: () => Promise<string>;
  isAvailable: () => Promise<boolean>;
  share: (uri: string) => Promise<void>;
}

/**
 * Capture, then hand the image to the OS share sheet.
 *
 * Split from the component so the order and the failure paths can be tested: on a device
 * this is three async calls that all look the same when they go wrong, and the only symptom
 * of getting it wrong is a button that does nothing.
 *
 * Availability is checked first. Sharing is missing on web and can be absent on a managed
 * device, and calling into it there throws — which would read as "the button is broken"
 * rather than "this device cannot share".
 */
export async function shareViewAsImage({
  capture,
  isAvailable,
  share,
}: Deps): Promise<ShareImageResult> {
  // Wrapped like the rest: this function must resolve whatever happens, or a caller that
  // sets a spinner before calling it has no way back.
  try {
    if (!(await isAvailable())) return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  let uri: string;
  try {
    uri = await capture();
  } catch {
    return { ok: false, reason: 'capture-failed' };
  }

  try {
    await share(uri);
  } catch {
    // Dismissing the sheet is not an error on either platform, so anything that lands here
    // is a real failure rather than the user changing their mind.
    return { ok: false, reason: 'share-failed' };
  }
  return { ok: true };
}

/** What to tell the user when it did not work. */
export function shareErrorMessage(reason: Exclude<ShareImageResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'unavailable':
      return 'この端末では共有できません';
    case 'capture-failed':
      return '画像を作成できませんでした';
    case 'share-failed':
      return '共有できませんでした';
  }
}
