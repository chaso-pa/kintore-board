import { useCallback, useEffect, useState } from 'react';

import {
  addCustomBodyPart,
  reassignToFallback,
  removeCustomBodyPart,
} from '@/lib/custom-body-parts';
import { loadCustomBodyParts, saveCustomBodyParts } from '@/lib/custom-body-parts-storage';
import { addCustomExercise, removeCustomExercise, type CustomExercise } from '@/lib/custom-exercises';
import { loadCustomExercises, saveCustomExercises } from '@/lib/custom-exercises-storage';

/**
 * The device's custom exercises and body parts, wired to their files on disk.
 *
 * The two lists are held together rather than in a hook each because deleting a part has
 * to move the exercises filed under it in the same step. Split across two owners, a part
 * could be gone while exercises still name it, and whichever write landed first would
 * decide what the picker showed.
 *
 * State updates first and the write follows, so the picker reflects a new entry
 * immediately. A failed write leaves the in-memory list ahead of the file until the next
 * launch — acceptable here because nothing is lost that the user cannot re-enter, and
 * blocking the picker on file I/O would be worse.
 */
export function useExerciseCatalog() {
  const [exercises, setExercises] = useState<CustomExercise[]>([]);
  const [bodyParts, setBodyParts] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadCustomExercises(), loadCustomBodyParts()]).then(([ex, parts]) => {
      if (!active) return;
      setExercises(ex);
      setBodyParts(parts);
    });
    return () => {
      active = false;
    };
  }, []);

  const persistExercises = useCallback((next: CustomExercise[]) => {
    setExercises(next);
    void saveCustomExercises(next);
  }, []);

  const persistBodyParts = useCallback((next: string[]) => {
    setBodyParts(next);
    void saveCustomBodyParts(next);
  }, []);

  const createExercise = useCallback(
    (entry: CustomExercise) => persistExercises(addCustomExercise(exercises, entry)),
    [exercises, persistExercises]
  );

  const removeExercise = useCallback(
    (name: string) => persistExercises(removeCustomExercise(exercises, name)),
    [exercises, persistExercises]
  );

  const createBodyPart = useCallback(
    (name: string) => persistBodyParts(addCustomBodyPart(bodyParts, name)),
    [bodyParts, persistBodyParts]
  );

  // The exercises are rewritten before the part disappears, so there is no moment where an
  // exercise points at a part that is already gone.
  const removeBodyPart = useCallback(
    (name: string) => {
      persistExercises(reassignToFallback(exercises, name));
      persistBodyParts(removeCustomBodyPart(bodyParts, name));
    },
    [bodyParts, exercises, persistBodyParts, persistExercises]
  );

  return { exercises, bodyParts, createExercise, removeExercise, createBodyPart, removeBodyPart };
}
