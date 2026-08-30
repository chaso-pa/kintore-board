import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { AutosaveEngine, type AutosaveStatus } from '@/lib/autosave-engine';

export type { AutosaveStatus };

interface Options<T> {
  /** The current form state. Compared by JSON to decide whether anything changed. */
  value: T;
  /** Whether the value is worth writing at all. A blank form is not. */
  isSavable: boolean;
  /** Writes the value. Rejecting leaves the change dirty so the next attempt retries it. */
  save: (value: T) => Promise<void>;
  /** How long to wait after the last keystroke. */
  delayMs?: number;
  /** Turns autosave off entirely — used while the initial data is still loading. */
  enabled?: boolean;
}

/**
 * Saves as you type, and again on the way out.
 *
 * Removing the save button removes the moment where someone knew their work was safe, so
 * that assurance has to come from somewhere else. Three things provide it: a debounced
 * write while editing, a flush when the screen closes, and a flush when the app is
 * backgrounded. The debounce is what actually protects the data — a kill from the app
 * switcher never reaches the other two.
 *
 * Leaving the screen does not wait for the request. The promise outlives the component, so
 * the write finishes on its own; blocking the back button on a round trip would make it
 * feel broken on the sort of connection a gym basement has.
 *
 * The scheduling itself lives in AutosaveEngine, where it can be tested without a renderer.
 */
export function useAutosave<T>({
  value,
  isSavable,
  save,
  delayMs = 1500,
  enabled = true,
}: Options<T>) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const engine = useMemo(() => new AutosaveEngine<T>(setStatus), []);

  // Refreshed every render so a fired timer reads the current form, not the one that was
  // on screen when the timer was set.
  engine.update({ value, isSavable, enabled, save });

  const serialized = JSON.stringify(value);
  useEffect(() => {
    engine.schedule(delayMs);
  }, [engine, serialized, isSavable, enabled, delayMs]);

  const flush = useCallback(() => {
    void engine.flush();
  }, [engine]);

  // The header button, the OS back gesture and a swipe all end up here.
  //
  // Declared before the AppState effect on purpose. React runs cleanups in order and stops
  // at the first one that throws, so anything that could throw must come after this — a
  // skipped cleanup here is a discarded edit.
  useEffect(() => {
    return () => {
      void engine.flush();
      engine.dispose();
    };
  }, [engine]);

  // Backgrounding is the closest signal to "closing the app" that we are given. A force
  // quit produces no callback at all, which is why the debounce above carries the weight.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') flush();
    });
    return () => sub?.remove?.();
  }, [flush]);

  return {
    status,
    saveNow: flush,
    discard: useCallback(() => engine.discard(), [engine]),
    hasSaved: useCallback(() => engine.hasSavedAnything(), [engine]),
  };
}
