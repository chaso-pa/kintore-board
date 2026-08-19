import {
  buildChartGeometry,
  deriveDisplayState,
  filterByPeriod,
  metricValue,
  type ExerciseHistoryPoint,
  type Period,
} from '@/components/record/chart-scale';

const NOW = new Date('2026-08-20T00:00:00Z');

function point(date: string, over: Partial<ExerciseHistoryPoint> = {}): ExerciseHistoryPoint {
  return {
    date,
    workout_ids: ['w1'],
    e1rm: 0,
    max_weight: 0,
    total_volume: 0,
    max_reps: 0,
    sets: [],
    ...over,
  };
}

const weighted = (date: string, weight: number) =>
  point(date, { max_weight: weight, e1rm: weight * 1.1, total_volume: weight * 25, max_reps: 5 });

const bodyweight = (date: string, reps: number) => point(date, { max_reps: reps });

describe('deriveDisplayState', () => {
  // This is the coverage table from the plan, kept executable. The ordering of the three
  // rules was wrong twice during review; cases A and C are the ones that caught it.
  const cases: {
    name: string;
    points: ExerciseHistoryPoint[];
    hasWeightData: boolean;
    period: Period;
    wantMode: 'weight' | 'reps';
    wantDrawable: number;
    wantEmpty: boolean;
  }[] = [
    {
      name: 'A: weighted sets only a year ago, recent window is bodyweight only',
      points: [weighted('2025-08-01', 100), bodyweight('2026-08-10', 12)],
      hasWeightData: true,
      period: '3m',
      wantMode: 'weight',
      wantDrawable: 0,
      wantEmpty: true,
    },
    {
      name: 'B: barbell exercise with nothing recorded in the window',
      points: [weighted('2025-01-01', 100)],
      hasWeightData: true,
      period: '3m',
      wantMode: 'weight',
      wantDrawable: 0,
      wantEmpty: true,
    },
    {
      name: 'C: pure bodyweight exercise keeps every point',
      points: [bodyweight('2026-08-01', 8), bodyweight('2026-08-15', 12)],
      hasWeightData: false,
      period: '3m',
      wantMode: 'reps',
      wantDrawable: 2,
      wantEmpty: false,
    },
    {
      name: 'D: weighted points inside the window',
      points: [weighted('2026-08-01', 95), weighted('2026-08-15', 100)],
      hasWeightData: true,
      period: '3m',
      wantMode: 'weight',
      wantDrawable: 2,
      wantEmpty: false,
    },
    {
      name: 'E: mixed exercise plots only the weighted days',
      points: [weighted('2026-08-01', 95), bodyweight('2026-08-10', 20), weighted('2026-08-15', 100)],
      hasWeightData: true,
      period: '3m',
      wantMode: 'weight',
      wantDrawable: 2,
      wantEmpty: false,
    },
  ];

  it.each(cases)('$name', (c) => {
    const got = deriveDisplayState(c.points, c.hasWeightData, c.period, NOW);
    expect({ mode: got.mode, drawable: got.drawable.length, isEmpty: got.isEmpty }).toEqual({
      mode: c.wantMode,
      drawable: c.wantDrawable,
      isEmpty: c.wantEmpty,
    });
  });

  it('never drops bodyweight points in reps mode, whatever the max_weight is', () => {
    const got = deriveDisplayState([bodyweight('2026-08-01', 8)], false, 'all', NOW);
    expect(got.drawable).toHaveLength(1);
    expect(got.isEmpty).toBe(false);
  });
});

describe('filterByPeriod', () => {
  // Each point sits in exactly one band relative to NOW (2026-08-20), so a wrong cutoff
  // shows up as an off-by-one count rather than passing by luck.
  const points = [
    point('2024-01-01'), // older than a year
    point('2025-10-01'), // within a year, outside six months
    point('2026-05-01'), // within six months, outside three
    point('2026-08-01'), // within three months
  ];

  it.each([
    ['3m' as Period, 1],
    ['6m' as Period, 2],
    ['1y' as Period, 3],
    ['all' as Period, 4],
  ])('%s keeps %i points', (period, want) => {
    expect(filterByPeriod(points, period, NOW)).toHaveLength(want);
  });
});

describe('buildChartGeometry', () => {
  const size = { width: 300, height: 100 };

  it('returns nothing for an empty series without throwing', () => {
    expect(buildChartGeometry([], 'e1rm', size)).toEqual({ plotted: [], min: 0, max: 0 });
  });

  it('centres a single point and keeps coordinates finite', () => {
    const g = buildChartGeometry([weighted('2026-08-01', 100)], 'max_weight', size);
    expect(g.plotted).toHaveLength(1);
    expect(g.plotted[0].x).toBe(150);
    expect(Number.isFinite(g.plotted[0].y)).toBe(true);
  });

  it('does not divide by zero when every value is identical', () => {
    const g = buildChartGeometry(
      [weighted('2026-08-01', 100), weighted('2026-08-08', 100)],
      'max_weight',
      size
    );
    expect(g.plotted.every((p) => Number.isFinite(p.y))).toBe(true);
    expect(g.min).toBe(g.max);
  });

  it('puts the largest value at the top and spans the full width', () => {
    const g = buildChartGeometry(
      [weighted('2026-08-01', 90), weighted('2026-08-08', 110)],
      'max_weight',
      size
    );
    expect(g.plotted[0]).toMatchObject({ x: 0, y: 100 });
    expect(g.plotted[1]).toMatchObject({ x: 300, y: 0 });
  });
});

describe('metricValue', () => {
  it('reads each metric off the point', () => {
    const p = point('2026-08-01', { e1rm: 1, max_weight: 2, total_volume: 3, max_reps: 4 });
    expect([
      metricValue(p, 'e1rm'),
      metricValue(p, 'max_weight'),
      metricValue(p, 'total_volume'),
      metricValue(p, 'max_reps'),
    ]).toEqual([1, 2, 3, 4]);
  });
});
