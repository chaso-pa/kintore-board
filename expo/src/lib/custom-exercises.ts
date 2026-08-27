import { PRESET_EXERCISES, type BodyPart, type ExercisePreset } from '@/constants/exercises';

export interface CustomExercise {
  name: string;
  bodyPart: BodyPart;
}

export interface ListedExercise extends ExercisePreset {
  isCustom: boolean;
}

/**
 * Comparison key for exercise names.
 *
 * Folds the ways the same exercise gets typed differently — surrounding spaces, half-width
 * katakana, letter case — so "ﾍﾞﾝﾁﾌﾟﾚｽ" and "ベンチプレス" are recognised as the same thing
 * rather than becoming two entries whose history is tracked separately.
 */
export function normalizeExerciseName(name: string): string {
  return name.trim().normalize('NFKC').toLowerCase();
}

const PRESET_KEYS = new Set(PRESET_EXERCISES.map((e) => normalizeExerciseName(e.name)));

/**
 * Why this name cannot be used, or null when it is free.
 *
 * A blank name returns null: emptiness is handled by the submit button being disabled, and
 * reporting it as a duplicate would be misleading.
 */
export function duplicateReason(name: string, existing: CustomExercise[]): string | null {
  const key = normalizeExerciseName(name);
  if (key === '') return null;
  if (PRESET_KEYS.has(key)) return 'この種目はプリセットに既にあります';
  if (existing.some((e) => normalizeExerciseName(e.name) === key)) {
    return 'この種目は既に登録されています';
  }
  return null;
}

/**
 * Reads back whatever is on disk, keeping only well-formed entries.
 *
 * The file is user-modifiable storage that survives app updates, so a malformed or
 * hand-edited file must degrade to "no custom exercises" rather than crash the picker.
 *
 * The body part is no longer checked against the preset list — a custom part is a valid
 * one, and the two files are written separately, so an exercise can legitimately be read
 * back before the part list it refers to. Resolving a part that no longer exists is left
 * to `bodyPartOf`, which falls back to その他.
 */
export function parseCustomExercises(raw: string): CustomExercise[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((e): e is CustomExercise => {
    if (typeof e !== 'object' || e === null) return false;
    const { name, bodyPart } = e as Record<string, unknown>;
    return (
      typeof name === 'string' &&
      name.trim() !== '' &&
      typeof bodyPart === 'string' &&
      bodyPart.trim() !== ''
    );
  });
}

/**
 * The picker's full list: presets first, then custom entries.
 *
 * Order matters — the modal filters this by body part without re-sorting, so concatenating
 * in this order is what puts a user's own exercises after the standard ones within each tab.
 */
export function buildExerciseList(custom: CustomExercise[]): ListedExercise[] {
  return [
    ...PRESET_EXERCISES.map((e) => ({ ...e, isCustom: false })),
    ...custom.map((e) => ({ ...e, isCustom: true })),
  ];
}

export function addCustomExercise(
  list: CustomExercise[],
  entry: CustomExercise
): CustomExercise[] {
  return [...list, { name: entry.name.trim(), bodyPart: entry.bodyPart }];
}

export function removeCustomExercise(list: CustomExercise[], name: string): CustomExercise[] {
  const key = normalizeExerciseName(name);
  return list.filter((e) => normalizeExerciseName(e.name) !== key);
}
