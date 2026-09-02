import { type BodyPart } from '@/constants/exercises';
import { orderedBodyParts } from '@/lib/custom-body-parts';
import { type CustomExercise } from '@/lib/custom-exercises';
import { bodyPartOf } from '@/utils/exercise-category';

export interface ExerciseMapping {
  exercise_name: string;
  body_part: string;
}

/**
 * Works out a body part for exercise names the server has none for.
 *
 * The server cannot do this. It holds no map from an exercise name to a part: the preset
 * list ships inside the app, and anything the user invented — the exercise or the part —
 * exists only in a file on their phone. So the phone answers for its own records.
 *
 * Names it cannot place are left out rather than sent as その他. A row with no part is
 * offered again next launch, on a device that may know the answer; one written as その他
 * looks classified and never comes back. Guessing here would quietly bury the exercises
 * most likely to be someone's own.
 */
export function resolveMappings(
  names: string[],
  custom: CustomExercise[],
  customParts: string[]
): ExerciseMapping[] {
  const known: BodyPart[] = orderedBodyParts(customParts);
  const out: ExerciseMapping[] = [];

  for (const name of names) {
    if (name.trim() === '') continue;
    const part = bodyPartOf(name, custom, known);
    // その他 is what bodyPartOf answers when it recognises nothing, so it cannot be told
    // apart from a real answer of その他 — and treating it as one would end the retries.
    if (part === 'その他') continue;
    out.push({ exercise_name: name, body_part: part });
  }
  return out;
}
