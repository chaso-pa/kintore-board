import { BODY_PARTS, PRESET_EXERCISES, type BodyPart } from '@/constants/exercises';
import { normalizeExerciseName, type CustomExercise } from '@/lib/custom-exercises';

const PRESET_BY_NAME = new Map(
  PRESET_EXERCISES.map((e) => [normalizeExerciseName(e.name), e.bodyPart])
);

/**
 * Body part for an exercise name.
 *
 * Custom exercises carry their own body part, so they must be passed in — otherwise an
 * exercise the user filed under 背中 would show up as その他 everywhere outside the picker.
 * Names are matched with the same normalisation used when creating them, so a stored
 * record still resolves if it was typed with different spacing or width.
 *
 * Anything unknown still falls back to その他 rather than being dropped from the filter:
 * exercise names recorded before a custom entry was deleted must remain categorisable.
 */
export function bodyPartOf(exerciseName: string, custom: CustomExercise[] = []): BodyPart {
  const key = normalizeExerciseName(exerciseName);
  const fromCustom = custom.find((e) => normalizeExerciseName(e.name) === key);
  if (fromCustom) return fromCustom.bodyPart;
  return PRESET_BY_NAME.get(key) ?? 'その他';
}

/**
 * The filter chips to show, in the canonical body-part order, limited to parts that
 * actually have recorded exercises. Showing every part would leave most chips dead.
 */
export function availableBodyParts(
  exerciseNames: string[],
  custom: CustomExercise[] = []
): BodyPart[] {
  const present = new Set(exerciseNames.map((name) => bodyPartOf(name, custom)));
  return BODY_PARTS.filter((part) => present.has(part));
}
