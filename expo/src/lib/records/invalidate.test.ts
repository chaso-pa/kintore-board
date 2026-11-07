import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { invalidateAfterSave, invalidateAllRecords, invalidateExercises } from '@/lib/records/invalidate';

const k = queryKeys.records;
const O = 'u1';

const clients: QueryClient[] = [];
afterEach(() => {
  while (clients.length) clients.pop()!.clear();
});

/** Every records key a screen may hold, plus another owner's copy of a few. */
const ALL: Record<string, readonly unknown[]> = {
  detailW1: k.detail(O, 'w1'),
  detailW2: k.detail(O, 'w2'),
  datesAug: k.dates(O, 2026, 8),
  datesSep: k.dates(O, 2026, 9),
  datesOct: k.dates(O, 2026, 10),
  stats: k.stats(O),
  exercises: k.exercises(O),
  historyBenchChest: k.history(O, 'bench', '胸'),
  historyBenchUnclassified: k.history(O, 'bench', ''),
  historySquat: k.history(O, 'squat', '脚'),
  historyRow: k.history(O, 'row', '背中'),
  lastBenchChest: k.lastSets(O, 'bench', '胸'),
  lastSquat: k.lastSets(O, 'squat', '脚'),
  lastRow: k.lastSets(O, 'row', '背中'),
  maxW1BenchChest: k.maxE1RM(O, 'w1', 'bench', '胸'),
  maxW2BenchChest: k.maxE1RM(O, 'w2', 'bench', '胸'),
  maxW2Squat: k.maxE1RM(O, 'w2', 'squat', '脚'),
  maxW2Row: k.maxE1RM(O, 'w2', 'row', '背中'),
  unclassified: k.unclassified(O),
  importState: k.importState(O),
  otherDetail: k.detail('u2', 'w1'),
  otherStats: k.stats('u2'),
  otherMax: k.maxE1RM('u2', 'w2', 'bench', '胸'),
};

function run(fn: (qc: QueryClient) => void): string[] {
  const qc = new QueryClient();
  clients.push(qc);
  for (const key of Object.values(ALL)) qc.setQueryData(key, 1);
  fn(qc);
  return Object.entries(ALL)
    .filter(([, key]) => qc.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort();
}

describe('invalidateAfterSave', () => {
  it('invalidates exactly the workout, its months, stats and the entries before ∪ after', () => {
    const got = run((qc) =>
      invalidateAfterSave(qc, O, {
        workoutId: 'w1',
        // 00:30 JST on 1 Sep is 31 Aug in the server's day key: the August calendar.
        before: { trained_on: '2026-08-31T15:30:00Z', sets: [{ exercise_name: 'bench', body_part: '胸' }] },
        after: {
          trained_on: '2026-09-02T10:00:00Z',
          sets: [
            { exercise_name: 'bench', body_part: null },
            { exercise_name: 'squat', body_part: '脚' },
          ],
        },
      })
    );
    expect(got).toEqual(
      [
        'datesAug',
        'datesSep',
        'detailW1',
        'historyBenchChest',
        'historyBenchUnclassified',
        'historySquat',
        'lastBenchChest',
        'lastSquat',
        'maxW1BenchChest',
        'maxW2BenchChest',
        'maxW2Squat',
        'stats',
      ].sort()
    );
  });

  it('handles a first save (no before) and leaves the exercise list alone', () => {
    const got = run((qc) =>
      invalidateAfterSave(qc, O, {
        workoutId: 'w2',
        before: null,
        after: { trained_on: '2026-10-01T00:00:00Z', sets: [] },
      })
    );
    expect(got).toEqual(['datesOct', 'detailW2', 'stats']);
  });
});

describe('invalidateExercises', () => {
  it('invalidates only the exercise list', () => {
    expect(run((qc) => invalidateExercises(qc, O))).toEqual(['exercises']);
  });
});

describe('invalidateAllRecords', () => {
  it("invalidates every records key of the owner and none of another's", () => {
    const got = run((qc) => invalidateAllRecords(qc, O));
    expect(got).toEqual(
      Object.keys(ALL)
        .filter((n) => !n.startsWith('other'))
        .sort()
    );
  });
});
