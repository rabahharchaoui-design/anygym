// Builds the whole plan, or says plainly which day cannot be built here.
import { heaviestOf, orderUnits, type Muscle } from '../order';
import type { FocusId } from '../intake/options';
import { workoutIdOf, type Pattern } from '../swap';
import { FAMILY_OF, FOCUS_RULES, MIN_MOVES, movesFor, PRESCRIPTION, splitFor, type Slot } from '../generatorRules';
import { contextOf } from './context';
import { addMoves, densify, fillUp } from './fit';
import { WARM_UP_SEC, finisherFor, warmUpFor } from './finisher';
import { applyFocus } from './focus';
import { pairUp, splitUnequalPairs, unitOf } from './pairs';
import { fill } from './pick';
import { alsoChanges, prescribe } from './prescribe';
import { GYM_TYPE, hashText, rawBlock } from './raw';
import { minutesOf, trim } from './trim';
import { GENERATOR_VERSION, type Applied, type Day, type GeneratorDeps, type GeneratorInput, type GeneratorResult, type Item, type RawDay, type RawPlan, type RawSingle } from './types';

/** Builds the plan, or says plainly which day cannot be built here. */
export function generatePlan(input: GeneratorInput, deps: GeneratorDeps): GeneratorResult {
  const daysPerWeek = input.days !== undefined && Number.isInteger(input.days) && input.days >= 2 && input.days <= 6 ? input.days : 3;
  const key = (id: string) => deps.data.sameAs(id);
  const ctx = contextOf(input, deps);
  const { main, also } = ctx;
  const split = splitFor(daysPerWeek);
  const want = movesFor(input.minutes);
  const gaps = new Set<Pattern>();

  const days: Day[] = [];
  const templates: Slot[][] = [];
  for (const t of split.days) {
    templates.push(t.slots);
    const dayKeys = new Set<string>();
    const items: Item[] = [];
    for (const slot of t.slots) {
      if (items.length >= want) break;
      const it = fill(ctx, slot, dayKeys, new Set(items.map((x) => x.pattern)));
      if (it) items.push(it);
      else gaps.add(slot.pattern);
    }
    if (items.length < MIN_MOVES) {
      return { ok: false, reason: `Not enough moves fit your equipment for ${t.name}: ${items.length} of ${MIN_MOVES}.`, dayName: t.name, moves: items.length, gaps: [...gaps] };
    }
    // The day's heaviest lift comes first (SPEC 22 rule 1): an Also strength goal trains it heavy.
    const lead = heaviestOf(items.map((it) => it.profile));
    for (const it of items) prescribe(ctx, it, it.profile.id === lead?.id);
    days.push({ name: t.name, items, units: [] });
  }

  applyFocus(ctx, days);

  const focusMuscles: Muscle[] = (input.focus ?? []).flatMap((f) => (f === 'balance' ? [] : FOCUS_RULES[f].muscles));
  const finisher = finisherFor(ctx);
  const warmUp = warmUpFor(ctx, finisher);
  const strength = FAMILY_OF[main] === 'strength';
  for (const [i, d] of days.entries()) {
    const ordered = orderUnits(d.items.map((it) => unitOf([it])), { focus: focusMuscles }).map((u) => u.ref);
    d.units = strength ? ordered : pairUp(ordered, d.items);
    if (finisher) d.finisher = finisher;
    if (warmUp) d.warmUp = warmUp;
    trim(d, input.minutes, !strength, strength ? undefined : PRESCRIPTION[ctx.family].compoundRest);
    d.units = splitUnequalPairs(d.units);
    if (!strength) d.units = pairUp(d.units, d.items);
    addMoves(ctx, d, templates[i]!, input.minutes);
    if (!strength) densify(ctx, d, templates[i]!, input.minutes);
    fillUp(ctx, d, input.minutes);
  }

  const kept = days.flatMap((d) => d.units.flat());
  const focus: Applied['focus'] = [];
  const focusMissed: FocusId[] = [];
  for (const f of input.focus ?? []) {
    if (f === 'balance') continue;
    const sets = kept.filter((it) => it.focus === f).reduce((n, it) => n + it.extra, 0);
    if (sets >= 2) focus.push({ id: f, sets });
    else focusMissed.push(f);
  }
  const keptKeys = new Set(kept.map((it) => it.key));
  const loved = (input.love ?? []).filter((id) => keptKeys.has(key(id)) && ctx.loveKeys.has(key(id)));
  const lovedMissed = (input.love ?? []).filter((id) => !loved.includes(id));
  const ladderKeys = new Set(Object.values(deps.data.patterns).flatMap((l) => l.candidates.map((c) => key(workoutIdOf(c)))));
  const minutes = days.map(minutesOf);
  const level = input.experience === 'new' || input.experience === 'months' ? 'beginner' : 'intermediate';

  const rawDays: RawDay[] = days.map((d, i) => {
    const head: RawSingle[] = d.warmUp ? [{ type: 'single', exercise: deps.name(d.warmUp), id: d.warmUp, seconds: [WARM_UP_SEC, WARM_UP_SEC], sets: 1, restSec: 0, warmup: true }] : [];
    const out: RawDay = { n: i + 1, name: d.name, blocks: [...head, ...d.units.map((u) => rawBlock(ctx, u))] };
    if (d.finisher) out.finisher = d.finisher;
    return out;
  });
  const gymType = input.meta?.gymType ?? (input.place ? GYM_TYPE[input.place] : 'full');
  const body = { daysPerWeek, goal: ctx.family, level, gymType, days: rawDays };
  const plan: RawPlan = {
    id: input.meta?.id ?? `mine-${hashText(JSON.stringify(body))}`,
    name: input.meta?.name ?? `${daysPerWeek} Day ${split.name}`,
    summary: input.meta?.summary ?? `Built from your answers: ${daysPerWeek} days a week, ${split.name.toLowerCase()}.`,
    gymType,
    goal: ctx.family,
    level,
    daysPerWeek,
    source: 'Generated from movement patterns',
    generator: GENERATOR_VERSION,
    progressionMode: 'double',
    days: rawDays,
  };
  const timed = input.minutes !== undefined && input.minutes < 75;
  return {
    ok: true,
    plan,
    applied: {
      main,
      also,
      alsoUsed: alsoChanges(ctx, finisher),
      focus,
      focusMissed,
      loved,
      lovedMissed,
      never: (input.never ?? []).filter((id) => ladderKeys.has(key(id))).length,
      easyOn: (input.easyOn ?? []).filter((j) => j !== 'none'),
      gaps: [...gaps],
      finisher: finisher?.name ?? null,
      ...(warmUp ? { warmUp: deps.name(warmUp) } : {}),
      minutes,
      over: timed && minutes.some((m) => m > input.minutes!),
      ...(timed && main === 'strength' && days.some((d) => d.units.length < 5) ? { restKept: true } : {}),
    },
  };
}
