// Quick workout's plan day card (PLAN 3.5b, 3.5g): "Your plan, short" when the day trimmed to the
// minutes really is shorter, else "Your plan" as the plan has it. Pure. Moved out of quick.ts (code organization).
import type { Concept, PlanPart, QuickDeps, QuickItem } from './quick';
import { type DayTrim, applyTrim } from './timeBudget';
import { EQUIPMENT_LABEL } from './intake/options';
import type { GymKit } from './picker';
import { JOINT_WORD, gearOf, hasGear, mainMuscles, quickAvoids, reasonsFor } from './quickShow';
import { type Plan, type PlanBlock, type PlanDay, blockRest, estimateDayMinutes, itemTarget } from './plans';
import { type Profile, canPair, isCompound, isHeavy } from './order';
import { SLACK, quickMinutes } from './quickStyles';
import { adaptDay, requiresOf, swapCandidates, workoutIdOf } from './swap';
import { wordList } from './quickWhy';
import { dayWorkout, finisherId, isStretchName } from './planWorkout';
import { rankSoft, sureGear } from './quickDeck';

export type PlanConceptInput = {
  plan: Plan;
  dayIndex: number;
  weekIndex: number;
  minutes: number;
  gym: GymKit;
  /** "Always use this" picks of this plan (startPlanDay's own), slot → exercise. */
  always?: Readonly<Record<string, string>>;
  /** Never show (intake never list and long presses): never in the concept. */
  never?: readonly string[];
  soft?: Readonly<Record<string, number>>;
  /** PLAN 3.5b: Go easy on joints: a lift they skip is swapped or left out, like the generator does. */
  easyOn?: readonly string[];
  /** PLAN 3.5b round 2: the intake level (a newer lifter's sets stay at 3 at most when the fit adds sets). */
  experience?: string;
};

export const workingBlocks = (d: PlanDay): PlanBlock[] => d.blocks.filter((b) => !b.warmup && !b.mobility);

/**
 * PLAN 3.5b round 2: the plan day fitted to the minutes the way the style cards are (the one
 * estimate, never over the chip, within 2 min under it when it can be). Long: two small moves next
 * to each other become a superset (SPEC 22 rule 5: never a heavy lift, never a shared muscle), then
 * tighter rest (never on a heavy lift, SPEC 22 rule 6), then fewer sets (small moves first, 2 at
 * least), then the last moves go (the first two compound lifts last of all). Short: one more set at
 * a time (3 at most for a newer lifter, 5 otherwise), then a little more rest. Everything is a
 * DayTrim, so the workout starts exactly as the card says. When even one lift cannot fit, the card
 * is the honest smaller one.
 */
