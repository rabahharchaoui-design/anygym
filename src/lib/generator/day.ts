// One day from a slot template, for a Quick workout (PLAN 3.5a).
import { heaviestOf, isCompound, orderUnits, type Muscle } from '../order';
import type { Pattern } from '../swap';
import { FOCUS_RULES, MIN_MOVES, movesFor, type Range, type Slot } from '../generatorRules';
import { contextOf } from './context';
import { unitOf } from './pairs';
import { fill } from './pick';
import { prescribe } from './prescribe';
import { minutesOf, trim } from './trim';
import type { Day, GeneratorDeps, GeneratorInput, Item } from './types';

/** One day's item as the Quick workout holds it (PLAN 3.5a). */
export type DayItem = { id: string; pattern: Pattern; sets: number; reps?: Range; seconds?: Range; restSec: number; eachSide?: true; compound: boolean };

export type DayResult = { ok: true; name: string; items: DayItem[]; minutes: number; over: boolean } | { ok: false; name: string; moves: number };

/**
 * PLAN 3.5a: one day from a slot template, for a Quick workout. The plan's own rules: the slots
 * filled the same way (gear, never, go easy on, loved, soft dislikes, style, `usable`), the same
 * prescriptions, SPEC 22 order and the SPEC 7.4 trim to the minutes. Straight sets only (a quick
 * workout has no pairs) and no finisher. Fewer than 3 moves is an honest failure.
 */
export function generateDay(input: GeneratorInput, deps: GeneratorDeps, template: { name: string; slots: readonly Slot[]; want?: number }): DayResult {
  const ctx = contextOf(input, deps);
  // PLAN 3.5b: Quick workout's styles ask for G's move counts themselves (and fit the time with
  // supersets and rest, lib/quickStyles.ts), so they pass `want` and no minutes (no plan trim).
  const want = template.want ?? movesFor(input.minutes);
  const dayKeys = new Set<string>();
  const items: Item[] = [];
  for (const slot of template.slots) {
    if (items.length >= want) break;
    const it = fill(ctx, slot, dayKeys, new Set(items.map((x) => x.pattern)));
    if (it) items.push(it);
  }
  if (items.length < MIN_MOVES) return { ok: false, name: template.name, moves: items.length };
  const lead = heaviestOf(items.map((it) => it.profile));
  for (const it of items) prescribe(ctx, it, it.profile.id === lead?.id);
  const focusMuscles: Muscle[] = (input.focus ?? []).flatMap((f) => (f === 'balance' ? [] : FOCUS_RULES[f].muscles));
  const d: Day = { name: template.name, items, units: orderUnits(items.map((it) => unitOf([it])), { focus: focusMuscles }).map((u) => u.ref) };
  trim(d, input.minutes);
  const minutes = minutesOf(d);
  const out: DayItem[] = d.units.flat().map((it) => ({
    id: it.id,
    pattern: it.pattern,
    sets: it.sets,
    ...(it.reps ? { reps: it.reps } : {}),
    ...(it.seconds ? { seconds: it.seconds } : {}),
    restSec: it.rest,
    ...(it.candidate.eachSide ? { eachSide: true as const } : {}),
    compound: isCompound(it.profile),
  }));
  return { ok: true, name: template.name, items: out, minutes, over: input.minutes !== undefined && input.minutes < 75 && minutes > input.minutes };
}
