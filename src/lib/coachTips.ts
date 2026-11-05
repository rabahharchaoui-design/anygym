// Coach tips on a curated plan (PLAN 3.4a, SPEC 22): the plan is shown as written, and these are the
// improvements a top evidence based coach would suggest, each with a one line why and its own
// Apply. Pure: no JSON, no Dexie, no React. Applying never edits the plan: it makes a coach tuned
// copy (applyTips), and the original stays one tap away.
//
// The six checks (SPEC 22, G's split is the worked example):
//   hinge    a "(hamstring focus)" style day trains its focus muscle's big lift late (after 2+ lifts)
//   stretch  long static stretches before the day's lifting
//   rest     the day's heaviest squat, hinge or press rests 90 s or less (plan states the rest)
//   pair     a pair that works the same muscle back to back (rule 5)
//   freq     a major muscle gets only one real session (4+ hard sets) a week (rule 7)
//   core     an abs add on of 5+ exercises on a lifting day
// Each check only speaks when the plan's own data shows it; nothing is flagged on a guess.

import type { Plan, PlanBlock, PlanDay, PlanItem } from './plans';
import { itemTarget } from './plans';
import { heaviestOf, isCompound, muscleWord, orderUnits, sameMusclePair, type Muscle, type Profile } from './order';

export const TIP_IDS = ['hinge', 'stretch', 'rest', 'pair', 'freq', 'core'] as const;
export type TipId = (typeof TIP_IDS)[number];

export type Tip = {
  id: TipId;
  /** One plain line: what is off. */
  title: string;
  /** One plain line: why, and what Apply does. */
  why: string;
  /** The days it touches (day numbers). */
  days: number[];
  /** What Apply changes, exactly, when one line is not enough ("Dumbbell Bench Press → Day 5"). */
  detail?: string[];
};

export type ProfileOf = (id: string) => Profile;

/** Heavy lifts rest this long once tuned (SPEC 22 rule 6: 2 to 3 min). */
export const HEAVY_REST_SEC = 150;
/** A muscle's day counts as a session with at least this many hard sets on it. */
export const SESSION_SETS = 4;
/** A tuned core block keeps this many exercises. */
export const CORE_KEEP = 3;
/** Sets a frequency tip adds for a muscle on another day (SPEC 22: 3 to 4). */
export const FREQ_SETS = 3;

const MAJOR: ReadonlyArray<{ word: string; muscles: Muscle[]; upper: boolean }> = [
  { word: 'chest', muscles: ['chest'], upper: true },
  { word: 'back', muscles: ['back'], upper: true },
  { word: 'shoulders', muscles: ['front delts', 'side delts', 'rear delts'], upper: true },
  { word: 'quads', muscles: ['quads'], upper: false },
  { word: 'hamstrings', muscles: ['hamstrings'], upper: false },
  { word: 'glutes', muscles: ['glutes'], upper: false },
];

const UPPER: ReadonlySet<Muscle> = new Set<Muscle>(['chest', 'back', 'front delts', 'side delts', 'rear delts', 'biceps', 'triceps', 'traps', 'forearms']);
const LOWER: ReadonlySet<Muscle> = new Set<Muscle>(['quads', 'glutes', 'hamstrings', 'calves', 'adductors', 'abductors', 'lower back']);

/** "Legs (hamstring focus)" → hamstrings. Only a day that names its focus has one. */
const FOCUS_WORDS: Readonly<Record<string, Muscle>> = {
  hamstring: 'hamstrings',
  hamstrings: 'hamstrings',
  quad: 'quads',
  quads: 'quads',
  glute: 'glutes',
  glutes: 'glutes',
  chest: 'chest',
  back: 'back',
};
export function dayFocus(day: Pick<PlanDay, 'name'>): Muscle | null {
  const m = /\((\w+) focus\)/i.exec(day.name);
  return m ? (FOCUS_WORDS[m[1]!.toLowerCase()] ?? null) : null;
}

// ---------------------------------------------------------------- reading a day