export function fitPlanDay(
  day: PlanDay,
  base: DayTrim | null,
  weekIndex: number,
  budget: number,
  profileOf: (id: string, name: string) => Profile,
  newer: boolean,
): { trim: DayTrim | null; short?: 'moves' | 'caps' } {
  const t: DayTrim = { drop: [...(base?.drop ?? [])], sets: {}, rest: {}, pairs: [], ...(base?.straight ? { straight: { ...base.straight } } : {}) };
  const est = () => estimateDayMinutes(applyTrim(day, t, weekIndex), weekIndex);
  const blocks = () => workingBlocks(applyTrim(day, t, weekIndex));
  const prof = (it: PlanBlock['items'][number]) => profileOf(it.exerciseId, it.name);
  const heavy = (b: PlanBlock) => b.items.some((it) => isHeavy(prof(it)));
  const compound = (b: PlanBlock) => b.items.some((it) => isCompound(prof(it)));
  const setsOf = (b: PlanBlock) => Math.max(...b.items.map((it) => itemTarget(b, it, weekIndex).sets));
  const setSets = (b: PlanBlock, n: number) => b.items.forEach((it) => (t.sets[it.exerciseId] = n));
  const setRest = (b: PlanBlock, n: number) => b.items.forEach((it) => (t.rest![it.exerciseId] = n));
  const floor = (b: PlanBlock) => (compound(b) ? 60 : 45);
  const cap = newer ? 3 : 5;
  const firstTwo = new Set(blocks().filter((b) => compound(b)).slice(0, 2).map((b) => b.items[0]!.exerciseId));
  if (budget < 75) {
    for (let guard = 0; est() > budget && guard < 200; guard++) {
      const bs = blocks();
      // A superset of two small moves side by side.
      const at = bs.findIndex((b, i) => {
        const n = bs[i + 1];
        return !!n && b.kind === 'single' && n.kind === 'single' && b.items.length === 1 && n.items.length === 1 && !heavy(b) && !heavy(n) && canPair(prof(b.items[0]!), prof(n.items[0]!));
      });
      if (at !== -1) {
        const [a, b] = [bs[at]!, bs[at + 1]!];
        const sets = Math.max(setsOf(a), setsOf(b));
        setSets(a, sets);
        setSets(b, sets);
        t.pairs!.push([a.items[0]!.exerciseId, b.items[0]!.exerciseId]);
        const rest = compound(a) || compound(b) ? 90 : 60;
        setRest(a, rest);
        setRest(b, rest);
        continue;
      }
      const tighter = bs.filter((b) => !heavy(b) && blockRest(b) - 15 >= floor(b));
      if (tighter.length) {
        for (const b of tighter) setRest(b, blockRest(b) - 15);
        continue;
      }
      const fewer = [...bs].reverse().filter((b) => setsOf(b) > 2).sort((a, b) => Number(compound(a)) - Number(compound(b)) || Number(heavy(a)) - Number(heavy(b)))[0];
      if (fewer) {
        setSets(fewer, setsOf(fewer) - 1);
        continue;
      }
      if (bs.length <= 1) break;
      const last = [...bs].reverse().find((b) => !b.items.some((it) => firstTwo.has(it.exerciseId))) ?? bs[bs.length - 1]!;
      t.drop.push(...last.items.map((it) => it.exerciseId));
      t.pairs = t.pairs!.filter((p) => !p.some((id) => t.drop.includes(id)));
    }
    const fitsNow = (fn: () => void): boolean => {
      const before = JSON.stringify(t);
      fn();
      if (est() <= budget) return true;
      Object.assign(t, JSON.parse(before) as DayTrim);
      return false;
    };
    for (let guard = 0; est() < budget - SLACK && guard < 200; guard++) {
      const bs = blocks();
      const more = bs.find((b) => setsOf(b) < cap && fitsNow(() => setSets(b, setsOf(b) + 1)));
      if (more) continue;
      const rest = bs.find((b) => !heavy(b) && blockRest(b) + 15 <= 120 && fitsNow(() => setRest(b, blockRest(b) + 15)));
      if (!rest) break;
    }
  }
  // 3.5d round 3 (3): one source of truth for a straight set's rest, the block's own as the trim left it
  // (applyTrim lets t.rest win over straight), so the card and the day list read the same number.
  if (t.straight) for (const id of Object.keys(t.straight)) if (t.rest![id] !== undefined) t.straight[id] = t.rest![id]!;
  if (!Object.keys(t.rest!).length) delete t.rest;
  if (!t.pairs!.length) delete t.pairs;
  const trim = t.drop.length || Object.keys(t.sets).length || t.rest || t.pairs || t.straight ? t : null;
  const m = est();
  if (budget >= 75 || m >= budget - SLACK) return { trim };
  return { trim, short: newer ? 'caps' : 'moves' };
}

/**
 * "Your Pull day, short": the plan day as this gym does it (adaptDay, like Start), only its working
 * lifts with a sure demo and sure gear (one without gets a same pattern swap that has them, else it
 * is left out), then trimmed to the minutes the SPEC 7.4 way. Warm ups and stretches have no demo
 * here: left out. null when fewer than 3 lifts remain.
 */
