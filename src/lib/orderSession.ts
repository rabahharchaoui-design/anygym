// Smart structure for one session (PLAN 3.5f, SPEC 22): a day for one area, built the way a good
// coach lays it out. Pure (moved in beside order.ts; everyone imports it from lib/order).
//   1. the biggest compound first, while fresh, with the best gear the gym has (the ladder's first
//      candidate this gym can do: a barbell bench, else dumbbells, else what is there);
//   2. an angle variation: a second compound that loads the area another way (an incline after a
//      flat press, a pulldown after a row, a hinge after a squat);
//   3. an isolation that finishes the area (a fly, a rear delt raise, a leg extension);
//   4. a finisher pair with a non competing muscle (order.ts canPair), one shared rest per round;
//   5. about 6 to 10 hard sets per muscle: the area's most trained muscle gets 6 to 10 (5 at 15
//      minutes, where 6 cannot fit with full rest) and no muscle gets more than 10;
//   6. rest by type (order.ts restFor): compounds 2 to 3 min, isolation 60 to 90 s, a pair shares
//      one rest. To fit the minutes the isolation rest goes first, never a compound's.
// The minutes come from the one estimate (plans.ts estimateDayMinutes), handed in by the caller.
import type { Pattern } from './swap';
import { type Goal, type Muscle, type Profile, canPair, isCompound, restFor } from './order';

export const SESSION_AREAS = ['chest', 'back', 'shoulders', 'legs'] as const;
export type SessionArea = (typeof SESSION_AREAS)[number];

export type SessionRole = 'main' | 'angle' | 'isolation' | 'finisher';

type AreaRule = {
  /** The card's words: "Chest day". */
  title: string;
  /** The muscles whose hard sets are counted. */
  muscles: readonly Muscle[];
  main: readonly Pattern[];
  angle: readonly Pattern[];
  isolation: readonly Pattern[];
  /** The finisher pair: one of the first patterns with one of the second (a non competing muscle). */
  finisher: readonly [readonly Pattern[], readonly Pattern[]];
  /** More pairs for a long session, in order. */
  extra: ReadonlyArray<readonly [readonly Pattern[], readonly Pattern[]]>;
};

export const AREA_RULES: Record<SessionArea, AreaRule> = {
  chest: {
    title: 'Chest day',
    muscles: ['chest'],
    main: ['horizontal push'],
    angle: ['horizontal push'],
    isolation: ['chest isolation'],
    finisher: [['triceps'], ['biceps', 'rear delt', 'core']],
    extra: [
      [['lateral delt'], ['core', 'calves', 'biceps']],
      [['rear delt'], ['calves', 'core']],
    ],
  },
  back: {
    title: 'Back day',
    muscles: ['back'],
    main: ['horizontal pull', 'vertical pull'],
    angle: ['vertical pull', 'horizontal pull'],
    isolation: ['rear delt'],
    finisher: [['biceps'], ['triceps', 'lateral delt', 'core']],
    extra: [
      [['lateral delt'], ['core', 'calves']],
      [['core'], ['calves']],
    ],
  },
  shoulders: {
    title: 'Shoulder day',
    muscles: ['front delts', 'side delts', 'rear delts'],
    main: ['vertical push'],
    // A second press from another angle where the gym has one; the raises cover the side and the back.
    angle: ['vertical push'],
    isolation: ['lateral delt', 'rear delt'],
    finisher: [['triceps'], ['biceps', 'core']],
    extra: [[['core'], ['calves']]],
  },
  legs: {
    title: 'Leg day',
    muscles: ['quads', 'hamstrings', 'glutes'],
    main: ['squat'],
    angle: ['hinge', 'lunge', 'glutes'],
    isolation: ['quads isolation', 'hamstrings isolation'],
    finisher: [['calves'], ['core']],
    extra: [[['hamstrings isolation', 'quads isolation'], ['core', 'calves']]],
  },
};

/** How a lift is angled, from its plain name: an incline press is not a flat one. */
export function angleOf(p: Pick<Profile, 'name' | 'pattern'>): string {
  const n = p.name.toLowerCase();
  const tilt = /incline/.test(n) ? 'incline' : /decline/.test(n) ? 'decline' : 'flat';
  return `${p.pattern ?? 'none'}:${tilt}`;
}

export type SessionItem = {
  id: string;
  pattern: Pattern;
  role: SessionRole;
  sets: number;
  reps: [number, number];
  restSec: number;
  /** Items sharing a group are a pair, done back to back. */
  group?: number;
  compound: boolean;
};

export type SessionInput = {
  area: SessionArea;
  minutes: number;
  /** Per pattern: what this gym surely has and this person may get, best gear first. */
  pool: (pattern: Pattern) => readonly Profile[];
  goal?: Goal;
  reps: { compound: [number, number]; isolation: [number, number] };
  /** Starting sets (SPEC 7.3) and the most any item gets. */
  sets: { compound: number; isolation: number; max: number };
  /** The one estimate (SPEC 7.4), over the items in order. */
  minutesOf: (items: readonly SessionItem[]) => number;
};

