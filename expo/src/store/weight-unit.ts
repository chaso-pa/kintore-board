import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import type { WeightUnit } from '@/lib/weight-unit';

const FILE_NAME = 'weight-unit.json';

function unitFile() {
  return new File(Paths.document, FILE_NAME);
}

/** Same key the record screens use for "last time": an exercise is its name *and* part. */
export function exerciseUnitKey(name: string, bodyPart?: string): string {
  return `${name.trim()}\u0000${bodyPart ?? ''}`;
}

/**
 * The unit weights are typed and shown in. A device setting, like the exercise catalog:
 * it is a display preference, and the stored numbers are kg whatever it says.
 *
 * Two levels. `unit` is the default chosen on the profile screen. `exercises` holds the
 * exceptions, set with the toggle on an exercise in the record form — a dumbbell rack in lb
 * at a gym whose plates are kg is the usual reason — and remembered so the same exercise
 * opens in the same unit next time.
 *
 * Starts as kg and is replaced once the file has been read. A missing or unreadable file
 * stays kg — the app's original behaviour, so a read failure changes nothing visible.
 */
interface WeightUnitState {
  unit: WeightUnit;
  exercises: Record<string, WeightUnit>;
  setUnit: (unit: WeightUnit) => void;
  setExerciseUnit: (key: string, unit: WeightUnit) => void;
}

function persist(state: Pick<WeightUnitState, 'unit' | 'exercises'>) {
  try {
    const file = unitFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify({ unit: state.unit, exercises: state.exercises }));
  } catch {
    // Kept for this session; the next launch falls back to whatever was last written.
  }
}

export const useWeightUnitStore = create<WeightUnitState>((set, get) => ({
  unit: 'kg',
  exercises: {},
  setUnit: (unit) => {
    set({ unit });
    persist(get());
  },
  setExerciseUnit: (key, unit) => {
    if (!key.split('\u0000')[0]) return; // no exercise picked yet: nothing to remember it by
    set({ exercises: { ...get().exercises, [key]: unit } });
    persist(get());
  },
}));

const isUnit = (u: unknown): u is WeightUnit => u === 'kg' || u === 'lb';

let loaded = false;

/** Called at startup, so a record screen opened right after launch already has the unit. */
export async function loadWeightUnit() {
  if (loaded) return;
  loaded = true;
  try {
    const file = unitFile();
    if (!file.exists) return;
    const parsed = JSON.parse(await file.text()) as { unit?: unknown; exercises?: unknown } | null;
    const next: Partial<Pick<WeightUnitState, 'unit' | 'exercises'>> = {};
    if (isUnit(parsed?.unit)) next.unit = parsed.unit;
    if (parsed?.exercises && typeof parsed.exercises === 'object') {
      next.exercises = Object.fromEntries(
        Object.entries(parsed.exercises as Record<string, unknown>).filter(
          (e): e is [string, WeightUnit] => isUnit(e[1])
        )
      );
    }
    useWeightUnitStore.setState(next);
  } catch {
    // Stays kg.
  }
}

/** The unit chosen for this exercise, or undefined if it just follows the default. */
export function rememberedExerciseUnit(name: string, bodyPart?: string): WeightUnit | undefined {
  return useWeightUnitStore.getState().exercises[exerciseUnitKey(name, bodyPart)];
}

/** The unit for an exercise: its own if one was chosen, else the default. */
export function unitForExercise(name: string, bodyPart?: string): WeightUnit {
  const { unit, exercises } = useWeightUnitStore.getState();
  return exercises[exerciseUnitKey(name, bodyPart)] ?? unit;
}

/** The default unit. */
export function useWeightUnit(): WeightUnit {
  void loadWeightUnit();
  return useWeightUnitStore((s) => s.unit);
}

/**
 * A lookup for screens that show several exercises. Subscribes to the whole store, so a
 * change on either level re-renders.
 */
export function useExerciseUnits(): (name: string, bodyPart?: string) => WeightUnit {
  void loadWeightUnit();
  const unit = useWeightUnitStore((s) => s.unit);
  const exercises = useWeightUnitStore((s) => s.exercises);
  return (name, bodyPart) => exercises[exerciseUnitKey(name, bodyPart)] ?? unit;
}
