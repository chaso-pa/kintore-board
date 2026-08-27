import { BODY_PARTS, FALLBACK_BODY_PART, PRESET_EXERCISES, type BodyPart } from '@/constants/exercises';
import { normalizeBodyPartName, orderedBodyParts } from '@/lib/custom-body-parts';
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
 * `knownParts` is what a stored part is checked against, because a custom part can be
 * deleted while exercises still name it. Deleting one rewrites those exercises to その他,
 * but a failed write — or a hand-edited file — would otherwise leave an exercise pointing
 * at a part with no chip, making it unreachable from every filter. Callers that know the
 * user's part list should pass it; the default covers presets only.
 *
 * Anything unknown falls back to その他 rather than being dropped: exercise names recorded
 * before a custom entry was deleted must remain categorisable.
 */
export function bodyPartOf(
  exerciseName: string,
  custom: CustomExercise[] = [],
  knownParts: BodyPart[] = BODY_PARTS
): BodyPart {
  const key = normalizeExerciseName(exerciseName);
  const fromCustom = custom.find((e) => normalizeExerciseName(e.name) === key);
  const resolved = fromCustom ? fromCustom.bodyPart : PRESET_BY_NAME.get(key);
  if (resolved === undefined) return FALLBACK_BODY_PART;

  const known = new Set(knownParts.map(normalizeBodyPartName));
  return known.has(normalizeBodyPartName(resolved)) ? resolved : FALLBACK_BODY_PART;
}

/**
 * The filter chips to show, in the canonical body-part order, limited to parts that
 * actually have recorded exercises. Showing every part would leave most chips dead.
 *
 * Custom parts come after the presets, matching the order they appear in the picker.
 */
export function availableBodyParts(
  exerciseNames: string[],
  custom: CustomExercise[] = [],
  customParts: string[] = []
): BodyPart[] {
  const all = orderedBodyParts(customParts);
  const present = new Set(exerciseNames.map((name) => bodyPartOf(name, custom, all)));
  return all.filter((part) => present.has(part));
}
