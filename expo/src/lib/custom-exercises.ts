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

/**
 * What makes an entry in the picker unique: the name *and* the body part.
 *
 * The name alone used to be enough. It is not, now that the same name can be filed under
 * two parts — a pullover trained as chest work is a different entry from the same movement
 * trained as back work, and someone who wants both should be able to keep both.
 *
 * The separator is a NUL so it cannot occur inside either half and let two different pairs
 * collapse onto one key.
 */
export function exerciseKey(name: string, bodyPart: string): string {
  return `${normalizeExerciseName(name)}\u0000${normalizeExerciseName(bodyPart)}`;
}

const PRESET_BY_KEY = new Map(PRESET_EXERCISES.map((e) => [exerciseKey(e.name, e.bodyPart), e]));

/**
 * Why this name cannot be used under this body part, or null when it is free.
 *
 * A blank name returns null: emptiness is handled by the submit button being disabled, and
 * reporting it as a duplicate would be misleading.
 *
 * A preset the user has hidden does not block anything. Having deleted it, being told it
 * already exists would be a dead end with no way forward.
 */
export function duplicateReason(
  name: string,
  bodyPart: string,
  existing: CustomExercise[],
  hiddenPresets: string[] = []
): string | null {
  const key = exerciseKey(name, bodyPart);
  if (normalizeExerciseName(name) === '') return null;
  if (PRESET_BY_KEY.has(key) && !hiddenPresets.includes(key)) {
    return 'この部位に同じ名前のプリセットがあります';
  }
  if (existing.some((e) => exerciseKey(e.name, e.bodyPart) === key)) {
    return 'この部位に同じ名前の種目があります';
  }
  return null;
}

/**
 * Reads back whatever is on disk, keeping only well-formed entries.
 *
 * The file is user-modifiable storage that survives app updates, so a malformed or
 * hand-edited file must degrade to "no custom exercises" rather than crash the picker.
 *
 * The body part is not checked against the preset list — a custom part is a valid one, and
 * the two files are written separately, so an exercise can legitimately be read back before
 * the part list it refers to. Resolving a part that no longer exists is left to
 * `bodyPartOf`, which falls back to その他.
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
 *
 * Hidden presets are dropped here, which is the whole of what "deleting a preset" means:
 * the shipped list is not editable, so the only stable way to remove one is to remember
 * that it should not be shown.
 *
 * A custom entry matching a *visible* preset exactly — same name, same part — is also
 * dropped. Creating one is blocked, but a preset added in a later release can collide with
 * an exercise someone already made. Both rows would carry the same name under the same tab,
 * and the preset wins because the custom row would be a duplicate that is confusing to tell
 * apart from it.
 */
export function buildExerciseList(
  custom: CustomExercise[],
  hiddenPresets: string[] = []
): ListedExercise[] {
  const hidden = new Set(hiddenPresets);
  const visiblePresets = PRESET_EXERCISES.filter((e) => !hidden.has(exerciseKey(e.name, e.bodyPart)));
  const visibleKeys = new Set(visiblePresets.map((e) => exerciseKey(e.name, e.bodyPart)));

  return [
    ...visiblePresets.map((e) => ({ ...e, isCustom: false })),
    ...custom
      .filter((e) => !visibleKeys.has(exerciseKey(e.name, e.bodyPart)))
      .map((e) => ({ ...e, isCustom: true })),
  ];
}

export function addCustomExercise(
  list: CustomExercise[],
  entry: CustomExercise
): CustomExercise[] {
  return [...list, { name: entry.name.trim(), bodyPart: entry.bodyPart }];
}

export function removeCustomExercise(
  list: CustomExercise[],
  name: string,
  bodyPart: string
): CustomExercise[] {
  const key = exerciseKey(name, bodyPart);
  return list.filter((e) => exerciseKey(e.name, e.bodyPart) !== key);
}
