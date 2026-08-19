import { BODY_PARTS, PRESET_EXERCISES, type BodyPart } from '@/constants/exercises';

const PRESET_BY_NAME = new Map(PRESET_EXERCISES.map((e) => [e.name, e.bodyPart]));

/**
 * Body part for an exercise name.
 *
 * Users can type their own exercise names, so anything not in the preset list falls back
 * to その他 rather than being dropped from the category filter entirely.
 */
export function bodyPartOf(exerciseName: string): BodyPart {
  return PRESET_BY_NAME.get(exerciseName) ?? 'その他';
}

/**
 * The filter chips to show, in the canonical body-part order, limited to parts that
 * actually have recorded exercises. Showing every part would leave most chips dead.
 */
export function availableBodyParts(exerciseNames: string[]): BodyPart[] {
  const present = new Set(exerciseNames.map(bodyPartOf));
  return BODY_PARTS.filter((part) => present.has(part));
}