const itemsOf = (b: PlanBlock, profile: ProfileOf) => b.items.map((it) => profile(it.exerciseId));
const isLiftBlock = (b: PlanBlock, profile: ProfileOf) => !b.warmup && itemsOf(b, profile).some((p) => p.role === 'lift');
const isCoreBlock = (b: PlanBlock, profile: ProfileOf) => isLiftBlock(b, profile) && itemsOf(b, profile).every((p) => p.role !== 'lift' || (p.tier === 3 && p.targets.includes('abs')));
const isStaticStretch = (b: PlanBlock, profile: ProfileOf) => itemsOf(b, profile).every((p) => p.role === 'stretch');
/** Lifts that are not the abs block (the day's real work). */
const isMainLift = (b: PlanBlock, profile: ProfileOf) => isLiftBlock(b, profile) && !isCoreBlock(b, profile);

/** Hard sets per muscle on a day (week 1): working sets of lifts, counted on their targets. */
function hardSets(day: PlanDay, profile: ProfileOf): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const b of day.blocks) {
    if (b.warmup) continue;
    for (const it of b.items) {
      const p = profile(it.exerciseId);
      if (p.role !== 'lift') continue;
      const sets = itemTarget(b, it, 0).sets;
      for (const m of p.targets) out.set(m, (out.get(m) ?? 0) + sets);
    }
  }
  return out;
}

const setsFor = (sets: Map<Muscle, number>, muscles: readonly Muscle[]) => muscles.reduce((a, m) => a + (sets.get(m) ?? 0), 0);
const totalSets = (sets: Map<Muscle, number>) => [...sets.values()].reduce((a, n) => a + n, 0);

/** Upper, lower or neither, by where most of the day's hard sets go. */
function halfOf(day: PlanDay, profile: ProfileOf): 'upper' | 'lower' | null {
  const sets = hardSets(day, profile);
  let up = 0;
  let low = 0;
  for (const [m, n] of sets) {
    if (UPPER.has(m)) up += n;
    if (LOWER.has(m)) low += n;
  }
  return up > low ? 'upper' : low > up ? 'lower' : null;
}

