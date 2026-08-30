import { estimateOneRM } from '@/utils/rm';
import { sumTotalVolume } from '@/utils/volume';

export interface SummarySetInput {
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  spotted?: boolean;
}

export interface SummarySetLine {
  /** 1-based position within the exercise, so a line can be pointed at. */
  index: number;
  /** "70kg×6回", or "自重×10回" when nothing was loaded. */
  text: string;
  spotted: boolean;
}

export interface SummaryExercise {
  name: string;
  lines: SummarySetLine[];
  bestE1rm: number | null;
  setCount: number;
}

export interface WorkoutSummary {
  exercises: SummaryExercise[];
  totalVolumeKg: number;
  totalSets: number;
}

/** 60 rather than 60.0, but 62.5 kept. Every character costs width. */
export function formatWeight(weight: number): string {
  return String(weight);
}

/**
 * One set as text.
 *
 * The units are carried even though they cost width. Without them the line reads as a row
 * of bare numbers — "12×9" gives no way to tell weight from reps, which defeats the point
 * of a card meant to be understood at a glance by someone else.
 *
 * Bodyweight work is recorded with no weight, and "0kg" reads like a mistake rather than
 * ten pull-ups.
 *
 * The × is spaced away from the units on both sides. Set tight against them it reads as
 * part of "kg", and the line turns back into one run of characters instead of two numbers
 * with an operator between them.
 */
export function formatSet(weight: number, reps: number): string {
  return weight > 0 ? `${formatWeight(weight)}kg × ${reps}回` : `自重 × ${reps}回`;
}

/**
 * Every set of one exercise, one line each.
 *
 * Identical sets are not collapsed. They are not actually identical — a set taken with a
 * spot is a different set from one taken alone, and folding "60kg×6回 3セット" would erase
 * which of the three needed help. That distinction is most of what a training log is for.
 *
 * A row that stands for several sets is expanded into that many lines, so the numbering
 * matches what was done rather than how it happens to be stored.
 */
export function buildSetLines(
  rows: { weight: number; reps: number; sets: number; spotted?: boolean }[]
): SummarySetLine[] {
  const lines: SummarySetLine[] = [];
  for (const r of rows) {
    const repeat = Math.max(r.sets, 1);
    for (let i = 0; i < repeat; i++) {
      lines.push({
        index: lines.length + 1,
        text: formatSet(r.weight, r.reps),
        spotted: r.spotted ?? false,
      });
    }
  }
  return lines;
}

/**
 * A day's sets, grouped by exercise.
 *
 * Exercises keep the order they were logged in, which is the order they were trained; a
 * summary sorted by volume would no longer read as an account of the session.
 */
export function buildWorkoutSummary(sets: SummarySetInput[]): WorkoutSummary {
  const order: string[] = [];
  const byName = new Map<string, SummarySetInput[]>();

  for (const s of sets) {
    const name = s.exercise_name.trim();
    if (!byName.has(name)) {
      order.push(name);
      byName.set(name, []);
    }
    byName.get(name)!.push(s);
  }

  const exercises = order.map((name) => {
    const rows = byName.get(name)!;
    const estimates = rows
      .map((r) => estimateOneRM(r.weight, r.reps))
      .filter((e): e is number => e !== null);
    const lines = buildSetLines(rows);
    return {
      name,
      lines,
      // The best set of the day, not the last or the heaviest: a heavy single and a lighter
      // set for more reps can be the same effort, and the estimate is what compares them.
      bestE1rm: estimates.length > 0 ? Math.max(...estimates) : null,
      setCount: lines.length,
    };
  });

  return {
    exercises,
    totalVolumeKg: sumTotalVolume(sets),
    totalSets: exercises.reduce((acc, e) => acc + e.setCount, 0),
  };
}

/**
 * Whether today's best beats everything that came before it.
 *
 * `previousBest` is the best estimate for this exercise across every other workout, so
 * undefined means it has not been fetched yet — not that there is nothing to beat. Claiming
 * a record before the comparison has loaded would put a badge on the image that disappears
 * a second later, so an unknown history is never a record.
 *
 * A first-ever session has no previous best and does count: it is the best there is.
 *
 * The comparison is strict. Repeating a session exactly is not a new record, and calling it
 * one would make the badge mean nothing.
 */
export function isPersonalRecord(
  bestE1rm: number | null,
  previousBest: number | null | undefined
): boolean {
  // No estimate at all — bodyweight work, or reps past the formula's usable range. There is
  // nothing to compare.
  if (bestE1rm === null) return false;
  if (previousBest === undefined) return false;
  if (previousBest === null || previousBest <= 0) return true;
  return bestE1rm > previousBest;
}

/** Volume for the card: tonnes once the number stops fitting comfortably. */
export function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)}t`;
  return `${Math.round(kg).toLocaleString('ja-JP')}kg`;
}
