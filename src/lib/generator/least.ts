// PLAN 3.6g2, more buys more: what the same answers get with one day fewer and with the next
// shorter session, so the plan for a bigger choice is brought to at least that: Mobility's stretch
// minutes, and a single pick's hard sets (lib/plan/focusHand.ts). Pure: the builder is passed in.
// The smaller plans are built once and remembered by their answers.
import type { FocusPickId } from '../intake/options';
import type { GeneratorDeps, GeneratorInput, GeneratorResult } from './types';

export type FocusLeast = { stretch?: number; sets?: number };

/** The choices the promise covers (the ones a plan for a week is made of): each looks one step down. */
const DAYS = [3, 4, 5, 6], MINUTES = [45, 60, 75];
const KEPT = 200;
const memo = new WeakMap<GeneratorDeps, Map<string, FocusLeast>>();

const gotOf = (r: GeneratorResult, single: FocusPickId | undefined): FocusLeast => {
  const ps = r.ok ? r.applied.focusReport?.priorities ?? [] : [];
  return { stretch: ps.find((p) => p.id === 'mobility')?.minutes ?? 0, sets: ps.find((p) => p.id === single)?.total ?? 0 };
};

/**
 * The most of the plans one step smaller (a day fewer; the next shorter session). Undefined when
 * there is nothing to hold (no Mobility and not exactly one other pick) or no smaller choice inside
 * the promise.
 */
export function focusLeast(input: GeneratorInput, deps: GeneratorDeps, picks: readonly FocusPickId[], build: (input: GeneratorInput) => GeneratorResult): FocusLeast | undefined {
  const d = DAYS.indexOf(input.days ?? 3), m = MINUTES.indexOf(input.minutes ?? -1);
  const hard = picks.filter((p) => p !== 'mobility' && p !== 'balance');
  const single = hard.length === 1 ? hard[0] : undefined;
  if ((!picks.includes('mobility') && !single) || d < 0 || m < 0 || d + m === 0) return undefined;
  const cache = memo.get(deps) ?? new Map<string, FocusLeast>();
  memo.set(deps, cache);
  // What is approved on this phone can change between two builds, so it is part of the key.
  const phone = JSON.stringify([deps.focusLifts?.() ?? [], deps.cardio?.() ?? []]);
  const smaller = [...(d > 0 ? [{ ...input, days: DAYS[d - 1]! }] : []), ...(m > 0 ? [{ ...input, minutes: MINUTES[m - 1]! }] : [])].map((step) => {
    const key = `${JSON.stringify(step)}|${phone}`;
    if (!cache.has(key)) { if (cache.size >= KEPT) cache.clear(); cache.set(key, gotOf(build(step), single)); }
    return cache.get(key)!;
  });
  return { stretch: Math.max(...smaller.map((x) => x.stretch ?? 0)), sets: Math.max(...smaller.map((x) => x.sets ?? 0)) };
}