const listWords = (words: string[]) => (words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const dayWords = (days: number[]) => (days.length === 1 ? `Day ${days[0]}` : `Days ${listWords(days.map(String))}`);
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

// ---------------------------------------------------------------- the checks

type Found = { tip: Tip; apply: (plan: Plan) => Plan };

function hingeEarly(plan: Plan, profile: ProfileOf): Found | null {
  const hits: Array<{ day: PlanDay; focus: Muscle; name: string; at: number }> = [];
  for (const d of plan.days) {
    const focus = dayFocus(d);
    if (!focus) continue;
    const lifts = d.blocks.filter((b) => isMainLift(b, profile));
    const at = lifts.findIndex((b) => itemsOf(b, profile).some((p) => isCompound(p) && p.targets[0] === focus));
    if (at > 1) hits.push({ day: d, focus, at, name: lifts[at]!.items.find((it) => profile(it.exerciseId).targets[0] === focus)!.name });
  }
  if (!hits.length) return null;
  const days = hits.map((h) => h.day.n);
  const { day: d, focus, name, at } = hits[0]!;
  return {
    tip: {
      id: 'hinge',
      title: `${d.name}: ${name} is ${ordinal(at + 1)}`,
      why: `A ${muscleWord(focus)} focus day should train them early while you are fresh. Moves it up right after the first big lift.`,
      days,
    },
    apply: (p) => mapDays(p, days, (day) => reorderLifts(day, profile, dayFocus(day))),
  };
}

function stretchesLast(plan: Plan, profile: ProfileOf): Found | null {
  const days = plan.days
    .filter((d) => {
      const first = d.blocks.findIndex((b) => isMainLift(b, profile));
      return first > 0 && d.blocks.slice(0, first).some((b) => isStaticStretch(b, profile));
    })
    .map((d) => d.n);
  if (!days.length) return null;
  return {
    tip: {
      id: 'stretch',
      title: `${dayWords(days)}: long stretches before heavy lifting`,
      why: 'Long static holds before lifting can sap strength. Keeps the short dynamic warm up first and moves the holds to the end.',
      days,
    },
    apply: (p) =>
      mapDays(p, days, (day) => {
        const stretches = day.blocks.filter((b) => isStaticStretch(b, profile));
        return { ...day, blocks: [...day.blocks.filter((b) => !stretches.includes(b)), ...stretches] };
      }),
  };
}

function heavyRest(plan: Plan, profile: ProfileOf): Found | null {
  const hits: Array<{ day: number; id: string; name: string }> = [];
  for (const d of plan.days) {
    const lifts = d.blocks.filter((b) => isMainLift(b, profile));
    const heavy = heaviestOf(lifts.flatMap((b) => itemsOf(b, profile)));
    if (!heavy) continue;
    const block = lifts.find((b) => b.items.some((it) => it.exerciseId === heavy.id))!;
    // Only a rest the plan states: the app's own default is never called the plan's.
    if (block.restSec !== undefined && block.restSec <= 90) hits.push({ day: d.n, id: heavy.id, name: block.items.find((it) => it.exerciseId === heavy.id)!.name });
  }
  if (!hits.length) return null;
  const names = [...new Set(hits.map((h) => h.name))];
  const ids = new Set(hits.map((h) => h.id));
  const days = [...new Set(hits.map((h) => h.day))];
  return {
    tip: {
      id: 'rest',
      title: `${listWords(names)} ${names.length === 1 ? 'rests' : 'rest'} 90 s or less`,
      why: `Heavy lifts need 2 to 3 min between sets to keep their reps. Sets their rest to ${HEAVY_REST_SEC / 60} min.`,
      days,
    },
    apply: (p) =>
      mapDays(p, days, (day) => ({
        ...day,
        blocks: day.blocks.map((b) => (b.items.some((it) => ids.has(it.exerciseId)) && !b.warmup ? { ...b, restSec: Math.max(b.restSec ?? 0, HEAVY_REST_SEC) } : b)),
      })),
  };
}

function sameMuscle(plan: Plan, profile: ProfileOf): Found | null {
  const hits: Array<{ day: number; names: string[]; muscle: Muscle; ids: string[] }> = [];
  for (const d of plan.days) {
    for (const b of d.blocks) {
      if (b.kind !== 'pair' || b.warmup) continue;
      const muscle = sameMusclePair(itemsOf(b, profile));
      if (muscle) hits.push({ day: d.n, names: b.items.map((it) => it.name), muscle, ids: b.items.map((it) => it.exerciseId) });
    }
  }
  if (!hits.length) return null;
  const h = hits[0]!;
  const days = [...new Set(hits.map((x) => x.day))];
  const pairKeys = new Set(hits.map((x) => x.ids.join('|')));
  return {
    tip: {
      id: 'pair',
      title: `${listWords(h.names)} are paired`,
      why: `Both work the ${muscleWord(h.muscle)}, back to back, so the second one starts tired. Splits them into straight sets with full rest.`,
      days,
    },
    apply: (p) =>
      mapDays(p, days, (day) => ({
        ...day,
        blocks: day.blocks.flatMap((b) => (b.kind === 'pair' && pairKeys.has(b.items.map((it) => it.exerciseId).join('|')) ? b.items.map((it): PlanBlock => ({ ...b, kind: 'single', items: [it] })) : [b])),
      })),
  };
}

/** Days between two day indexes, around the week. */
const apart = (a: number, b: number, n: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b));