export type SessionPlan = {
  area: SessionArea;
  items: SessionItem[];
  minutes: number;
  /** Hard sets for the area's muscles. */
  hardSets: number;
};

/** A pair's one shared rest (SPEC 22 rule 6: isolation 60 to 90 s). */
export const PAIR_REST = 75;
export const ISOLATION_REST = { min: 60, max: 90 } as const;
export const HARD_SETS = { min: 6, max: 10, minShort: 5 } as const;
/** A session is within this many minutes under the minutes picked, or says less honestly. */
const UNDER = 2;

type Draft = SessionItem & { profile: Profile };

const hits = (p: Profile, muscles: readonly Muscle[]) => p.targets.some((m) => muscles.includes(m));

/** Hard sets per muscle: every set of a move that trains it hard. */
export function hardSetsBy(items: readonly { sets: number; profile: Profile }[]): Map<Muscle, number> {
  const out = new Map<Muscle, number>();
  for (const it of items) for (const m of new Set(it.profile.targets)) out.set(m, (out.get(m) ?? 0) + it.sets);
  return out;
}

/** The area's hard sets: those of its most trained muscle (a leg day: quads, hamstrings or glutes). */
export function hardSetsOf(items: readonly { sets: number; profile: Profile }[], muscles: readonly Muscle[]): number {
  const by = hardSetsBy(items);
  return Math.max(0, ...muscles.map((m) => by.get(m) ?? 0));
}

const ROLE_ORDER: Record<SessionRole, number> = { main: 0, angle: 1, isolation: 2, finisher: 3 };

/**
 * One session for `area` in `minutes`, or null when the gym has no big lift for it plus one more
 * move for the same area, or the minutes cannot hold the least hard sets at full compound rest
 * (never padded with another area's work, never a compound's rest cut).
 */
