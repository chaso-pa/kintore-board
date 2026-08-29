import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';

import { useAutosave } from './use-autosave';

/**
 * Exercises the hook, not the engine.
 *
 * The engine's own tests drive it with explicit calls, which cannot catch the failures
 * that live in the React wiring: an effect that does not re-run, a value read from the
 * wrong render, a flush that never happens on the way out. Those are exactly the
 * "it just did not save" reports, so they need a renderer.
 */

interface Harness<T> {
  render: (value: T, opts?: { isSavable?: boolean; enabled?: boolean }) => void;
  unmount: () => void;
  saves: T[];
  renders: number;
}

function mount<T>(initial: T, opts?: { isSavable?: boolean; enabled?: boolean; delayMs?: number }) {
  const saves: T[] = [];
  const save = jest.fn(async (v: T) => {
    saves.push(JSON.parse(JSON.stringify(v)));
  });

  let renders = 0;
  function Probe(props: { value: T; isSavable: boolean; enabled: boolean }) {
    renders += 1;
    useAutosave({
      value: props.value,
      isSavable: props.isSavable,
      enabled: props.enabled,
      save,
      delayMs: opts?.delayMs ?? 1500,
    });
    return null;
  }

  let tree!: ReactTestRenderer;
  const initialProps = {
    value: initial,
    isSavable: opts?.isSavable ?? true,
    enabled: opts?.enabled ?? true,
  };
  act(() => {
    tree = create(<Probe {...initialProps} />);
  });

  const harness: Harness<T> = {
    render: (value, o) => {
      act(() => {
        tree.update(
          <Probe
            value={value}
            isSavable={o?.isSavable ?? initialProps.isSavable}
            enabled={o?.enabled ?? initialProps.enabled}
          />
        );
      });
    },
    unmount: () => act(() => tree.unmount()),
    saves,
    get renders() {
      return renders;
    },
  };
  return { ...harness, save, tick: (ms: number) => act(() => void jest.advanceTimersByTime(ms)) };
}

/** Lets the promises inside a save settle without advancing timers. */
const settle = () => act(async () => {});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('typing', () => {
  it('saves once the typing stops', async () => {
    const h = mount({ memo: '' });
    h.render({ memo: 'a' });
    h.tick(1500);
    await settle();
    expect(h.saves).toEqual([{ memo: 'a' }]);
  });

  it('does not fire a save per keystroke', async () => {
    const h = mount({ memo: '' });
    for (const memo of ['ベ', 'ベン', 'ベンチ']) {
      h.render({ memo });
      h.tick(400);
    }
    expect(h.saves).toHaveLength(0);

    h.tick(1500);
    await settle();
    expect(h.saves).toEqual([{ memo: 'ベンチ' }]);
  });

  // The reported failure: the first edit is kept and everything after it is lost.
  it('keeps saving on every later edit, not just the first', async () => {
    const h = mount({ memo: '' });

    h.render({ memo: '1回目' });
    h.tick(1500);
    await settle();

    h.render({ memo: '2回目' });
    h.tick(1500);
    await settle();

    h.render({ memo: '3回目' });
    h.tick(1500);
    await settle();

    expect(h.saves).toEqual([{ memo: '1回目' }, { memo: '2回目' }, { memo: '3回目' }]);
  });

  // Re-rendering with the same contents is not an edit. The screens rebuild the payload
  // object on every render, so comparing by identity would save on every keystroke
  // elsewhere on the screen.
  it('writes nothing more when the value is unchanged', async () => {
    const h = mount({ memo: 'x' });
    h.tick(1500);
    await settle();
    const afterMount = h.saves.length;

    h.render({ memo: 'x' });
    h.tick(5000);
    await settle();
    expect(h.saves).toHaveLength(afterMount);
  });
});

