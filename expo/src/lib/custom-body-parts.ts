import { BODY_PARTS, FALLBACK_BODY_PART, type BodyPart } from '@/constants/exercises';
import { normalizeExerciseName, type CustomExercise } from '@/lib/custom-exercises';

/**
 * Comparison key for body part names — the same folding used for exercise names, so 「腹筋」
 * typed with stray spaces or in half-width kana is not accepted as a second part.
 */
export const normalizeBodyPartName = normalizeExerciseName;

const PRESET_KEYS = new Set(BODY_PARTS.map(normalizeBodyPartName));

/**
 * Why this part name cannot be used, or null when it is free.
 *
 * Blank returns null for the same reason the exercise form does: emptiness is handled by
 * disabling the button, and calling it a duplicate would be misleading.
 */
export function duplicateBodyPartReason(name: string, existing: string[]): string | null {
  const key = normalizeBodyPartName(name);
  if (key === '') return null;
  if (PRESET_KEYS.has(key)) return 'この部位は最初からあります';
  if (existing.some((p) => normalizeBodyPartName(p) === key)) return 'この部位は既に登録されています';
  return null;
}

/**
 * Reads back whatever is on disk, keeping only well-formed entries.
 *
 * Same contract as the exercise file: this is user-modifiable storage that outlives app
 * updates, so a hand-edited or truncated file must degrade to "no custom parts" instead of
 * breaking the picker. Names colliding with a preset are dropped rather than kept, since
 * two chips reading 胸 would be indistinguishable.
 */
export function parseCustomBodyParts(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim();
    const key = normalizeBodyPartName(name);
    if (key === '' || PRESET_KEYS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Every selectable part, presets first.
 *
 * This list — not the type — is what decides whether a stored part still exists, so it is
 * also what `bodyPartOf` is checked against.
 */
export function orderedBodyParts(custom: string[]): BodyPart[] {
  return [...BODY_PARTS, ...custom];
}

export function addCustomBodyPart(list: string[], name: string): string[] {
  return [...list, name.trim()];
}

export function removeCustomBodyPart(list: string[], name: string): string[] {
  const key = normalizeBodyPartName(name);
  return list.filter((p) => normalizeBodyPartName(p) !== key);
}

/**
 * Moves exercises off a part that is being deleted.
 *
 * Deleting a part must not take the exercises filed under it with it — those carry the
 * user's own naming and, through the name, all of their history. They land in その他,
 * which is where anything uncategorised already goes.
 */
export function reassignToFallback(
  exercises: CustomExercise[],
  removedPart: string
): CustomExercise[] {
  const key = normalizeBodyPartName(removedPart);
  return exercises.map((e) =>
    normalizeBodyPartName(e.bodyPart) === key ? { ...e, bodyPart: FALLBACK_BODY_PART } : e
  );
}

/** How many exercises a delete would move, for the confirmation prompt. */
export function countExercisesIn(exercises: CustomExercise[], part: string): number {
  const key = normalizeBodyPartName(part);
  return exercises.filter((e) => normalizeBodyPartName(e.bodyPart) === key).length;
}
