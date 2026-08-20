import { File, Paths } from 'expo-file-system';

import { parseCustomExercises, type CustomExercise } from '@/lib/custom-exercises';

const FILE_NAME = 'custom-exercises.json';

function exerciseFile() {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Custom exercises stored on this device.
 *
 * Kept in the document directory rather than SecureStore: the Keychain outlives an app
 * uninstall on iOS, which would resurrect a deleted user's exercise list. A plain file in
 * the app's own storage is removed with the app, which is what people expect.
 *
 * Any read failure resolves to an empty list — a missing file is the normal first-run state,
 * and a corrupt one should not block the exercise picker from opening.
 */
export async function loadCustomExercises(): Promise<CustomExercise[]> {
  try {
    const file = exerciseFile();
    if (!file.exists) return [];
    return parseCustomExercises(await file.text());
  } catch {
    return [];
  }
}

/** Rewrites the whole file. The list is small enough that diffing would only add risk. */
export async function saveCustomExercises(list: CustomExercise[]): Promise<void> {
  const file = exerciseFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(list));
}
