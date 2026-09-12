import { File, Paths } from 'expo-file-system';

const FILE_NAME = 'terms-accepted.json';

function termsFile() {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Which version of the terms this device has agreed to, or null for none.
 *
 * In the document directory rather than SecureStore, for the same reason the exercise list
 * is: the iOS Keychain survives an uninstall, so an acceptance stored there would let a
 * fresh install skip the gate on the strength of an agreement made by whoever used the
 * device before. A plain file goes away with the app, and the reinstall asks again — which
 * is the side to err on when the question is whether someone agreed to something.
 *
 * Any read failure is treated as "not accepted". A corrupt file must fail towards showing
 * the terms; failing the other way would let a parse bug quietly skip the consent screen,
 * and that is the exact thing this app was rejected for not having.
 */
export async function loadAcceptedTermsVersion(): Promise<number | null> {
  try {
    const file = termsFile();
    if (!file.exists) return null;
    const parsed: unknown = JSON.parse(await file.text());
    if (typeof parsed !== 'object' || parsed === null) return null;
    const version = (parsed as { version?: unknown }).version;
    return typeof version === 'number' ? version : null;
  } catch {
    return null;
  }
}

/** Records agreement. `acceptedAt` is not read by anything yet; it is here for support mail. */
export async function saveAcceptedTermsVersion(version: number): Promise<void> {
  const file = termsFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify({ version, acceptedAt: new Date().toISOString() }));
}
