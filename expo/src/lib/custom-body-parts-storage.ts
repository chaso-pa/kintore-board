import { File, Paths } from 'expo-file-system';

import { parseCustomBodyParts } from '@/lib/custom-body-parts';

const FILE_NAME = 'custom-body-parts.json';

function bodyPartFile() {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Custom body parts stored on this device.
 *
 * A separate file from the exercises rather than a new field inside it: the exercise file
 * is already written by shipped builds as a bare array, and changing its shape would mean
 * every existing user's exercises failing to parse on first launch after the update.
 *
 * Kept alongside it in the document directory for the same reason — removed with the app,
 * unlike the Keychain.
 */
export async function loadCustomBodyParts(): Promise<string[]> {
  try {
    const file = bodyPartFile();
    if (!file.exists) return [];
    return parseCustomBodyParts(await file.text());
  } catch {
    return [];
  }
}

/** Rewrites the whole file. The list is a handful of short strings. */
export async function saveCustomBodyParts(list: string[]): Promise<void> {
  const file = bodyPartFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(list));
}