describe('a value rebuilt every render', () => {
  // The screens build the payload inline, so every render produces a new object with the
  // same contents. Comparing by identity here would save in a loop.
  it('does not save again for an equal object with a new identity', async () => {
    const h = mount({ sets: [{ reps: 10 }] });
    h.tick(1500);
    await settle();
    const afterMount = h.saves.length;

    h.render({ sets: [{ reps: 10 }] });
    h.tick(5000);
    await settle();
    expect(h.saves).toHaveLength(afterMount);

    h.render({ sets: [{ reps: 11 }] });
    h.tick(1500);
    await settle();
    expect(h.saves[h.saves.length - 1]).toEqual({ sets: [{ reps: 11 }] });
    expect(h.saves).toHaveLength(afterMount + 1);
  });

  // A payload carrying Date.now() changes on every render, which would drive the save
  // loop forever and rewrite the record with a slightly different value each time.
  it('settles instead of saving forever when the value keeps changing on its own', async () => {
    const h = mount({ at: 0 });
    let clock = 0;

    // Ten renders, each with a different timestamp, as an unstable payload would produce.
    for (let i = 0; i < 10; i++) {
      clock += 1;
      h.render({ at: clock });
      h.tick(1500);
      await settle();
    }

    // Each distinct value is written once; the point is that it stops there rather than
    // continuing to write after the renders stop.
    const before = h.saves.length;
    h.tick(30_000);
    await settle();
    expect(h.saves.length).toBe(before);
  });
});

describe('leaving the screen', () => {
  it('writes a pending change on unmount', async () => {
    const h = mount({ memo: '' });
    h.render({ memo: '途中' });
    h.tick(100);
    expect(h.saves).toHaveLength(0);

    h.unmount();
    await settle();
    expect(h.saves).toEqual([{ memo: '途中' }]);
  });

  it('writes a change that never reached the debounce at all', async () => {
    const h = mount({ memo: '' });
    h.render({ memo: 'すぐ戻る' });
    h.unmount();
    await settle();
    expect(h.saves).toEqual([{ memo: 'すぐ戻る' }]);
  });

  it('does not write again on unmount when everything is already saved', async () => {
    const h = mount({ memo: '' });
    h.render({ memo: 'a' });
    h.tick(1500);
    await settle();

    h.unmount();
    await settle();
    expect(h.saves).toEqual([{ memo: 'a' }]);
  });
});

describe('backgrounding', () => {
  it('writes a pending change when the app goes to the background', async () => {
    const listeners: ((s: string) => void)[] = [];
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((_event: unknown, cb: (s: string) => void) => {
        listeners.push(cb);
        return { remove: () => {} };
      }) as never);

    const h = mount({ memo: '' });
    h.render({ memo: 'ホーム画面に戻る' });
    h.tick(100);
    expect(h.saves).toHaveLength(0);

    await act(async () => {
      listeners.forEach((cb) => cb('background'));
    });
    expect(h.saves).toEqual([{ memo: 'ホーム画面に戻る' }]);

    spy.mockRestore();
  });
});

describe('enabled', () => {
  // The edit screen keeps autosave off until the fetched record has been copied into the
  // form. Turning it on must not write the empty form that was on screen before.
  it('writes nothing while disabled', async () => {
    const h = mount({ memo: '' }, { enabled: false });
    h.render({ memo: '読み込み前' }, { enabled: false });
    h.tick(5000);
    await settle();
    expect(h.saves).toHaveLength(0);
  });

  it('saves edits made after it is enabled', async () => {
    const h = mount({ memo: '' }, { enabled: false });
    h.render({ memo: '読み込み済み' }, { enabled: true });
    h.tick(1500);
    await settle();

    h.render({ memo: '編集した' }, { enabled: true });
    h.tick(1500);
    await settle();

    expect(h.saves).toContainEqual({ memo: '編集した' });
  });
});

describe('nothing worth saving', () => {
  it('writes nothing for a form that was only opened', async () => {
    const h = mount({ memo: '' }, { isSavable: false });
    h.render({ memo: '' }, { isSavable: false });
    h.tick(5000);
    h.unmount();
    await settle();
    expect(h.saves).toHaveLength(0);
  });

  it('starts saving once the form becomes worth saving', async () => {
    const h = mount({ name: '' }, { isSavable: false });
    h.render({ name: 'ベンチプレス' }, { isSavable: true });
    h.tick(1500);
    await settle();
    expect(h.saves).toEqual([{ name: 'ベンチプレス' }]);
  });
});
