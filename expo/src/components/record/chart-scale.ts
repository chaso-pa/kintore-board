/**
 * Pure geometry and display-state helpers for the exercise chart.
 *
 * Deliberately free of React and react-native imports so the branching rules can be
 * tested directly. The display-state rules in particular went through several wrong
 * versions during review, so they live here as executable spec rather than prose.
 */

export type MetricType = 'e1rm' | 'max_weight' | 'total_volume' | 'max_reps';
export type Period = '3m' | '6m' | '1y' | 'all';
export type ChartMode = 'weight' | 'reps';

export interface ExerciseHistorySet {
  workout_id: string;
  weight: number;
  reps: number;
  sets: number;
  spotted: boolean;
  memo: string;
}

export interface ExerciseHistoryPoint {
  date: string;
  workout_ids: string[];
  e1rm: number;
  max_weight: number;
  total_volume: number;
  max_reps: number;
  sets: ExerciseHistorySet[];
}

export interface Size {
  width: number;
  height: number;
}

export interface PlottedPoint {
  x: number;
  y: number;
  point: ExerciseHistoryPoint;
}

export interface ChartGeometry {
  plotted: PlottedPoint[];
  min: number;
  max: number;
}

export interface DisplayState {
  mode: ChartMode;
  drawable: ExerciseHistoryPoint[];
  isEmpty: boolean;
}

const PERIOD_MONTHS: Record<Exclude<Period, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };

export function metricValue(point: ExerciseHistoryPoint, metric: MetricType): number {
  switch (metric) {
    case 'e1rm':
      return point.e1rm;
    case 'max_weight':
      return point.max_weight;
    case 'total_volume':
      return point.total_volume;
    case 'max_reps':
      return point.max_reps;
  }
}

export function filterByPeriod(
  points: ExerciseHistoryPoint[],
  period: Period,
  now: Date = new Date()
): ExerciseHistoryPoint[] {
  if (period === 'all') return points;

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - PERIOD_MONTHS[period]);
  const key = cutoff.toISOString().slice(0, 10);

  return points.filter((p) => p.date >= key);
}

/**
 * Decides what the chart shows. The order matters:
 *
 *  1. mode comes from has_weight_data, which is a property of the *exercise* across its
 *     whole history — not of the visible window. Deciding it from the window would flip a
 *     barbell exercise into bodyweight mode whenever the selected period happens to be
 *     empty.
 *  2. the drawable set is filtered only in weight mode. Bodyweight mode plots max_reps,
 *     so filtering on max_weight there would leave every bodyweight chart empty.
 *  3. emptiness is judged last, on what will actually be drawn.
 */
export function deriveDisplayState(
  points: ExerciseHistoryPoint[],
  hasWeightData: boolean,
  period: Period,
  now: Date = new Date()
): DisplayState {
  const mode: ChartMode = hasWeightData ? 'weight' : 'reps';
  const inWindow = filterByPeriod(points, period, now);
  const drawable = mode === 'weight' ? inWindow.filter((p) => p.max_weight > 0) : inWindow;

  return { mode, drawable, isEmpty: drawable.length === 0 };
}

/**
 * Maps points onto SVG coordinates. Y is flipped so larger values sit higher.
 *
 * Two degenerate inputs have to be handled explicitly: a single point has no horizontal
 * span to divide by, and a flat series has no vertical span. Both would otherwise produce
 * NaN coordinates and a blank chart with no error.
 */
export function buildChartGeometry(
  points: ExerciseHistoryPoint[],
  metric: MetricType,
  size: Size
): ChartGeometry {
  if (points.length === 0) return { plotted: [], min: 0, max: 0 };

  const values = points.map((p) => metricValue(p, metric));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const plotted = points.map((point, i) => ({
    x: points.length === 1 ? size.width / 2 : (i / (points.length - 1)) * size.width,
    y: span === 0 ? size.height / 2 : size.height - ((values[i] - min) / span) * size.height,
    point,
  }));

  return { plotted, min, max };
}

export function formatMetric(value: number, metric: MetricType): string {
  if (metric === 'max_reps') return `${value}回`;
  if (metric === 'total_volume') return `${Math.round(value).toLocaleString()}kg`;
  return `${value.toFixed(1)}kg`;
}