export function planConcept(input: PlanConceptInput, deps: QuickDeps): Concept | null {
  const { plan, dayIndex, weekIndex, gym } = input;
  const day = plan.days[dayIndex];
  if (!day) return null;
  const data = deps.data;
  const neverKeys = new Set((input.never ?? []).map(data.sameAs));
  const ok = (id: string) => !neverKeys.has(data.sameAs(id)) && deps.usable(id) && sureGear(data, id, gym) && !quickAvoids(input.easyOn, deps.profile(id));
  const entries = dayWorkout(plan, dayIndex, weekIndex);
  const unique = entries.filter((e, i) => entries.findIndex((x) => x.exerciseId === e.exerciseId) === i);
  const adapted = adaptDay(data, unique, gym, input.always ?? {});
  const currentOf = new Map(unique.map((e) => [e.exerciseId, e.exerciseId]));
  const noFit = new Set<string>();
  for (const sw of adapted.swaps) {
    currentOf.set(sw.slot, sw.current);
    if (sw.noFit) noFit.add(sw.slot);
  }
  const drop: string[] = [];
  const swapTo = new Map<string, string>();
  const straight: Record<string, number> = {};
  const taken = () => [...currentOf.entries()].filter(([slot]) => !drop.includes(slot)).map(([slot, cur]) => swapTo.get(slot) ?? cur);
  for (const e of unique) {
    if (e.finisher) continue;
    const slot = e.exerciseId;
    const working = !e.warmup && !e.mobility && !isStretchName(e.name) && deps.profileOf(slot, e.name).role === 'lift';
    if (!working || noFit.has(slot)) {
      drop.push(slot);
      continue;
    }
    const cur = currentOf.get(slot)!;
    if (ok(cur)) continue;
    const mode = e.seconds !== undefined && e.reps === undefined ? 'seconds' : 'reps';
    const pick = rankSoft(swapCandidates(data, cur, gym, { mode, exclude: taken().filter((x) => x !== cur) }).map(workoutIdOf).filter(ok), input.soft)[0];
    // 3.5d: a stand in never makes a heavy lift part of a plan pair (SPEC 22 rule 5): it is left out instead.
    const block = day.blocks.find((b) => b.items.some((x) => x.exerciseId === slot));
    const inHeavyPair = !!block && block.kind === 'pair' && block.items.length > 1 && (isHeavy(deps.profile(pick ?? cur)) || block.items.some((x) => x.exerciseId !== slot && isHeavy(deps.profileOf(x.exerciseId, x.name))));
    if (!pick) drop.push(slot);
    else {
      swapTo.set(slot, pick);
      // Round 2 (Codex #1): the stand in stays; its pair is done as straight sets instead (the plan's own rest after every
      // set, a heavy lift keeps the rest it was written with), so planned work is never silently removed.
      if (inHeavyPair && block)
        for (const x of block.items) straight[x.exerciseId] = blockRest(block as PlanBlock);
    }
  }
  // 3.5b round 2: the cardio finisher has no demo and no card: Quick's plan day leaves it out.
  if (day.finisher) drop.push(finisherId(day.finisher.name));
  const base: DayTrim | null = drop.length || Object.keys(straight).length ? { drop, sets: {}, ...(Object.keys(straight).length ? { straight } : {}) } : null;
  // The gym cannot do the day: fewer than 3 of its lifts with a sure demo and sure gear.
  if (workingBlocks(applyTrim(day, base, weekIndex)).reduce((n, b) => n + b.items.length, 0) < 3) return null;
  const newer = input.experience === undefined || ['new', 'months', 'break'].includes(input.experience);
  const fitted = fitPlanDay(day, base, weekIndex, input.minutes, (id, name) => deps.profileOf(id, name), newer);
  // PLAN 3.5g: "short" only when the fit really is shorter than the plan day as this gym does it. When
  // the minutes picked are longer, the card is the plan day as written, with the plan's own estimate
  // (never padded with sets to look like the chip).
  const own = estimateDayMinutes(applyTrim(day, base, weekIndex), weekIndex);
  const shorter = estimateDayMinutes(applyTrim(day, fitted.trim, weekIndex), weekIndex) < own;
  const trim = shorter ? fitted.trim : base;
  const part: PlanPart = { planId: plan.id, dayIndex, weekIndex, day, trim };
  // 3.5b round 4 (M10): a plan move put in for the plan's own says why the plan's one is not here.
  const whyReplaced = (slot: string): string => {
    const r = requiresOf(data, slot);
    const missing = r?.find((g) => !g.some((x) => hasGear(x, gym)));
    if (missing?.length) return `your gym has no ${EQUIPMENT_LABEL[missing[0]!].toLowerCase()}`;
    if (neverKeys.has(data.sameAs(slot))) return 'you asked never to see it';
    const joints = (input.easyOn ?? []).filter((j) => JOINT_WORD[j] && quickAvoids([j], deps.profile(slot)));
    if (joints.length) return `easy on your ${wordList(joints.map((j) => JOINT_WORD[j]!), 2)}`;
    return 'this one has a demo we can show you';
  };
  const items = planItems(part, deps, (slot) => currentOf.get(slot) ?? slot, (slot) => swapTo.get(slot), whyReplaced);
  if (!items.length) return null;
  const reasons = reasonsFor(items.map((it) => it.id), deps, (id) => items.find((it) => it.id === id)!.name);
  items.forEach((it, i) => {
    if (it.id === it.slot) it.why = reasons[i]!;
  });
  const minutes = planMinutes(part);
  const ids = items.map((it) => it.id);
  return {
    // Not shorter and well under the chip: the whole day is in it, and the card says so (shortLine).
    ...(shorter ? (fitted.short ? { short: fitted.short } : {}) : minutes < input.minutes - SLACK ? { short: 'moves' as const } : {}),
    // PLAN 3.5b: card 1 is "Your plan, short" (the day and the plan named on its line); 3.5g: only when shorter.
    id: 'plan',
    title: shorter ? 'Your plan, short' : 'Your plan',
    line: `${day.name} from your ${plan.name}`,
    items,
    minutes,
    over: input.minutes < 75 && minutes > input.minutes,
    plan: part,
    chip: 'Your plan',
    effort: 2,
    ...(newer ? { newer: true } : {}),
    gear: gearOf(ids, data, gym),
    primary: mainMuscles(items, deps),
  };
}

