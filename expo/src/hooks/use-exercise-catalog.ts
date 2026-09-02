import { useCallback, useEffect, useState } from 'react';

import {
  addCustomBodyPart,
  reassignToFallback,
  removeCustomBodyPart,
} from '@/lib/custom-body-parts';
import { loadCustomBodyParts, saveCustomBodyParts } from '@/lib/custom-body-parts-storage';
import { addCustomExercise, removeCustomExercise, type CustomExercise } from '@/lib/custom-exercises';
import { loadCustomExercises, saveCustomExercises } from '@/lib/custom-exercises-storage';
import { hidePreset, restorePreset } from '@/lib/hidden-presets';
import { loadHiddenPresets, saveHiddenPresets } from '@/lib/hidden-presets-storage';

/**
 * Everything the exercise picker offers, wired to its files on disk.
 *
 * Three lists — the user's exercises, their body parts, and the presets they have removed —
 * held together rather than in a hook each. Deleting a part has to move the exercises filed
 * under it in the same step; split across owners, a part could be gone while exercises still
 * name it, and whichever write landed first would decide what the picker showed.
 *
 * State updates first and the write follows, so the picker reflects a change immediately. A
 * failed write leaves the in-memory list ahead of the file until the next launch —
 * acceptable here because nothing is lost that the user cannot redo, and blocking the picker
 * on file I/O would be worse.
 */
export function useExerciseCatalog() {
  const [exercises, setExercises] = useState<CustomExercise[]>([]);
  const [bodyParts, setBodyParts] = useState<string[]>([]);
  const [hiddenPresets, setHiddenPresets] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadCustomExercises(), loadCustomBodyParts(), loadHiddenPresets()]).then(
      ([ex, parts, hidden]) => {
        if (!active) return;
        setExercises(ex);
        setBodyParts(parts);
        setHiddenPresets(hidden);
      }
    );
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

  const persistHidden = useCallback((next: string[]) => {
    setHiddenPresets(next);
    void saveHiddenPresets(next);
  }, []);

  const createExercise = useCallback(
    (entry: CustomExercise) => persistExercises(addCustomExercise(exercises, entry)),
    [exercises, persistExercises]
  );

  const removeExercise = useCallback(
    (name: string, bodyPart: string) =>
      persistExercises(removeCustomExercise(exercises, name, bodyPart)),
    [exercises, persistExercises]
  );

  // Presets cannot be edited out of the shipped list, so removing one is recorded as a
  // decision to stop showing it.
  const hideExercisePreset = useCallback(
    (name: string, bodyPart: string) => persistHidden(hidePreset(hiddenPresets, name, bodyPart)),
    [hiddenPresets, persistHidden]
  );

  const restoreExercisePreset = useCallback(
    (key: string) => persistHidden(restorePreset(hiddenPresets, key)),
    [hiddenPresets, persistHidden]
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

  return {
    exercises,
    bodyParts,
    hiddenPresets,
    createExercise,
    removeExercise,
    hideExercisePreset,
    restoreExercisePreset,
    createBodyPart,
    removeBodyPart,
  };
}