function frequency(plan: Plan, profile: ProfileOf): Found | null {
  if (plan.days.length < 3) return null;
  const sets = plan.days.map((d) => hardSets(d, profile));
  const halves = plan.days.map((d) => halfOf(d, profile));
  const adds: Array<{ word: string; to: number; item: PlanItem; block: PlanBlock }> = [];
  const added = new Map<number, Set<string>>();
  for (const major of MAJOR) {
    const trained = sets.map((s, i) => (setsFor(s, major.muscles) >= SESSION_SETS ? i : -1)).filter((i) => i >= 0);
    if (trained.length !== 1) continue;
    const home = trained[0]!;
    const half = major.upper ? 'upper' : 'lower';
    const options = plan.days
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => i !== home && halves[i] === half)
      .sort((a, b) => Number(apart(a.i, home, plan.days.length) <= 1) - Number(apart(b.i, home, plan.days.length) <= 1) || totalSets(sets[a.i]!) - totalSets(sets[b.i]!) || a.i - b.i);
    const target = options[0];
    if (!target) continue;
    const there = new Set([...target.d.blocks.flatMap((b) => b.items.map((it) => it.exerciseId)), ...(added.get(target.i) ?? [])]);
    // The plan's own exercise for it, from its home day: the first big lift, else the first one.
    const candidates = plan.days[home]!.blocks
      .filter((b) => isMainLift(b, profile))
      .flatMap((b) => b.items.map((item) => ({ b, item, p: profile(item.exerciseId) })))
      .filter(({ p, item }) => p.role === 'lift' && p.targets.some((m) => major.muscles.includes(m)) && !there.has(item.exerciseId));
    const pick = candidates.find((c) => isCompound(c.p)) ?? candidates[0];
    if (!pick) continue;
    adds.push({ word: major.word, to: target.d.n, item: pick.item, block: pick.b });
    added.set(target.i, new Set([...(added.get(target.i) ?? []), pick.item.exerciseId]));
  }
  if (!adds.length) return null;
  const words = adds.map((a) => a.word);
  const days = [...new Set(adds.map((a) => a.to))].sort((a, b) => a - b);
  return {
    tip: {
      id: 'freq',
      title: `${listWords(words).replace(/^./, (c) => c.toUpperCase())} ${words.length === 1 && !words[0]!.endsWith('s') ? 'gets' : 'get'} one session a week`,
      why: `Muscles grow best trained about twice a week. Adds ${FREQ_SETS} sets of each on another day, same split.`,
      days,
      detail: adds.map((a) => `${a.item.name} → Day ${a.to}`),
    },
    apply: (p) => {
      let out = p;
      for (const a of adds) out = mapDays(out, [a.to], (day) => insertLift(day, freqBlock(a.block, a.item), profile));
      return out;
    },
  };
}

/** The copy a frequency tip adds: the exercise alone, FREQ_SETS sets, the plan's reps and rest, no note. */
function freqBlock(b: PlanBlock, it: PlanItem): PlanBlock {
  const item: PlanItem = { ...it };
  delete item.note;
  if (item.weeks) item.weeks = item.weeks.map((w) => ({ ...w, sets: Math.min(w.sets, FREQ_SETS) }));
  const out: PlanBlock = { kind: 'single', items: [item], sets: FREQ_SETS };
  if (b.restSec !== undefined) out.restSec = b.restSec;
  return out;
}

function coreBlock(plan: Plan, profile: ProfileOf): Found | null {
  const days = plan.days
    .filter((d) => {
      const core = d.blocks.filter((b) => isCoreBlock(b, profile)).length;
      const main = d.blocks.filter((b) => isMainLift(b, profile)).length;
      return core > CORE_KEEP + 1 && main >= 3;
    })
    .map((d) => d.n);
  if (!days.length) return null;
  const count = Math.max(...days.map((n) => plan.days.find((d) => d.n === n)!.blocks.filter((b) => isCoreBlock(b, profile)).length));
  return {
    tip: {
      id: 'core',
      title: `${dayWords(days)}: ${count} abs exercises on top of legs`,
      why: `That is a lot of time for abs. A short block of ${CORE_KEEP} hits them just as well. Keeps the first ${CORE_KEEP}.`,
      days,
    },
    apply: (p) =>
      mapDays(p, days, (day) => {
        let kept = 0;
        return { ...day, blocks: day.blocks.filter((b) => !isCoreBlock(b, profile) || kept++ < CORE_KEEP) };
      }),
  };
}

