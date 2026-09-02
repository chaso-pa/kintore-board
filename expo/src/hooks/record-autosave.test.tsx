import { useState } from 'react';
import { act, create } from 'react-test-renderer';

import { useAutosave } from '@/hooks/use-autosave';
import {
  buildWorkoutPayload,
  buildWorkoutSets,
  hasAnythingToSave,
  type ExerciseGroup,
} from '@/lib/workout-payload';

/**
 * The save wiring of the record screens, without their markup.
 *
 * These reproduce the ways saving was reported to fail, at the level where it broke: not
 * inside the engine and not inside the hook, but in what the screens hand them. Each one
 * failed before the fix it is named after.
 */

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => act(async () => {});

const row = (weight: string, reps: string) => ({ weight, reps, spotted: false, memo: '' });

const bench = (): ExerciseGroup => ({
  id: '1',
  exercise_name: 'ベンチプレス',
  body_part: '胸',
  rows: [row('60', '10')],
});

const blank = (): ExerciseGroup => ({
  id: '1',
  exercise_name: '',
  rows: [row('', '')],
});

/** Mirrors record/new.tsx: a fixed date, a memo, groups, and the create-then-update save. */
function mountNewScreen(dateParam?: string) {
  const saves: { method: 'POST' | 'PUT'; body: ReturnType<typeof buildWorkoutPayload> }[] = [];
  let setMemo: (s: string) => void = () => {};
  let setGroups: (g: ExerciseGroup[]) => void = () => {};

  function Screen() {
    const [trainedOn] = useState(() => (dateParam ? new Date(dateParam) : new Date()));
    const [memo, setMemoState] = useState('');
    const [groups, setGroupsState] = useState<ExerciseGroup[]>([blank()]);
    setMemo = setMemoState;
    setGroups = setGroupsState;

    const payload = buildWorkoutPayload(trainedOn.toISOString(), memo, groups);
    useAutosave({
      value: payload,
      isSavable: hasAnythingToSave(groups, memo),
      save: async (v) => {
        saves.push({ method: saves.length === 0 ? 'POST' : 'PUT', body: v });
      },
    });
    return null;
  }

  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Screen />);
  });

  return {
    saves,
    typeMemo: (s: string) => act(() => setMemo(s)),
    setGroups: (g: ExerciseGroup[]) => act(() => setGroups(g)),
    tick: (ms: number) => act(() => void jest.advanceTimersByTime(ms)),
    unmount: () => act(() => tree.unmount()),
  };
}

/** Mirrors record/edit/[workoutId].tsx: loaded data, an initialised gate, PUT on change. */
function mountEditScreen(loaded: { trained_on: string; memo: string; groups: ExerciseGroup[] }) {
  const saves: ReturnType<typeof buildWorkoutPayload>[] = [];
  let setMemo: (s: string) => void = () => {};
  let setGroups: (g: ExerciseGroup[]) => void = () => {};

  function Screen({ data }: { data: typeof loaded | undefined }) {
    const [memo, setMemoState] = useState('');
    const [groups, setGroupsState] = useState<ExerciseGroup[]>([]);
    const [initialized, setInitialized] = useState(false);
    setMemo = setMemoState;
    setGroups = setGroupsState;

    if (data && !initialized) {
      setMemoState(data.memo);
      setGroupsState(data.groups);
      setInitialized(true);
    }

    const payload = buildWorkoutPayload(data?.trained_on ?? '', memo, groups);
    useAutosave({
      value: payload,
      isSavable: true,
      enabled: initialized && !!data,
      save: async (v) => {
        saves.push(v);
      },
    });
    return null;
  }

  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Screen data={undefined} />);
  });
  act(() => {
    tree.update(<Screen data={loaded} />);
  });

  return {
    saves,
    typeMemo: (s: string) => act(() => setMemo(s)),
    setGroups: (g: ExerciseGroup[]) => act(() => setGroups(g)),
    tick: (ms: number) => act(() => void jest.advanceTimersByTime(ms)),
    unmount: () => act(() => tree.unmount()),
  };
}

describe('new screen — a memo typed before any exercise', () => {
  // Reported as "typing a memo does not save". hasAnythingToSave only looked at exercise
  // names, so the memo was not a delay in saving — it was never written at all.
  it('saves a workout memo even with no exercise chosen', async () => {
    const s = mountNewScreen('2026-08-29');
    s.typeMemo('胸の日');
    s.tick(1500);
    await settle();

    expect(s.saves).toHaveLength(1);
    expect(s.saves[0].body.memo).toBe('胸の日');
  });

  it('still writes nothing for a form that was only opened', async () => {
    const s = mountNewScreen('2026-08-29');
    s.tick(5000);
    s.unmount();
    await settle();
    expect(s.saves).toHaveLength(0);
  });

  it('treats a whitespace-only memo as nothing', async () => {
    const s = mountNewScreen('2026-08-29');
    s.typeMemo('   ');
    s.tick(5000);
    await settle();
    expect(s.saves).toHaveLength(0);
  });
});

