/**
 * kg / lb.
 *
 * Every weight is stored in kg, at full precision, and converted only at the edges: when
 * a number is typed in and when one is shown. There is deliberately no lb column. Volume,
 * estimated 1RM, PRs and the charts are all computed server-side from one unit; a second
 * stored unit would mean every one of those sums had to reconcile two, and a set entered in
 * lb would compare against one entered in kg only after a conversion somebody remembered to
 * do. The column is a double, so 45 lb goes in as 20.4116… kg and comes back out as 45.
 */

export type WeightUnit = 'kg' | 'lb';

/** Exact by definition: 1 lb = 0.45359237 kg. */
const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value * KG_PER_LB : value;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg / KG_PER_LB : kg;
}

/** What the user sees. Stored and passed around as 'lb'; written "lbs", as gyms write it. */
export function unitLabel(unit: WeightUnit): string {
  return unit === 'lb' ? 'lbs' : 'kg';
}

export function otherUnit(unit: WeightUnit): WeightUnit {
  return unit === 'kg' ? 'lb' : 'kg';
}

/**
 * A stored kg weight as the text an input should start with.
 *
 * Rounded to two places so a lb view of 100 kg reads 220.46 rather than 220.4622621848776,
 * and trailing zeros dropped so 45 lb reads 45, not 45.00.
 */
export function kgToInput(kg: number, unit: WeightUnit): string {
  if (kg <= 0) return '';
  return String(Number(fromKg(kg, unit).toFixed(2)));
}

/** What the user typed, in kg. Empty or unparseable text is 0, as before. */
export function inputToKg(text: string, unit: WeightUnit): number {
  return toKg(parseFloat(text) || 0, unit);
}

/**
 * A kg weight for display: "100kg", "62.25kg", "220.5lbs".
 *
 * Trailing zeros dropped. kg keeps two places because 1.25 kg plates are real and 62.25
 * must not read as 62.3; lb keeps one, because a converted kg weight rarely lands on a round
 * number and two places would be noise on every line.
 */
export function formatWeight(kg: number, unit: WeightUnit, digits = unit === 'kg' ? 2 : 1): string {
  const value = fromKg(kg, unit);
  return `${Number(value.toFixed(digits))}${unitLabel(unit)}`;
}

/** Volume: tonnes for kg once it stops fitting, thousands for lb ("12.3k lbs"). */
export function formatVolume(kg: number, unit: WeightUnit): string {
  if (unit === 'lb') {
    const lb = fromKg(kg, 'lb');
    if (lb >= 10000) return `${(lb / 1000).toFixed(1)}k lbs`;
    return `${Math.round(lb).toLocaleString('ja-JP')}lbs`;
  }
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)}t`;
  return `${Math.round(kg).toLocaleString('ja-JP')}kg`;
}

/**
 * The same weight in the unit not being used, for the hint under an input: "≈ 220.5lbs".
 * Null for nothing entered, so an empty row does not say "≈ 0lbs".
 */
export function formatConverted(kg: number, unit: WeightUnit): string | null {
  if (kg <= 0) return null;
  return `≈ ${formatWeight(kg, otherUnit(unit))}`;
}
