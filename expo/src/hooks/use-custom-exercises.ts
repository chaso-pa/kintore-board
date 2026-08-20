import { useCallback, useEffect, useState } from 'react';

import { addCustomExercise, removeCustomExercise, type CustomExercise } from '@/lib/custom-exercises';
import { loadCustomExercises, saveCustomExercises } from '@/lib/custom-exercises-storage';

/**
 * The device's custom exercise list, wired to its file on disk.
 *
 * State updates first and the write follows, so the picker reflects a new exercise
 * immediately. A failed write leaves the in-memory list ahead of the file until the next
 * launch — acceptable here because nothing is lost that the user cannot re-enter, and
 * blocking the picker on file I/O would be worse.
 */
export function useCustomExercises() {
  const [exercises, setExercises] = useState<CustomExercise[]>([]);

  useEffect(() => {
    let active = true;
    loadCustomExercises().then((list) => {
      if (active) setExercises(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: CustomExercise[]) => {
    setExercises(next);
    void saveCustomExercises(next);
  }, []);

  const create = useCallback(
    (entry: CustomExercise) => persist(addCustomExercise(exercises, entry)),
    [exercises, persist]
  );

  const remove = useCallback(
    (name: string) => persist(removeCustomExercise(exercises, name)),
    [exercises, persist]
  );

  return { exercises, create, remove };
}