describe('new screen — trained_on', () => {
  // The date used to be `new Date()` re-read on every render, so each render produced a
  // different payload: autosave saw a change nobody made, wrote it, re-rendered from its
  // own status update, and saw another. It never stopped.
  it('does not drift, and does not save in a loop, when no date was supplied', async () => {
    const s = mountNewScreen();
    s.setGroups([bench()]);
    s.tick(1500);
    await settle();
    expect(s.saves).toHaveLength(1);
    const first = s.saves[0].body.trained_on;

    // Long enough for many more debounce windows to have elapsed.
    for (let i = 0; i < 10; i++) {
      s.tick(1600);
      await settle();
    }

    expect(s.saves).toHaveLength(1);
    expect(s.saves[0].body.trained_on).toBe(first);
  });

  it('keeps the same date across later edits', async () => {
    const s = mountNewScreen();
    s.setGroups([bench()]);
    s.tick(1500);
    await settle();

    s.typeMemo('追記');
    s.tick(1500);
    await settle();

    expect(s.saves).toHaveLength(2);
    expect(s.saves[1].body.trained_on).toBe(s.saves[0].body.trained_on);
  });

  it('uses the date that was tapped on the calendar', async () => {
    const s = mountNewScreen('2026-08-20');
    s.setGroups([bench()]);
    s.tick(1500);
    await settle();
    expect(s.saves[0].body.trained_on).toBe(new Date('2026-08-20').toISOString());
  });
});

describe('new screen — creating once, then updating', () => {
  it('creates on the first write and updates after that', async () => {
    const s = mountNewScreen('2026-08-29');
    s.setGroups([bench()]);
    s.tick(1500);
    await settle();

    s.typeMemo('あとから追記');
    s.tick(1500);
    await settle();

    s.setGroups([{ ...bench(), rows: [row('65', '8')] }]);
    s.tick(1500);
    await settle();

    expect(s.saves.map((w) => w.method)).toEqual(['POST', 'PUT', 'PUT']);
  });
});

describe('edit screen', () => {
  const loaded = () => ({
    trained_on: '2026-08-29T09:00:00+09:00',
    memo: '元のメモ',
    groups: [bench()],
  });

  it('saves an edit made after the record has loaded', async () => {
    const s = mountEditScreen(loaded());
    s.tick(1500);
    await settle();
    const afterLoad = s.saves.length;

    s.typeMemo('書き換えた');
    s.tick(1500);
    await settle();

    expect(s.saves.length).toBeGreaterThan(afterLoad);
    expect(s.saves[s.saves.length - 1].memo).toBe('書き換えた');
  });

  // Reported as "editing something already saved does not save". Removing the last
  // exercise made the form fail the "has a named exercise" test, so the deletion was never
  // written and came back on the next launch.
  it('saves the removal of the last exercise', async () => {
    const s = mountEditScreen(loaded());
    s.tick(1500);
    await settle();

    s.setGroups([]);
    s.tick(1500);
    await settle();

    expect(s.saves[s.saves.length - 1].sets).toEqual([]);
  });

  it('saves a second and third edit, not only the first', async () => {
    const s = mountEditScreen(loaded());
    s.tick(1500);
    await settle();

    for (const memo of ['1', '2', '3']) {
      s.typeMemo(memo);
      s.tick(1500);
      await settle();
    }

    expect(s.saves.slice(-3).map((w) => w.memo)).toEqual(['1', '2', '3']);
  });

  it('writes an edit that is still pending when the screen closes', async () => {
    const s = mountEditScreen(loaded());
    s.tick(1500);
    await settle();

    s.typeMemo('戻る直前に打った');
    s.tick(100);
    s.unmount();
    await settle();

    expect(s.saves[s.saves.length - 1].memo).toBe('戻る直前に打った');
  });

  it('never writes the empty form that is on screen before the record arrives', async () => {
    const saves: unknown[] = [];
    function Screen({ data }: { data: undefined }) {
      const [memo] = useState('');
      const [groups] = useState<ExerciseGroup[]>([]);
      useAutosave({
        value: buildWorkoutPayload(data ?? '', memo, groups),
        isSavable: true,
        enabled: false,
        save: async (v) => {
          saves.push(v);
        },
      });
      return null;
    }
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<Screen data={undefined} />);
    });
    act(() => void jest.advanceTimersByTime(5000));
    act(() => tree.unmount());
    await settle();

    expect(saves).toHaveLength(0);
  });
});

describe('body part travels with the set', () => {
  // Recorded with the set rather than looked up later: the catalog it came from is editable,
  // and the same name can belong to two parts now, so the answer at save time is the only
  // one worth keeping.
  it('is written into the payload', () => {
    const sets = buildWorkoutSets([bench()]);
    expect(sets[0].body_part).toBe('胸');
  });

  // A group made before the field existed, or one whose exercise was typed rather than
  // picked. Empty means unclassified, which the backfill can still fix later; inventing a
  // part here would make it look answered.
  it('is empty when the group carries none', () => {
    const sets = buildWorkoutSets([
      { id: '1', exercise_name: 'ベンチプレス', rows: [row('60', '10')] },
    ]);
    expect(sets[0].body_part).toBe('');
  });

  it('keeps two same-named exercises apart in one workout', () => {
    const sets = buildWorkoutSets([
      { id: '1', exercise_name: 'プルオーバー', body_part: '胸', rows: [row('20', '12')] },
      { id: '2', exercise_name: 'プルオーバー', body_part: '背中', rows: [row('20', '12')] },
    ]);
    expect(sets.map((s) => s.body_part)).toEqual(['胸', '背中']);
  });
});
