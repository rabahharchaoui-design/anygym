// Quick workout builds it for you (PLAN 3.5a, SPEC 20.3, G Nov 5). Pure: no JSON, no Dexie, no React
// (src/data/quick.ts binds the committed data). Four things live here:
//   1. the "How long?" chip that opens preselected from the intake minutes;
//   2. up to 3 honest concepts: "Your <day> day, short" (the plan day trimmed the SPEC 7.4 way),
//      "Hit what's fresh" (muscles not trained in the last 3 days, from logged sets only), then the
//      first honest of Full body, Upper body, Legs, Push, Pull, Arms and Core. Each is built by the
//      plan generator's own rules (generator.ts generateDay) and is only offered when its name is
//      true of what it holds (Full body: legs, a push and a pull);
//   3. the deck's swap: another exercise of the same movement pattern that fits the gym (swap.ts),
//      soft dislikes ranked last;
//   4. learning: a left swipe counts as a soft dislike (ranks lower later, never a ban), a long press
//      is "never show me this". Nothing here ever deletes history.
// Only exercises with a sure demo (exact or variant) and gear this gym surely has (`usable`, plus
// a known requirement) ever reach a concept. Fewer than 3 of them: no concept (an honest empty state).
import type { GymKit } from './picker';
import { generateDay, type DayItem, type GeneratorDeps, type GeneratorInput } from './generator';
import type { Range, Slot } from './generatorRules';
import { muscleWord, patternTargets, type Muscle, type Profile } from './order';
import { isStretchName, dayWorkout } from './planWorkout';
import { estimateDayMinutes, itemTarget, blockRest, type Plan, type PlanBlock, type PlanDay } from './plans';
import { adaptDay, requiresOf, supports, swapCandidates, workoutIdOf, type Pattern, type SwapData } from './swap';
import { applyTrim, trimDay, type DayTrim } from './timeBudget';

// ---------------------------------------------------------------- How long?

export const QUICK_MINUTES = [15, 30, 45, 60] as const;
export type QuickMinutes = (typeof QUICK_MINUTES)[number];

/** The chip preselected from the intake minutes (or a minutes value from Today): the nearest, a tie goes up. None: 30. */
export function chipFor(minutes: number | undefined): QuickMinutes {
  if (minutes === undefined || !Number.isFinite(minutes)) return 30;
  let best: QuickMinutes = QUICK_MINUTES[0];
  for (const m of QUICK_MINUTES) if (Math.abs(m - minutes) <= Math.abs(best - minutes)) best = m;
  return best;
}

// ---------------------------------------------------------------- concepts

export type QuickItem = {
  /** The exercise done (plan or catalog id). */
  id: string;
  /** The plan exercise this stands in for (plan concepts), else the id it started as. */
  slot: string;
  /** Plan concepts: the exercise the workout gives this slot when it starts (after the gym adapts it). */
  origin: string;
  name: string;
  pattern: Pattern | null;
  sets: number;
  reps?: Range | number;
  seconds?: Range | number;
  eachSide?: boolean;
  restSec: number;
  /** Why it is here, in one true line. */
  why: string;
};

export type ConceptId = 'plan' | 'fresh' | 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'arms' | 'core';

export type PlanPart = { planId: string; dayIndex: number; weekIndex: number; day: PlanDay; trim: DayTrim | null };

export type Concept = {
  id: ConceptId;
  title: string;
  /** One quiet line under the title. */
  line: string;
  items: QuickItem[];
  minutes: number;
  /** Still over the minutes picked after the trim (said, never hidden). */
  over: boolean;
  /** A plan day concept: it starts as that plan day, with this trim. */
  plan?: PlanPart;
};

export type QuickDeps = GeneratorDeps & {
  /** A sure demo (exact or variant): the only exercises Quick workout shows. */
  usable: (id: string) => boolean;
  /** The ordering profile of any id with a name (plan rows). */
  profileOf: (id: string, name?: string) => Profile;
};

/** Learned soft dislikes (additive on the profile, PLAN 3.5a). */
export type Dislikes = {
  /** Left swipes per exercise id: ranks it lower in later suggestions, never out. */
  soft?: Record<string, number>;
  /** Long press "Never show me this": left out of every later concept, plan and swap. */
  never?: string[];
};

