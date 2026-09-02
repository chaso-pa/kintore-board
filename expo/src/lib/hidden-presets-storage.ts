import { File, Paths } from 'expo-file-system';

import { parseHiddenPresets } from '@/lib/hidden-presets';

const FILE_NAME = 'hidden-presets.json';

function hiddenFile() {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Which shipped exercises this device has removed from the picker.
 *
 * Its own file, alongside the custom exercises and parts, for the same reason they are
 * separate from each other: a shape change to one must not stop the others from parsing on
 * the first launch after an update.
 */
export async function loadHiddenPresets(): Promise<string[]> {
  try {
    const file = hiddenFile();
    if (!file.exists) return [];
    return parseHiddenPresets(await file.text());
  } catch {
    return [];
  }
}

export async function saveHiddenPresets(list: string[]): Promise<void> {
  const file = hiddenFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(list));
}