/** The deck items of a plan part: every working item left after the trim, in day order. */
export function planItems(part: PlanPart, deps: QuickDeps, originOf: (slot: string) => string, swappedOf: (slot: string) => string | undefined, whyReplaced: (slot: string) => string): QuickItem[] {
  const day = applyTrim(part.day, part.trim, part.weekIndex);
  const out: QuickItem[] = [];
  let group = 0;
  for (const b of day.blocks) {
    if (b.warmup || b.mobility) continue;
    // PLAN 3.5b: a plan pair stays a pair on the card (its line counts it).
    const pair = b.kind === 'pair' && b.items.length > 1 ? group++ : undefined;
    for (const it of b.items) {
      const t = itemTarget(b, it, part.weekIndex);
      const origin = originOf(it.exerciseId);
      const swapped = swappedOf(it.exerciseId);
      const id = swapped ?? origin;
      out.push({
        id,
        slot: it.exerciseId,
        origin,
        name: id === it.exerciseId ? it.name : deps.name(id),
        pattern: deps.profileOf(id).pattern,
        sets: t.sets,
        ...(t.reps !== undefined ? { reps: t.reps } : {}),
        ...(t.seconds !== undefined ? { seconds: t.seconds } : {}),
        ...(it.eachSide ? { eachSide: true } : {}),
        restSec: blockRest(b as PlanBlock),
        // 3.5b round 4 (M10): a move put in for the plan's own says why, in plain words.
        why: swapped || origin !== it.exerciseId ? `Instead of ${it.name}: ${whyReplaced(it.exerciseId)}` : `From your ${part.day.name} day`,
        ...(pair !== undefined ? { group: pair } : {}),
      });
    }
  }
  return out;
}

/** A plan part's estimate: the workout header's own (estimateDayMinutes of the trimmed day). */
export const planMinutes = (part: PlanPart): number => estimateDayMinutes(applyTrim(part.day, part.trim, part.weekIndex), part.weekIndex);

/** A plan part with one more slot left out (long press on its card, with nothing to swap in). */
export function dropSlot(part: PlanPart, slot: string): PlanPart {
  const trim: DayTrim = part.trim ? { ...part.trim, drop: [...new Set([...part.trim.drop, slot])] } : { drop: [slot], sets: {} };
  return { ...part, trim };
}


/** A concept's estimate now (after the deck's changes). */
export const conceptMinutes = (c: Pick<Concept, 'items' | 'plan'>): number => (c.plan ? planMinutes(c.plan) : quickMinutes(c.items));