const PUSH: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal push', 'vertical push', 'chest isolation', 'triceps', 'lateral delt']);
const PULL: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal pull', 'vertical pull', 'rear delt', 'biceps']);
const LEGS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves']);
const BIG_PUSH: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal push', 'vertical push']);
const BIG_PULL: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal pull', 'vertical pull']);
const ARMS: ReadonlySet<Pattern> = new Set<Pattern>(['lateral delt', 'rear delt', 'biceps', 'triceps']);
const DELTS: ReadonlySet<Pattern> = new Set<Pattern>(['lateral delt', 'rear delt']);

const s = (pattern: Pattern, variant = false): Slot => (variant ? { pattern, variant: true } : { pattern });

/** Most important first: the trim takes from the end (SPEC 7.4). */
const TEMPLATES: Record<Exclude<ConceptId, 'plan' | 'fresh'>, Slot[]> = {
  // One big lift per area first, so the trim (last first) keeps legs, a push and a pull.
  full: [s('squat'), s('horizontal push'), s('horizontal pull'), s('vertical push'), s('vertical pull'), s('hamstrings isolation'), s('lateral delt'), s('biceps'), s('triceps'), s('core'), s('calves')],
  upper: [s('horizontal push'), s('horizontal pull'), s('vertical push'), s('vertical pull'), s('lateral delt'), s('biceps'), s('triceps'), s('rear delt'), s('chest isolation')],
  lower: [s('squat'), s('hinge'), s('lunge'), s('quads isolation'), s('hamstrings isolation'), s('glutes'), s('calves'), s('core')],
  push: [s('horizontal push'), s('vertical push'), s('horizontal push', true), s('lateral delt'), s('chest isolation'), s('triceps'), s('triceps', true)],
  pull: [s('vertical pull'), s('horizontal pull'), s('horizontal pull', true), s('rear delt'), s('biceps'), s('biceps', true)],
  arms: [s('lateral delt'), s('biceps'), s('triceps'), s('rear delt'), s('biceps', true), s('triceps', true)],
  core: [s('core'), s('core', true), s('core', true), s('core', true)],
};

/** The fresh concept's pool, big moves first; only the patterns that train no recent muscle stay. */
const FRESH_POOL: Pattern[] = ['squat', 'hinge', 'horizontal push', 'horizontal pull', 'vertical push', 'vertical pull', 'lunge', 'glutes', 'lateral delt', 'chest isolation', 'rear delt', 'biceps', 'triceps', 'quads isolation', 'hamstrings isolation', 'calves', 'core'];

const FALLBACK_ORDER: Array<Exclude<ConceptId, 'plan' | 'fresh'>> = ['full', 'upper', 'lower', 'push', 'pull', 'arms', 'core'];

