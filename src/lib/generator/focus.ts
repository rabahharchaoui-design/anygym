// Adapter only: all allocation policy lives in lib/plan/focus.ts.
import { curateFocus, focusMuscles, normalizeFocusPicks, type FocusMove, type FocusReport } from '../plan/focus';
import { RIDERS } from '../plan/focusShare';
import { isCompound, orderUnits } from '../order';
import { supports } from '../swap';
import { allowed, makeItem } from './pick';
import { prescribe, setCap } from './prescribe';
import { pairUp, splitUnequalPairs, unitOf } from './pairs';
import { minutesOf } from './trim';
import type { FocusLeast } from './least';
import type { Ctx, Day, Item } from './types';

/** The most moves a day holds once focus has added to it: the base day's most (generatorRules movesFor) and up to two more where the time is long. */
const focusMaxMoves = (minutes: number | undefined): number => (minutes === undefined || minutes >= 75 ? 10 : minutes >= 60 ? 9 : 8);

/**
 * The rest a small move takes when it joins a day: on a day the trim shortened (SPEC 22 rule 6: its
 * small moves rest 60 s), the same 60 s that a small move added to a short day gets (fit.ts
 * addMoves), never longer than the day's own small moves. A day with its full rests keeps them.
 */
function smallRest(ctx: Ctx, d: Day): number {
  if (ctx.input.minutes === undefined || ctx.input.minutes >= 75) return Infinity;
  const small = d.units.flat().filter((it) => it.profile.role === 'lift' && !isCompound(it.profile) && !it.candidate.timed);
  return Math.max(60, ...small.map((it) => it.rest));
}

export function applyFocus(ctx: Ctx, days: Day[], least?: FocusLeast): FocusReport {
  const picks = normalizeFocusPicks(ctx.input.focusPicks ?? ctx.input.focus);
  if (!picks.some((p) => p !== 'balance')) return { budget: 0, spent: 0, priorities: [], days: days.map(() => []) };
  const facts = (it: Item): FocusMove => ({ id: it.id, key: it.key, sets: it.sets, hard: it.profile.role === 'lift', compound: isCompound(it.profile), recovery: it.profile.role === 'lift' ? it.profile.targets : [], ...(ctx.loveKeys.has(it.key) ? { keep: true } : {}), ...(it.seconds ? { seconds: it.seconds[0] } : {}), ...(ctx.deps.focusFacts?.(it.id, it.profile) ?? { muscles: [...it.profile.targets], picks: (ctx.input.focus ?? []).filter((f) => f !== 'balance' && focusMuscles([f]).some((m) => it.profile.targets.includes(m))) }) });
  const candidates = days.map((d) => Object.entries(ctx.deps.data.patterns).flatMap(([pattern, ladder]) => ladder.candidates.filter((c) => allowed(ctx, c, pattern === 'core')).map((c) => {
    const it = makeItem(ctx, c, pattern as Item['pattern']);
    prescribe(ctx, it, false);
    if (!isCompound(it.profile)) it.rest = Math.min(it.rest, smallRest(ctx, d));
    return it;
  })).concat((ctx.deps.focusLifts?.() ?? []).filter((c) => allowed(ctx, c, false)).map((c) => {
    // A small arm move outside the ladders (a wrist curl): prescribed like any accessory.
    const it = makeItem(ctx, c, 'biceps');
    prescribe(ctx, it, false);
    return it;
  })).concat((ctx.deps.focusCandidates ?? []).filter((c) => allowed(ctx, c, true)).map((c) => {
    const it = makeItem(ctx, c, 'core');
    // PLAN 3.6g: a stretch of the block; lib/plan/focusServe.ts sets the rounds and the hold.
    it.sets = 1; it.seconds = [60, 60]; it.rest = 0; it.mobility = true;
    return it;
  })));
  const pools = days.map((d, i) => new Map([...candidates[i]!, ...d.units.flat()].map((it) => [it.id, it])));
  // Reorder and pair during every estimate too. The accepted result has exactly that same duration.
  const arranged = (moves: FocusMove[], i: number): Day => {
    const items = moves.map((m) => { const it = pools[i]!.get(m.id)!; return { ...it, sets: m.sets, ...(it.mobility && m.seconds ? { seconds: [m.seconds, m.seconds] as [number, number] } : {}) }; });
    const byId = new Map(items.map((it) => [it.id, it]));
    const used = new Set<string>();
    const old = days[i]!.units.map((u) => u.flatMap((it) => {
      const next = byId.get(it.id);
      if (next) used.add(next.id);
      return next ? [next] : [];
    })).filter((u) => u.length);
    const groups = [...splitUnequalPairs(old), ...items.filter((it) => !used.has(it.id)).map((it) => [it])].map((u) => u.filter((it) => !it.mobility)).filter((u) => u.length);
    const order = orderUnits(groups.map(unitOf), { focus: focusMuscles(picks) }).map((u) => u.ref);
    // The stretch block is one unit at the very end of the session.
    const stretches = items.filter((it) => it.mobility);
    return { ...days[i]!, items, units: [...(ctx.family === 'strength' ? order : pairUp(order, items)), ...(stretches.length ? [stretches] : [])] };
  };
  const out = curateFocus({ picks, days: days.map((d) => d.units.flat().map(facts)), candidates: candidates.map((d) => d.map(facts)), cap: setCap(ctx), budgetMinutes: ctx.input.minutes, maxMoves: focusMaxMoves(ctx.input.minutes), fill: true, ...(least ? { least } : {}), minutes: (moves, i) => minutesOf(arranged(moves, i)) });
  for (const [i, moves] of out.days.entries()) Object.assign(days[i]!, arranged(moves, i));
  // A pick with no exercise here, while the app has one this gym lacks the equipment for: said as that.
  const elsewhere = Object.entries(ctx.deps.data.patterns).flatMap(([pattern, ladder]) => ladder.candidates.filter((c) => !c.timed || pattern === 'core').map((c) => makeItem(ctx, c, pattern as Item['pattern']))).concat((ctx.deps.focusLifts?.() ?? []).map((c) => makeItem(ctx, c, 'biceps'))).filter((it) => !supports(it.candidate.requires, ctx.input.gym));
  for (const p of out.report.priorities) if (p.state === 'no_move' && elsewhere.some((it) => it.profile.role === 'lift' && facts(it).picks.includes(p.id))) p.gear = true;
  // Focused moves go first while fresh: the pick each day's first lift trains (the highest ranked), for the day's why.
  const ranked = out.report.priorities.map((p) => p.id).filter((id) => id !== 'mobility' && !RIDERS.has(id));
  out.report.dayLead = days.map((d) => {
    const first = d.units.flat().find((it) => it.profile.role === 'lift');
    const served = first ? facts(first).picks : [];
    return ranked.find((id) => served.includes(id)) ?? null;
  });
  return out.report;
}
