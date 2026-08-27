import { AutosaveEngine, type AutosaveStatus } from './autosave-engine';

/** A save that the test resolves by hand, so mid-flight behaviour can be observed. */
function deferredSave() {
  const calls: unknown[] = [];
  let resolveCurrent: (() => void) | null = null;
  let rejectCurrent: ((e: unknown) => void) | null = null;

  const save = (value: unknown) => {
    calls.push(value);
    return new Promise<void>((resolve, reject) => {
      resolveCurrent = resolve;
      rejectCurrent = reject;
    });
  };
  return {
    save,
    calls,
    resolve: () => {
      resolveCurrent?.();
      // Let the awaiting code run before the test looks at anything.
      return Promise.resolve().then(() => Promise.resolve());
    },
    reject: (e: unknown = new Error('nope')) => {
      rejectCurrent?.(e);
      return Promise.resolve().then(() => Promise.resolve());
    },
  };
}

function makeEngine<T>(initial: T, save: (v: T) => Promise<void>, opts?: { enabled?: boolean; isSavable?: boolean }) {
  const statuses: AutosaveStatus[] = [];
  const engine = new AutosaveEngine<T>((s) => statuses.push(s));
  engine.update({ value: initial, isSavable: opts?.isSavable ?? true, enabled: opts?.enabled ?? true, save });
  return { engine, statuses };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('scheduling', () => {
  it('writes once the debounce elapses', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    engine.schedule(1000);
    expect(d.calls).toHaveLength(0);

    jest.advanceTimersByTime(1000);
    expect(d.calls).toEqual([{ n: 1 }]);
  });

  // Typing restarts the clock rather than queueing a write per keystroke, which is what
  // keeps a set of numbers from becoming a burst of requests.
  it('restarts the clock on each change instead of queueing writes', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    engine.schedule(1000);
    jest.advanceTimersByTime(900);
    engine.update({ value: { n: 2 }, isSavable: true, enabled: true, save: d.save });
    engine.schedule(1000);
    jest.advanceTimersByTime(900);
    expect(d.calls).toHaveLength(0);

    jest.advanceTimersByTime(100);
    expect(d.calls).toEqual([{ n: 2 }]);
  });

  it('writes the value as of when the timer fires, not when it was set', () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    engine.schedule(1000);
    engine.update({ value: { n: 42 }, isSavable: true, enabled: true, save: d.save });
    jest.advanceTimersByTime(1000);

    expect(d.calls).toEqual([{ n: 42 }]);
  });

  it('does nothing while disabled', () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save, { enabled: false });
    engine.schedule(1000);
    jest.advanceTimersByTime(5000);
    expect(d.calls).toHaveLength(0);
  });

  // Opening the record screen and backing out must not leave a workout behind.
  it('does nothing when there is nothing worth saving', () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 0 }, d.save, { isSavable: false });
    engine.schedule(1000);
    jest.advanceTimersByTime(5000);
    void engine.flush();
    expect(d.calls).toHaveLength(0);
  });
});

describe('de-duplication', () => {
  it('does not rewrite an unchanged value', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    void engine.flush();
    await d.resolve();
    expect(d.calls).toHaveLength(1);

    void engine.flush();
    expect(d.calls).toHaveLength(1);
  });

  it('writes again once the value changes', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    void engine.flush();
    await d.resolve();

    engine.update({ value: { n: 2 }, isSavable: true, enabled: true, save: d.save });
    void engine.flush();
    await d.resolve();

    expect(d.calls).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe('concurrency', () => {
  // Two writes in flight can land out of order, leaving the server holding the older one.
  // A change during a save waits for it instead.
  it('never runs two saves at once', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    void engine.flush();
    expect(d.calls).toHaveLength(1);

    engine.update({ value: { n: 2 }, isSavable: true, enabled: true, save: d.save });
    void engine.flush();
    // Still one: the second is waiting rather than racing.
    expect(d.calls).toHaveLength(1);

    await d.resolve();
    expect(d.calls).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('writes the newest value once, not every change that arrived mid-flight', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    void engine.flush();
    for (const n of [2, 3, 4]) {
      engine.update({ value: { n }, isSavable: true, enabled: true, save: d.save });
      void engine.flush();
    }
    await d.resolve();

    // One catch-up write, carrying the latest value — not one per intermediate edit.
    expect(d.calls).toEqual([{ n: 1 }, { n: 4 }]);
  });
});

describe('failure', () => {
  // A failed write must stay dirty, or the change is silently dropped: nothing else would
  // ever try again.
  it('retries a failed value on the next flush', async () => {
    const d = deferredSave();
    const { engine, statuses } = makeEngine({ n: 1 }, d.save);

    void engine.flush();
    await d.reject();
    expect(statuses).toContain('error');
    expect(engine.isDirty()).toBe(true);

    void engine.flush();
    await d.resolve();
    expect(d.calls).toEqual([{ n: 1 }, { n: 1 }]);
  });

  it('does not claim to have saved anything after a failure', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);
    void engine.flush();
    await d.reject();
    expect(engine.hasSavedAnything()).toBe(false);
  });
});

describe('discard', () => {
  // Discard has to survive the flush that unmounting performs immediately afterwards.
  it('stops the pending write and the one on unmount', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    engine.schedule(1000);
    engine.discard();

    jest.advanceTimersByTime(5000);
    void engine.flush();
    expect(d.calls).toHaveLength(0);
  });

  it('leaves later edits saveable again', async () => {
    const d = deferredSave();
    const { engine } = makeEngine({ n: 1 }, d.save);

    engine.discard();
    engine.update({ value: { n: 2 }, isSavable: true, enabled: true, save: d.save });
    void engine.flush();

    expect(d.calls).toEqual([{ n: 2 }]);
  });
});

describe('status', () => {
  it('moves through pending, saving and saved', async () => {
    const d = deferredSave();
    const { engine, statuses } = makeEngine({ n: 1 }, d.save);

    engine.schedule(1000);
    expect(statuses).toEqual(['pending']);

    jest.advanceTimersByTime(1000);
    expect(statuses).toEqual(['pending', 'saving']);

    await d.resolve();
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
  });

  it('does not repeat a status it is already in', async () => {
    const d = deferredSave();
    const { engine, statuses } = makeEngine({ n: 1 }, d.save);
    engine.schedule(1000);
    engine.schedule(1000);
    engine.schedule(1000);
    expect(statuses).toEqual(['pending']);
  });
});
