import { PRESET_EXERCISES } from '@/constants/exercises';
import { exerciseKey, type CustomExercise } from '@/lib/custom-exercises';

/**
 * Presets the user has removed from the picker.
 *
 * Stored as keys rather than as copies of the entries. The shipped list changes between
 * releases — names get corrected, parts get reassigned — and a stored copy would slowly
 * drift out of step with the preset it was meant to be hiding. A key still matches, or
 * stops matching because the preset genuinely changed, which is the right outcome either
 * way.
 *
 * Hiding is not deleting: nothing is destroyed, and the entry can be put back. That matters
 * because the shipped list is not the user's to lose — an accidental long-press should not
 * permanently remove ハックスクワット from an app they reinstall next year.
 */

export function presetKeys(): string[] {
  return PRESET_EXERCISES.map((e) => exerciseKey(e.name, e.bodyPart));
}

/** Reads back whatever is on disk, keeping only keys that still name a real preset. */
export function parseHiddenPresets(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  // A key for a preset that no longer ships would sit in the file forever, hiding nothing.
  const real = new Set(presetKeys());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string' || !real.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

export function hidePreset(list: string[], name: string, bodyPart: string): string[] {
  const key = exerciseKey(name, bodyPart);
  return list.includes(key) ? list : [...list, key];
}

export function restorePreset(list: string[], key: string): string[] {
  return list.filter((k) => k !== key);
}

/** The hidden presets as entries again, for a list the user can restore them from. */
export function hiddenPresetEntries(list: string[]): CustomExercise[] {
  const hidden = new Set(list);
  return PRESET_EXERCISES.filter((e) => hidden.has(exerciseKey(e.name, e.bodyPart))).map((e) => ({
    name: e.name,
    bodyPart: e.bodyPart,
  }));
}