/** Whether a concept's name is true of what it holds (no "Full body" without legs, a push and a pull). */
export function honest(id: ConceptId, patterns: readonly (Pattern | null)[]): boolean {
  const ps = patterns.filter((p): p is Pattern => p !== null);
  if (ps.length < 3) return false;
  const any = (set: ReadonlySet<Pattern>) => ps.some((p) => set.has(p));
  const all = (set: ReadonlySet<Pattern>) => ps.every((p) => set.has(p));
  switch (id) {
    case 'full':
      return any(LEGS) && any(BIG_PUSH) && any(BIG_PULL);
    case 'upper':
      return any(BIG_PUSH) && any(BIG_PULL) && !any(LEGS);
    case 'lower':
      return ps.filter((p) => LEGS.has(p)).length >= 2 && ps.every((p) => LEGS.has(p) || p === 'core');
    case 'push':
      return all(PUSH) && any(BIG_PUSH);
    case 'pull':
      return all(PULL) && any(BIG_PULL);
    case 'arms':
      return all(ARMS);
    case 'core':
      return ps.every((p) => p === 'core');
    default:
      return true;
  }
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** "quads, chest and back": the first `max` words, then "and more". */
export function wordList(words: readonly string[], max = 3): string {
  const w = [...new Set(words)];
  if (w.length <= 1) return w[0] ?? '';
  if (w.length > max) return `${w.slice(0, max).join(', ')} and more`;
  return `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

const targetsOf = (deps: QuickDeps, id: string): readonly Muscle[] => deps.profile(id).targets;

function titleOf(id: Exclude<ConceptId, 'plan'>, goalMuscle: boolean, patterns: readonly (Pattern | null)[]): string {
  switch (id) {
    case 'fresh':
      return "Hit what's fresh";
    case 'full':
      return goalMuscle ? 'Full body pump' : 'Full body';
    case 'upper':
      return 'Upper body';
    case 'lower':
      return 'Legs';
    case 'push':
      return 'Push: chest, shoulders, triceps';
    case 'pull':
      return 'Pull: back and biceps';
    case 'arms':
      return patterns.some((p) => p !== null && DELTS.has(p)) ? 'Arms and shoulders' : 'Arms';
    case 'core':
      return 'Core';
  }
}

export type QuickInput = {
  /** The intake answers as the generator reads them, with the active gym, never list and soft dislikes merged in. */
  base: GeneratorInput;
  minutes: number;
  /** Muscles with logged working sets in the last 3 days. */
  recent: readonly Muscle[];
  /** The plan day concept, built first (planConcept), or null. */
  plan?: Concept | null;
};

/** A generated day as Quick workout items. */
function itemsOf(deps: QuickDeps, day: readonly DayItem[], why: (it: DayItem) => string): QuickItem[] {
  return day.map((it) => ({
    id: it.id,
    slot: it.id,
    origin: it.id,
    name: deps.name(it.id),
    pattern: it.pattern,
    sets: it.sets,
    ...(it.reps ? { reps: it.reps } : {}),
    ...(it.seconds ? { seconds: it.seconds } : {}),
    ...(it.eachSide ? { eachSide: true } : {}),
    restSec: it.restSec,
    why: why(it),
  }));
}

const sameSet = (a: readonly QuickItem[], b: readonly QuickItem[]) => a.length === b.length && a.every((x) => b.some((y) => y.id === x.id));

/**
 * Up to 3 concepts: the plan day, then fresh, then the honest fallbacks in order; ones that fit the
 * minutes picked go before ones that do not (said on the card, never hidden). Each distinct.
 */
export function buildConcepts(input: QuickInput, deps: QuickDeps): Concept[] {
  const all: Concept[] = [];
  if (input.plan) all.push(input.plan);
  const gen: GeneratorInput = { ...input.base, minutes: input.minutes };
  const goalMuscle = ['muscle', 'tone'].includes(input.base.goals[0] ?? '');

  const recent = [...new Set(input.recent)];
  if (recent.length) {
    const slots = FRESH_POOL.filter((p) => !patternTargets(p).some((m) => recent.includes(m))).map((p) => s(p));
    const r = generateDay({ ...gen, avoidMuscles: recent }, deps, { name: 'fresh', slots });
    if (r.ok) {
      const items = itemsOf(deps, r.items, (it) => `${cap(wordList(targetsOf(deps, it.id).map(muscleWord)))}: not trained in 3 days`);
      all.push({ id: 'fresh', title: titleOf('fresh', goalMuscle, []), line: `Skips the ${wordList(recent.map(muscleWord))} you trained lately`, items, minutes: r.minutes, over: r.over });
    }
  }
  for (const id of FALLBACK_ORDER) {
    const r = generateDay(gen, deps, { name: id, slots: TEMPLATES[id] });
    if (!r.ok || !honest(id, r.items.map((it) => it.pattern))) continue;
    const items = itemsOf(deps, r.items, (it) => `Works your ${wordList(targetsOf(deps, it.id).map(muscleWord))}`);
    const words = r.items.flatMap((it) => targetsOf(deps, it.id)).map(muscleWord);
    all.push({ id, title: titleOf(id, goalMuscle, r.items.map((it) => it.pattern)), line: cap(wordList(words, 4)), items, minutes: r.minutes, over: r.over });
  }
  // A minute or two over is still "about" the time (the estimate is rounded); far over goes last.
  const far = (c: Concept) => c.minutes > input.minutes + Math.max(2, Math.round(input.minutes * 0.1));
  const out: Concept[] = [];
  for (const c of [...all.filter((c) => !far(c)), ...all.filter(far)]) {
    if (out.length >= 3) break;
    if (!out.some((o) => sameSet(o.items, c.items))) out.push(c);
  }
  // Shown in their own order (plan, fresh, then the rest), whichever made the cut.
  return out.sort((a, b) => all.indexOf(a) - all.indexOf(b));
}

// ---------------------------------------------------------------- the plan day concept

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
};

/** Sure gear: the requirement is known and this gym has it (the deck never shows a maybe). */
export const sureGear = (data: SwapData, id: string, gym: GymKit): boolean => {
  const r = requiresOf(data, id);
  return r !== null && supports(r, gym);
};

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
  const ok = (id: string) => !neverKeys.has(data.sameAs(id)) && deps.usable(id) && sureGear(data, id, gym);
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
    if (pick) swapTo.set(slot, pick);
    else drop.push(slot);
  }
  const base: DayTrim | null = drop.length ? { drop, sets: {} } : null;
  const kept = applyTrim(day, base, weekIndex);
  const fit = trimDay(kept, { budget: input.minutes, weekIndex, profileOf: (id, name) => deps.profileOf(id, name) });
  const trim: DayTrim | null =
    base || fit.trim ? { drop: [...drop, ...(fit.trim?.drop ?? [])], sets: { ...(fit.trim?.sets ?? {}) }, ...(fit.trim?.mobility ? { mobility: fit.trim.mobility } : {}) } : null;
  const part: PlanPart = { planId: plan.id, dayIndex, weekIndex, day, trim };
  const items = planItems(part, deps, (slot) => currentOf.get(slot) ?? slot, (slot) => swapTo.get(slot));
  if (items.length < 3) return null;
  const minutes = planMinutes(part);
  const short = !!trim && (trim.drop.length > 0 || Object.keys(trim.sets).length > 0);
  return {
    id: 'plan',
    title: `Your ${day.name} day${short ? ', short' : ''}`,
    line: `From ${plan.name}, made to fit`,
    items,
    minutes,
    over: input.minutes < 75 && minutes > input.minutes,
    plan: part,
  };
}

/** The deck items of a plan part: every working item left after the trim, in day order. */
function planItems(part: PlanPart, deps: QuickDeps, originOf: (slot: string) => string, swappedOf: (slot: string) => string | undefined): QuickItem[] {
  const day = applyTrim(part.day, part.trim, part.weekIndex);
  const out: QuickItem[] = [];
  for (const b of day.blocks) {
    if (b.warmup || b.mobility) continue;
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
        why: swapped ? `Stands in for ${it.name}: same movement` : `From your ${part.day.name} day`,
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

// ---------------------------------------------------------------- a quick workout's day

/** Quick items as a plan day (straight sets), for the one estimator (SPEC 7.4). */
export function quickDayOf(items: readonly Pick<QuickItem, 'id' | 'name' | 'sets' | 'reps' | 'seconds' | 'restSec'>[]): PlanDay {
  return {
    n: 1,
    name: 'Quick workout',
    blocks: items.map((it) => ({
      kind: 'single' as const,
      sets: it.sets,
      restSec: it.restSec,
      items: [{ exerciseId: it.id, name: it.name, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) }],
    })),
  };
}

/** A concept's estimate now (after the deck's changes). */
export const conceptMinutes = (c: Pick<Concept, 'items' | 'plan'>): number => (c.plan ? planMinutes(c.plan) : estimateDayMinutes(quickDayOf(c.items)));

// ---------------------------------------------------------------- the deck's swap

/** Fewest left swipes first; ties keep their order (the ladder's best first). */
export function rankSoft(ids: readonly string[], soft: Readonly<Record<string, number>> | undefined): string[] {
  if (!soft) return [...ids];
  return ids
    .map((id, i) => ({ id, i, n: soft[id] ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.id);
}

export type SwapContext = {
  data: SwapData;
  gym: GymKit;
  /** A sure demo and nothing that rules it out (never list, go easy on). */
  ok: (id: string) => boolean;
  soft?: Readonly<Record<string, number>>;
};

/**
 * The exercise a left swipe puts in: same movement pattern, this gym surely has the gear, a sure
 * demo, not already in the workout, the fewest soft dislikes first, and not one this card already
 * showed while an untried one is left. null: nothing else fits (the card stays).
 */
export function nextSwap(item: QuickItem, items: readonly QuickItem[], tried: readonly string[], ctx: SwapContext): string | null {
  const mode = item.seconds !== undefined && item.reps === undefined ? 'seconds' : 'reps';
  const exclude = items.filter((x) => x !== item).map((x) => x.id);
  // The slot's own exercise is a candidate too (it can come back after a swap).
  const pool = swapCandidates(ctx.data, item.slot, ctx.gym, { mode, exclude: [...exclude, item.id] }).map(workoutIdOf);
  const own = item.slot !== item.id && !exclude.some((x) => ctx.data.sameAs(x) === ctx.data.sameAs(item.slot)) ? [item.slot] : [];
  const fits = [...pool, ...own].filter((id) => ctx.data.sameAs(id) !== ctx.data.sameAs(item.id) && ctx.ok(id) && sureGear(ctx.data, id, ctx.gym));
  const ranked = rankSoft(fits, ctx.soft);
  const triedKeys = new Set(tried.map(ctx.data.sameAs));
  return ranked.find((id) => !triedKeys.has(ctx.data.sameAs(id))) ?? ranked[0] ?? null;
}

/** The card after a swap: the slot's targets stay (sets, reps, rest), only the exercise changes. */
export function swapItem(item: QuickItem, to: string, name: string, eachSide: boolean): QuickItem {
  const next: QuickItem = { ...item, id: to, name, why: to === item.slot && item.why.startsWith('From your') ? item.why : 'Swapped in: same movement' };
  if (eachSide) next.eachSide = true;
  else delete next.eachSide;
  return next;
}

// ---------------------------------------------------------------- learning (additive, never a ban)

/** A left swipe: one more soft dislike for the exercise swapped away. */
export function learnSwap(d: Dislikes, id: string): Dislikes {
  return { ...d, soft: { ...d.soft, [id]: (d.soft?.[id] ?? 0) + 1 } };
}

/** A long press: never show it again. */
export function learnNever(d: Dislikes, id: string): Dislikes {
  return d.never?.includes(id) ? d : { ...d, never: [...(d.never ?? []), id] };
}

/** Undo of a long press. */
export function unlearnNever(d: Dislikes, id: string): Dislikes {
  return { ...d, never: (d.never ?? []).filter((x) => x !== id) };
}

/** The generator input with the learned dislikes merged in (never list joined, soft counts passed on). */
export function withDislikes(input: GeneratorInput, d: Dislikes | undefined): GeneratorInput {
  if (!d) return input;
  const never = [...new Set([...(input.never ?? []), ...(d.never ?? [])])];
  const out: GeneratorInput = { ...input };
  if (never.length) out.never = never;
  if (d.soft && Object.keys(d.soft).length) out.soft = { ...input.soft, ...d.soft };
  return out;
}

/** Muscles with logged working sets (never warm ups) in workouts started in the last 3 days. Imported workouts carry no date. */
export const RECENT_MS = 3 * 24 * 60 * 60 * 1000;
export function recentMuscles(
  sessions: readonly { id: string; startedAt: number; imported: boolean }[],
  sets: readonly { sessionId: string; exerciseId: string; kind: string }[],
  targets: (id: string) => readonly Muscle[],
  now: number,
): Muscle[] {
  const ids = new Set(sessions.filter((x) => !x.imported && x.startedAt >= now - RECENT_MS && x.startedAt <= now).map((x) => x.id));
  const out = new Set<Muscle>();
  for (const st of sets) if (ids.has(st.sessionId) && st.kind !== 'warmup') for (const m of targets(st.exerciseId)) out.add(m);
  return [...out];
}
