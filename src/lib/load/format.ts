// Display (the only rounding): amounts, weights, totals and the math line.
import type { Collars, Unit } from '../../db/types';
import { sumLoad } from './sum';
import { convertForGym, otherUnit } from './units';

// ---------------------------------------------------------------- display (the only rounding)

/**
 * Display rule (SPEC 5.4), same for kg and lb:
 * - A value that is exact to 2 decimals (every real plate, bar, dumbbell and stack weight) is
 *   shown exactly with trailing zeros dropped: 60, 102.5, 132.5, 1.25. A real weight is never
 *   rounded into a different number.
 * - Anything else (a converted value) is rounded to 1 decimal, dropping ".0": 44.1, 146.
 */
export function formatAmount(value: number): string {
  const hundredths = value * 100;
  const exact = Math.abs(hundredths - Math.round(hundredths)) < 1e-6;
  const text = exact ? (Math.round(hundredths) / 100).toString() : value.toFixed(1).replace(/\.0$/, '');
  return text === '-0' ? '0' : text;
}

/** "185 lb", "102.5 kg". */
export function formatWeight(value: number, unit: Unit): string {
  return `${formatAmount(value)} ${unit}`;
}

/**
 * The small math line under the total (SPEC 5.3), e.g.
 *   45 bar + 2 × (45 + 25) = 185 lb
 *   20 bar + 2 × (20 + 5) + 5 collars = 75 kg
 *   2 × 45 + bar                 (bar weight not known yet)
 *   20 bar + 2 × 20 + 3 other = 63 kg   (an older record's gap, see otherOf)
 * A base of 0 (plates only) is left out. `baseLabel` names the base ("bar", or e.g. "start" on a
 * plate loaded machine).
 */
export function formatMathLine(
  bar: number | null,
  perSide: readonly number[],
  collars: Collars,
  unit: Unit,
  baseLabel = 'bar',
  other = 0,
): string {
  const { total, collarsTotal } = sumLoad({ bar, perSide, collars, unit, other });
  const parts: string[] = [];
  if (bar !== null && bar !== 0) parts.push(`${formatAmount(bar)} ${baseLabel}`);
  if (perSide.length === 1) parts.push(`2 × ${formatAmount(perSide[0]!)}`);
  if (perSide.length > 1) parts.push(`2 × (${perSide.map(formatAmount).join(' + ')})`);
  if (collarsTotal) parts.push(`${formatAmount(collarsTotal)} collars`);
  if (total === null) return [...parts, baseLabel].join(' + ');
  let left = parts.length ? parts.join(' + ') : `0 ${baseLabel}`;
  if (other > 0) left += ` + ${formatAmount(other)} other`;
  if (other < 0) left += ` − ${formatAmount(-other)} other`;
  return `${left} = ${formatWeight(total, unit)}`;
}

// One set in words (formatSet, formatSession): src/lib/setWords.ts (Session 2 gate B1).

/** "about 20.4 kg": a weight shown in the other unit (display only, never stored). */
export function formatInOther(value: number, unit: Unit): string {
  const to = otherUnit(unit);
  return `about ${formatWeight(convertForGym(value, unit, to), to)}`;
}

/** "4,350 lb", "1,234.5 kg": formatAmount with thousands separators. */
export function formatTotal(value: number, unit: Unit): string {
  const [whole, frac] = formatAmount(value).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${frac ? `${grouped}.${frac}` : grouped} ${unit}`;
}

/**
 * A total for a tight place (the Total lifted tile, the first workout's hero): "4,350 lb" up to
 * 999,999, then a short form that never claims more than was lifted (cut, not rounded): "1.23M lb",
 * "12.3M lb", "123M lb", "1.23B lb". Three digits are kept, so it stays within about 8 characters.
 */
export function formatTotalCompact(value: number, unit: Unit): string {
  if (!(value >= 1_000_000)) return formatTotal(value, unit);
  const [div, suffix] = value >= 1_000_000_000 ? [1_000_000_000, 'B'] : [1_000_000, 'M'];
  const scaled = value / div;
  const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const cut = Math.floor(scaled * 10 ** decimals + 1e-9) / 10 ** decimals;
  const text = cut.toFixed(decimals);
  return `${decimals ? text.replace(/\.?0+$/, '') : text}${suffix} ${unit}`;
}
