// Adapter only: all allocation policy lives in lib/plan/focus.ts.
import { curateFocus, focusMuscles, normalizeFocusPicks, type FocusMove, type FocusReport } from '../plan/focus';
import { isCompound, orderUnits } from '../order';
import { allowed, makeItem } from './pick';
import { prescribe, setCap } from './prescribe';
import { pairUp, splitUnequalPairs, unitOf } from './pairs';
import { minutesOf } from './trim';
import type { Ctx, Day, Item } from './types';

export function applyFocus(ctx: Ctx, days: Day[]): FocusReport {
  const picks = normalizeFocusPicks(ctx.input.focusPicks ?? ctx.input.focus);
  if (!picks.some((p) => p !== 'balance')) return { budget: 0, spent: 0, priorities: [], days: days.map(() => []) };
  const facts = (it: Item): FocusMove => ({ id: it.id, key: it.key, sets: it.sets, hard: it.profile.role === 'lift', compound: isCompound(it.profile), ...(it.seconds ? { seconds: it.seconds[0] } : {}), ...(ctx.deps.focusFacts?.(it.id, it.profile) ?? { muscles: [...it.profile.targets], picks: (ctx.input.focus ?? []).filter((f) => f !== 'balance' && focusMuscles([f]).some((m) => it.profile.targets.includes(m))) }) });
  const candidates = days.map(() => Object.entries(ctx.deps.data.patterns).flatMap(([pattern, ladder]) => ladder.candidates.filter((c) => allowed(ctx, c, pattern === 'core')).map((c) => {
    const it = makeItem(ctx, c, pattern as Item['pattern']);
    prescribe(ctx, it, false);
    return it;
  })).concat((ctx.deps.focusCandidates ?? []).filter((c) => allowed(ctx, c, true)).map((c) => {
    const it = makeItem(ctx, c, 'core');
    it.sets = 1; it.seconds = [60, 60]; it.rest = 0;
    return it;
  })));
  const pools = days.map((d, i) => new Map([...candidates[i]!, ...d.units.flat()].map((it) => [it.id, it])));
  // Reorder and pair during every estimate too. The accepted result has exactly that same duration.
  const arranged = (moves: FocusMove[], i: number): Day => {
    const items = moves.map((m) => ({ ...pools[i]!.get(m.id)!, sets: m.sets }));
    const byId = new Map(items.map((it) => [it.id, it]));
    const used = new Set<string>();
    const old = days[i]!.units.map((u) => u.flatMap((it) => {
      const next = byId.get(it.id);
      if (next) used.add(next.id);
      return next ? [next] : [];
    })).filter((u) => u.length);
    const groups = [...splitUnequalPairs(old), ...items.filter((it) => !used.has(it.id)).map((it) => [it])];
    const order = orderUnits(groups.map(unitOf), { focus: focusMuscles(picks) }).map((u) => u.ref);
    return { ...days[i]!, items, units: ctx.family === 'strength' ? order : pairUp(order, items) };
  };
  const out = curateFocus({ picks, days: days.map((d) => d.units.flat().map(facts)), candidates: candidates.map((d) => d.map(facts)), cap: setCap(ctx), budgetMinutes: ctx.input.minutes === undefined || ctx.input.minutes >= 75 ? undefined : ctx.input.minutes, minutes: (moves, i) => minutesOf(arranged(moves, i)) });
  for (const [i, moves] of out.days.entries()) Object.assign(days[i]!, arranged(moves, i));
  return out.report;
}
