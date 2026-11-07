/**
 * Record screens never wait on the network (plan §1 principle 1, R10).
 *
 * `@/lib/api` is mocked twice over — every call rejects, and every call hangs forever — and
 * each record screen is rendered against a sql.js records DB. Both must render their
 * content with no spinner left, without calling the API at all.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ActivityIndicator, Alert, Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createSqlJsDriver } from '@/lib/records/__testutils__/sqljs-driver';
import { trainedOnForDateString } from '@/lib/records/date-key';
import { useImportStatusStore } from '@/lib/records/import-state';
import { runMigrations } from '@/lib/records/migrations';
import { useRecordsStore } from '@/lib/records/records-store';
import { createRepository, type RecordsRepository } from '@/lib/records/repository';

let mockMode: 'reject' | 'hang' = 'reject';
const mockApiCalls: string[] = [];
jest.mock('@/lib/api', () => {
  const call = (method: string) =>
    jest.fn((url: string) => {
      mockApiCalls.push(`${method} ${url}`);
      return mockMode === 'reject' ? Promise.reject(new Error('Network Error')) : new Promise(() => {});
    });
  return { api: { get: call('GET'), post: call('POST'), put: call('PUT'), delete: call('DELETE'), patch: call('PATCH') } };
});

let mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(), deleteDatabaseAsync: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
  File: class {
    exists = false;
    create() {}
    write() {}
    async text() {
      return '';
    }
  },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('react-native-calendars', () => {
  const { View } = jest.requireActual('react-native');
  return { Calendar: () => <View />, LocaleConfig: { locales: {}, defaultLocale: '' } };
});
jest.mock('@/components/KeyboardLift', () => {
  const { View } = jest.requireActual('react-native');
  return { KeyboardLift: View };
});
jest.mock('@/components/record/ExerciseChart', () => ({ ExerciseChart: () => null }));
jest.mock('@/components/record/ExerciseSelectModal', () => ({ ExerciseSelectModal: () => null }));

/* eslint-disable import/first */
import RecordTab from '@/app/(tabs)/record/index';
import WorkoutDetail from '@/app/record/[workoutId]';
import EditWorkout from '@/app/record/edit/[workoutId]';
import ExerciseHistory from '@/app/record/exercise/[name]';
import NewWorkout from '@/app/record/new';
/* eslint-enable import/first */

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const bench = (weight: number, reps: number) => ({
  exercise_name: 'ベンチプレス',
  weight,
  reps,
  sets: 1,
  memo: null,
  spotted: false,
  body_part: '胸',
});

let repo: RecordsRepository;
let qc: QueryClient;
let tree: ReactTestRenderer | null = null;

async function openRepo(importState: 'done' | 'pending', withToday = true) {
  const driver = await createSqlJsDriver();
  await runMigrations(driver);
  repo = createRepository(driver);
  await repo.setMeta('import_state', importState);
  await repo.saveWorkout('w0', { trained_on: '2026-01-05T00:00:00.000Z', memo: null, sets: [bench(80, 5)] });
  if (withToday) {
    await repo.saveWorkout('w1', { trained_on: trainedOnForDateString(today), memo: '胸の日', sets: [bench(90, 5)] });
  }
  useRecordsStore.setState({ repo, ownerUserId: 'u1', status: 'open' });
}

const settle = () =>
  act(async () => {
    // TanStack notifies observers on a setTimeout(0), so let timers run too.
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  });

async function render(el: ReactElement) {
  await act(async () => {
    tree = create(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
  });
  await settle();
  return tree!;
}

function texts(t: ReactTestRenderer): string {
  return t.root
    .findAllByType(Text)
    .map((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .join('\n');
}

function expectSettled(t: ReactTestRenderer) {
  expect(t.root.findAllByType(ActivityIndicator).length).toBe(0);
  expect(mockApiCalls).toEqual([]);
}

function pressText(t: ReactTestRenderer, label: string) {
  const node = t.root.findAll((n) => typeof n.props.onPress === 'function' && texts({ root: n } as never).includes(label))[0];
  if (!node) throw new Error(`No pressable with ${label}`);
  return act(async () => {
    await node.props.onPress();
  });
}

beforeEach(() => {
  mockApiCalls.length = 0;
  mockParams = {};
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  useImportStatusStore.setState({ importState: null, importCount: 0 });
});

afterEach(async () => {
  if (tree) {
    const t = tree;
    tree = null;
    await act(async () => t.unmount());
  }
  qc.clear();
  await repo?.close();
  useRecordsStore.setState({ repo: null, ownerUserId: null, status: 'closed' });
});

describe.each(['reject', 'hang'] as const)('with the API set to %s', (mode) => {
  beforeEach(() => {
    mockMode = mode;
  });

  it('renders the record tab from the local DB', async () => {
    await openRepo('done');
    const t = await render(<RecordTab />);
    expectSettled(t);
    const s = texts(t);
    expect(s).toContain('2回');
    expect(s).toContain('ベンチプレス');
    expect(s).toContain('1種目の記録があります');
  });

  it('renders a workout detail with its PR badge', async () => {
    await openRepo('done');
    mockParams = { workoutId: 'w1' };
    const t = await render(<WorkoutDetail />);
    expectSettled(t);
    expect(texts(t)).toContain('ベンチプレス ›');
    expect(texts(t)).toContain('PR!!');
  });

  it('opens the editor with the stored workout', async () => {
    await openRepo('done');
    mockParams = { workoutId: 'w1' };
    const t = await render(<EditWorkout />);
    expectSettled(t);
    expect(texts(t)).toContain('記録を編集');
    expect(texts(t)).toContain('ベンチプレス');
  });

  it('saves a new workout locally on the way out', async () => {
    await openRepo('done', false);
    mockParams = { date: today };
    const t = await render(<NewWorkout />);
    expectSettled(t);
    const memo = t.root.findAllByType(TextInput).find((n) => n.props.placeholder === 'ワークアウトメモ（任意）')!;
    await act(async () => memo.props.onChangeText('オフライン'));
    await act(async () => t.unmount());
    tree = null;
    await settle();
    const rows = await repo.getAllWorkoutRows();
    expect(rows.map((r) => r.memo)).toContain('オフライン');
    expect(mockApiCalls).toEqual([]);
  });

  it('renders an exercise history', async () => {
    await openRepo('done');
    mockParams = { name: 'ベンチプレス', bodyPart: '胸' };
    const t = await render(<ExerciseHistory />);
    expectSettled(t);
    expect(texts(t)).toContain('ベンチプレス');
  });
});

describe('import not done', () => {
  beforeEach(() => {
    mockMode = 'hang';
  });

  it('hides PR badges until the import is done', async () => {
    await openRepo('pending');
    mockParams = { workoutId: 'w1' };
    const t = await render(<WorkoutDetail />);
    expectSettled(t);
    expect(texts(t)).toContain('ベンチプレス ›');
    expect(texts(t)).not.toContain('PR!!');
  });

  it('refuses to start a record on a day not yet imported', async () => {
    await openRepo('pending', false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await render(<RecordTab />);
    await pressText(t, '+ 追加');
    await settle();
    expect(alert).toHaveBeenCalledWith('この日の記録を取り込み中です', expect.any(String));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('tombstones the workout and goes back', async () => {
    mockMode = 'reject';
    await openRepo('done');
    mockParams = { workoutId: 'w1' };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const t = await render(<WorkoutDetail />);
    await pressText(t, '削除');
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === '削除')!.onPress!();
    });
    expect(await repo.getWorkout('w1')).toBeNull();
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockApiCalls).toEqual([]);
  });
});