// ---------------------------------------------------------------- transforms

function mapDays(plan: Plan, days: readonly number[], f: (day: PlanDay) => PlanDay): Plan {
  return { ...plan, days: plan.days.map((d) => (days.includes(d.n) ? f(d) : d)) };
}

/** The day's main lifts in SPEC 22 order (order.ts), in the slots they had; everything else stays put. */
function reorderLifts(day: PlanDay, profile: ProfileOf, focus: Muscle | null): PlanDay {
  const slots = day.blocks.map((b, i) => (isMainLift(b, profile) ? i : -1)).filter((i) => i >= 0);
  const ordered = orderUnits(
    slots.map((i) => ({ items: itemsOf(day.blocks[i]!, profile), ref: day.blocks[i]! })),
    focus ? { focus: [focus] } : {},
  );
  const blocks = [...day.blocks];
  slots.forEach((slot, k) => (blocks[slot] = ordered[k]!.ref));
  return { ...day, blocks };
}

/** A lift goes after the last compound before the day's first isolation (or after its first lift). */
function insertLift(day: PlanDay, block: PlanBlock, profile: ProfileOf): PlanDay {
  const blocks = [...day.blocks];
  const firstIso = blocks.findIndex((b) => isMainLift(b, profile) && !itemsOf(b, profile).some(isCompound));
  const end = firstIso === -1 ? blocks.length : firstIso;
  let at = -1;
  for (let i = 0; i < end; i++) if (isMainLift(blocks[i]!, profile)) at = i;
  if (at === -1) at = blocks.findIndex((b) => isMainLift(b, profile));
  blocks.splice(at + 1, 0, block);
  return { ...day, blocks };
}

// ---------------------------------------------------------------- the public side

const CHECKS = [hingeEarly, stretchesLast, heavyRest, sameMuscle, frequency, coreBlock];

function found(plan: Plan, profile: ProfileOf): Found[] {
  return CHECKS.map((c) => c(plan, profile)).filter((f): f is Found => f !== null);
}

/** The plan's coach tips, in SPEC 22 order. Empty when the plan does it all right. */
export function planTips(plan: Plan, profile: ProfileOf): Tip[] {
  return found(plan, profile).map((f) => f.tip);
}

/** The plan with these tips applied, in SPEC 22 order (any order of taps gives the same copy). */
export function applyTips(plan: Plan, ids: readonly TipId[], profile: ProfileOf): Plan {
  let out = plan;
  for (const f of found(plan, profile)) if (ids.includes(f.tip.id)) out = f.apply(out);
  return out;
}

// ---------------------------------------------------------------- tuned copies

/** A tuned copy's id: "<plan>~coach-<tip>.<tip>", tips in SPEC 22 order. */
export const TUNED_MARK = '~coach-';

export function tunedId(baseId: string, ids: readonly TipId[]): string {
  const sorted = TIP_IDS.filter((t) => ids.includes(t));
  return sorted.length ? `${baseId}${TUNED_MARK}${sorted.join('.')}` : baseId;
}

/** The base plan id and the tips of an id; a plain plan id has none. Unknown tip words are dropped. */
export function parseTunedId(id: string): { baseId: string; tips: TipId[] } {
  const at = id.indexOf(TUNED_MARK);
  if (at === -1) return { baseId: id, tips: [] };
  const words = id.slice(at + TUNED_MARK.length).split('.');
  return { baseId: id.slice(0, at), tips: TIP_IDS.filter((t) => words.includes(t)) };
}

/** "<plan> (coach tuned)" (SPEC 22). */
export const tunedName = (name: string): string => `${name} (coach tuned)`;

/** The coach tuned copy of a plan, or null when none of the tips apply to it. */
export function tunedPlan(base: Plan, ids: readonly TipId[], profile: ProfileOf): Plan | null {
  const live = planTips(base, profile).map((t) => t.id).filter((t) => ids.includes(t));
  if (!live.length) return null;
  return { ...applyTips(base, live, profile), id: tunedId(base.id, live), name: tunedName(base.name) };
}