export function structureSession(input: SessionInput): SessionPlan | null {
  const rule = AREA_RULES[input.area];
  const goal = input.goal ?? 'muscle';
  const used = new Set<string>();
  const firstOf = (patterns: readonly Pattern[], ok: (p: Profile) => boolean = () => true): Profile | undefined => {
    for (const pattern of patterns) {
      const p = input.pool(pattern).find((x) => !used.has(x.id) && x.role === 'lift' && ok(x));
      if (p) return p;
    }
    return undefined;
  };
  const single = (p: Profile, role: SessionRole): Draft => {
    const compound = isCompound(p);
    return { id: p.id, pattern: p.pattern!, role, profile: p, compound, sets: Math.min(input.sets.max, compound ? input.sets.compound : input.sets.isolation), reps: compound ? input.reps.compound : input.reps.isolation, restSec: restFor(p, goal) };
  };

  // 1. The biggest compound the gym has for the area: the best candidate of each main pattern, the biggest of those.
  const mains = rule.main.map((pattern) => input.pool(pattern).find((x) => x.role === 'lift' && isCompound(x))).filter((p): p is Profile => !!p);
  const mainP = mains.reduce<Profile | undefined>((best, p) => (!best || p.load > best.load ? p : best), undefined);
  if (!mainP) return null;
  used.add(mainP.id);
  const main = single(mainP, 'main');

  // 2. The angle variation: a compound that loads the area another way, never bigger than the first.
  const angleP = firstOf(rule.angle, (p) => isCompound(p) && angleOf(p) !== angleOf(mainP) && p.load <= mainP.load);
  if (angleP) used.add(angleP.id);
  // 3. Isolation for the area, one per pattern.
  const isoPs: Profile[] = [];
  for (const pattern of rule.isolation) {
    const p = firstOf([pattern], (x) => !isCompound(x));
    if (p) {
      used.add(p.id);
      isoPs.push(p);
    }
  }

  // 4. Pairs: two small moves that share no muscle, neither a heavy lift (SPEC 22 rule 5).
  let groups = 0;
  const pairOf = ([first, second]: readonly [readonly Pattern[], readonly Pattern[]]): Draft[] | null => {
    const a = firstOf(first, (p) => !isCompound(p));
    if (!a) return null;
    const b = firstOf(second, (p) => !isCompound(p) && p.id !== a.id && canPair(a, p));
    if (!b) return null;
    used.add(a.id);
    used.add(b.id);
    const g = groups++;
    const rounds = Math.min(input.sets.max, input.sets.isolation);
    return [a, b].map((p) => ({ ...single(p, 'finisher'), sets: rounds, restSec: PAIR_REST, group: g }));
  };

  const short = input.minutes <= 20;
  const least = short ? HARD_SETS.minShort : HARD_SETS.min;
  const minutes = (items: readonly Draft[]) => input.minutesOf(items);
  const hard = (items: readonly Draft[]) => hardSetsOf(items, rule.muscles);
  const capped = (items: readonly Draft[]) => Math.max(0, ...hardSetsBy(items).values()) <= HARD_SETS.max;
  const fits = (items: readonly Draft[]) => minutes(items) <= input.minutes && capped(items);
  const clone = (items: readonly Draft[]) => items.map((it) => ({ ...it }));

  // The smallest honest session: the big lift and one more move that trains the area hard. With
  // little time the isolation comes before the second big lift (its rest is shorter).
  const areaIso = isoPs.find((p) => hits(p, rule.muscles));
  const seconds = (short ? [areaIso && single(areaIso, 'isolation'), angleP && single(angleP, 'angle')] : [angleP && single(angleP, 'angle'), areaIso && single(areaIso, 'isolation')]).filter((d): d is Draft => !!d);
  let items: Draft[] | null = null;
  for (const second of seconds) {
    const tryItems = [{ ...main }, second];
    // Too long: the isolation rest goes first (never a compound's), then a set of the second move, then of the first.
    for (let guard = 0; minutes(tryItems) > input.minutes && guard < 20; guard++) {
      const iso = tryItems.find((it) => !it.compound && it.restSec > ISOLATION_REST.min);
      if (iso) iso.restSec = ISOLATION_REST.min;
      else if (hard(tryItems) > least) (tryItems[1]!.sets > 2 ? tryItems[1]! : tryItems[0]!).sets--;
      else break;
    }
    if (minutes(tryItems) <= input.minutes && hard(tryItems) >= least && tryItems.every((it) => it.sets >= 2)) {
      items = tryItems;
      break;
    }
  }
  if (!items) return null;
  const has = (p: Profile | undefined) => !!p && items!.some((it) => it.id === p.id);

  // Add, in the coach's order, whatever still fits: the angle, the isolation, the finisher pair, more pairs.
  const tryAdd = (more: readonly Draft[]): boolean => {
    const next = [...clone(items!), ...clone(more)];
    // Over the hard set cap: the isolation gives a set first, then the angle; the first lift keeps its sets.
    for (let guard = 0; !capped(next) && guard < 10; guard++) {
      const cut = [...next].reverse().find((it) => it.role === 'isolation' && it.sets > 2) ?? [...next].reverse().find((it) => it.role === 'angle' && it.sets > 2);
      if (!cut) break;
      cut.sets--;
    }
    if (!fits(next)) {
      // One more try with the isolation rest at its floor.
      for (const it of next) if (!it.compound && it.group === undefined) it.restSec = ISOLATION_REST.min;
      if (!fits(next)) return false;
    }
    items = next;
    return true;
  };
  if (angleP && !has(angleP)) tryAdd([single(angleP, 'angle')]);
  for (const p of isoPs.slice(0, 1)) if (!has(p)) tryAdd([single(p, 'isolation')]);
  const finisher = pairOf(rule.finisher);
  if (finisher) tryAdd(finisher);
  for (const p of isoPs.slice(1)) if (!has(p)) tryAdd([single(p, 'isolation')]);
  for (const extra of rule.extra) {
    if (minutes(items) >= input.minutes - UNDER) break;
    const pair = pairOf(extra);
    if (pair) tryAdd(pair);
  }

  // Still short: one more set where it fits (the area first, to its cap), then a little more isolation rest.
  const grow = (pick: (it: Draft) => boolean): boolean => {
    const now = items!;
    for (let i = 0; i < now.length; i++) {
      const it = now[i]!;
      if (!pick(it) || it.sets >= input.sets.max) continue;
      // A pair grows as one, once.
      if (it.group !== undefined && now.findIndex((x) => x.group === it.group) !== i) continue;
      const next = clone(now);
      for (const x of next) if (x.id === it.id || (it.group !== undefined && x.group === it.group)) x.sets++;
      if (fits(next)) {
        items = next;
        return true;
      }
    }
    return false;
  };
  for (let guard = 0; minutes(items) < input.minutes - UNDER && guard < 60; guard++) {
    if (grow((it) => it.group === undefined && hits(it.profile, rule.muscles)) || grow((it) => it.group !== undefined) || grow((it) => it.group === undefined)) continue;
    const next = clone(items);
    const iso = next.find((it) => !it.compound && it.group === undefined && it.restSec + 15 <= ISOLATION_REST.max);
    if (!iso) break;
    iso.restSec += 15;
    if (!fits(next)) break;
    items = next;
  }

  // The coach's order: the big lift, the angle, the isolation, then the pairs (a pair stays together).
  const out = items.map((it, i) => ({ it, i })).sort((a, b) => ROLE_ORDER[a.it.role] - ROLE_ORDER[b.it.role] || a.i - b.i).map((x) => x.it);
  return { area: input.area, items: out.map(({ profile: _p, ...it }) => (void _p, it)), minutes: minutes(out), hardSets: hard(out) };
}
