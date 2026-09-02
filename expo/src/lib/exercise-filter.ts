/**
 * Query parameters that pick out one entry in the picker.
 *
 * An entry is a name *and* a body part, and the empty part is a real entry: sets recorded
 * before the field existed that nobody has classified yet. It cannot be sent as an empty
 * `body_part`, because the server reads that as "every part" — the reading a client built
 * before this field would have meant. So it goes as its own flag.
 */
export function exerciseFilterParams(bodyPart: string): Record<string, string | boolean> {
  return bodyPart === '' ? { unclassified: true } : { body_part: bodyPart };
}

/** What to call an entry with no body part, wherever one is shown. */
export const UNCLASSIFIED_LABEL = '未設定';
