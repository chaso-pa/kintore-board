export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveSnapshot<T> {
  value: T;
  isSavable: boolean;
  enabled: boolean;
  save: (value: T) => Promise<void>;
}

/**
 * The scheduling and de-duplication behind autosave, with no React in it.
 *
 * It lives apart from the hook because this is the part that can be wrong in ways nobody
 * notices: a save that overtakes a later one, a change that arrives mid-flight and is
 * forgotten, a discard that a queued timer then undoes. None of that is visible on screen
 * — the entry just ends up holding something other than what was typed.
 *
 * The hook owns the React wiring; everything here is driven by explicit calls.
 */
export class AutosaveEngine<T> {
  private snapshot: AutosaveSnapshot<T> | null = null;
  private lastSaved: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  /** A change that arrived while a save was running, and still needs writing. */
  private rerunWhenDone = false;
  private status: AutosaveStatus = 'idle';

  constructor(private readonly onStatus: (s: AutosaveStatus) => void) {}

  /** Replaces what a fired timer or a flush will read. Called on every render. */
  update(snapshot: AutosaveSnapshot<T>) {
    this.snapshot = snapshot;
  }

  private setStatus(next: AutosaveStatus) {
    if (this.status === next) return;
    this.status = next;
    this.onStatus(next);
  }

  private serialized(): string | null {
    return this.snapshot ? JSON.stringify(this.snapshot.value) : null;
  }

  /** Whether the current value differs from what was last written. */
  isDirty(): boolean {
    const s = this.serialized();
    return s !== null && s !== this.lastSaved;
  }

  hasSavedAnything(): boolean {
    return this.lastSaved !== null;
  }

  /** Debounces a write. Repeated calls restart the clock rather than queueing writes. */
  schedule(delayMs: number) {
    const snap = this.snapshot;
    if (!snap || !snap.enabled || !snap.isSavable || !this.isDirty()) return;

    this.setStatus('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delayMs);
  }

  /** Writes now, skipping any pending debounce. Used on the way out of the screen. */
  flush(): Promise<void> {
    this.cancelTimer();
    return this.run();
  }

  /**
   * Abandons what is on screen: the pending timer is dropped and the current value is
   * recorded as though it had been written, so the flush on unmount finds nothing to do.
   */
  discard() {
    this.cancelTimer();
    this.rerunWhenDone = false;
    const s = this.serialized();
    if (s !== null) this.lastSaved = s;
  }

  /** Frees the timer. The caller is responsible for flushing first if it wants to. */
  dispose() {
    this.cancelTimer();
  }

  private cancelTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    const snap = this.snapshot;
    if (!snap || !snap.enabled || !snap.isSavable) return;

    const serialized = JSON.stringify(snap.value);
    if (serialized === this.lastSaved) return;

    if (this.inFlight) {
      // Starting a second write here would let two requests race, and the older one could
      // land last. The newer value is written once the current one finishes.
      this.rerunWhenDone = true;
      return;
    }

    this.inFlight = true;
    this.setStatus('saving');
    try {
      await snap.save(snap.value);
      this.lastSaved = serialized;
      this.setStatus('saved');
    } catch {
      // Left dirty on purpose: not recording it as saved is what makes the next change,
      // or the flush on the way out, try again.
      this.setStatus('error');
    } finally {
      this.inFlight = false;
      if (this.rerunWhenDone) {
        this.rerunWhenDone = false;
        await this.run();
      }
    }
  }
}
