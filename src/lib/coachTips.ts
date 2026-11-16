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

import type { Plan, PlanBlock, PlanDay } from './plans';
import { SQUAT_HINGE_PRESS, heaviestOf, isCompound, muscleWord, sameMusclePair, type Muscle } from './order';
import { CORE_KEEP, HEAVY_REST_SEC, TIP_IDS, dayWords, isCoreBlock, isMainLift, isStaticStretch, itemsOf, listWords, mapDays, ordinal, reorderLifts, type Found, type ProfileOf, type Tip, type TipId } from './coachTipsRead';
import { frequency } from './coachTipsFreq';

export { CORE_KEEP, FREQ_SETS, HEAVY_REST_SEC, SESSION_SETS, TIP_IDS } from './coachTipsRead';
export type { ProfileOf, Tip, TipId } from './coachTipsRead';
export { freqAdds } from './coachTipsFreq';

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

// ---------------------------------------------------------------- the checks

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
    const heavy = heaviestOf(lifts.flatMap((b) => itemsOf(b, profile)), SQUAT_HINGE_PRESS);
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
