// PLAN 3.5f (3) smart structure: property tests over the real data on every place preset at 15, 30,
// 45 and 60 minutes: the biggest compound first with the best gear the gym has, an angle variation,
// an isolation, a finisher pair with a non competing muscle, 6 to 10 hard sets per muscle, rest by
// type, and the one time estimate.
import { describe, expect, it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { profileFor } from '../../data/order';
import { demoFor } from '../../data/exerciseInfo';
import { equipmentPreset } from '../../db/gyms';
import { GYM_TYPE_OF, presetEquipment } from '../intake/funnel';
import type { GeneratorInput } from '../generator';
import type { GymKit } from '../picker';
import { AREA_RULES, HARD_SETS, ISOLATION_REST, PAIR_REST, SESSION_AREAS, angleOf, canPair, hardSetsBy, isCompound, isHeavy, restFor, structureSession, type Profile, type SessionArea, type SessionItem } from '../order';
import { QUICK_MINUTES, conceptMinutes, focusCard, focusCards, focusOrder, quickDepsFor, quickTitleOf, sureGear, type Concept } from '../quick';
import { quickMinutes } from '../quickStyles';
import { workoutIdOf, type Pattern } from '../swap';

const PLACES = ['full', 'hotel', 'home', 'outdoors', 'mix'] as const;
const kitOf = (place: (typeof PLACES)[number]): GymKit => ({ equipment: presetEquipment(place), dumbbellRange: equipmentPreset(GYM_TYPE_OF[place], 'lb').dumbbellRange });
const EXPERIENCES = ['new', '1_2y', '3y'] as const;
const base = (gym: GymKit, experience: GeneratorInput['experience'], goal: 'muscle' | 'strength' = 'muscle'): GeneratorInput => ({ goals: [goal], gym, experience });

type Case = { label: string; area: SessionArea; minutes: number; gym: GymKit; input: GeneratorInput; card: Concept | null };
const CASES: Case[] = [];
for (const place of PLACES)
  for (const experience of EXPERIENCES)
    for (const minutes of QUICK_MINUTES)
      for (const area of SESSION_AREAS) {
        const gym = kitOf(place);
        const input = base(gym, experience);
        CASES.push({ label: `${place} ${experience} ${minutes} ${area}`, area, minutes, gym, input, card: focusCard(area, { base: input, minutes, recent: [] }, QUICK_DEPS) });
      }
const BUILT = CASES.filter((c): c is Case & { card: Concept } => c.card !== null);
const P = (id: string) => profileFor(id);

/** The first candidate of a pattern this person may get at this gym (the ladder's order: best gear first). */
const bestOf = (c: Case, pattern: Pattern): string | undefined => {
  const deps = quickDepsFor(c.input, QUICK_DEPS);
  return SWAP_DATA.patterns[pattern].candidates.filter((x) => !x.timed).map(workoutIdOf).find((id) => deps.usable(id) && sureGear(SWAP_DATA, id, c.gym));
};

describe('3.5f (3) smart structure on every place preset at 15, 30, 45, 60', () => {
  it('covers every preset, and builds days where the gym has the moves', () => {
    expect(CASES).toHaveLength(PLACES.length * EXPERIENCES.length * QUICK_MINUTES.length * SESSION_AREAS.length);
    // A full gym has a chest, a shoulder and a leg day at every length, and a back day from 30 min.
    for (const minutes of QUICK_MINUTES) {
      const got = BUILT.filter((c) => c.label.startsWith(`full 1_2y ${minutes} `)).map((c) => c.area);
      expect(got, `full ${minutes}`).toEqual(expect.arrayContaining(['chest', 'shoulders', 'legs']));
      if (minutes >= 30) expect(got).toContain('back');
    }
    // No equipment: no day is made up (bodyweight moves have no demo we are sure of yet).
    expect(BUILT.filter((c) => c.label.startsWith('outdoors') || c.label.startsWith('home'))).toEqual([]);
    expect(BUILT.length).toBeGreaterThan(60);
  });

  it('only sure moves: a sure demo and gear this gym surely has', () => {
    for (const c of BUILT)
      for (const it of c.card.items) {
        expect(demoFor(it.id), `${c.label} ${it.id}`).not.toBeNull();
        expect(sureGear(SWAP_DATA, it.id, c.gym), `${c.label} ${it.id}`).toBe(true);
      }
  });

  it('the biggest compound first, with the best gear the gym has', () => {
    for (const c of BUILT) {
      const first = c.card.items[0]!;
      const p = P(first.id);
      expect(isCompound(p), `${c.label} first is a compound`).toBe(true);
      expect(first.group, `${c.label} the first lift is never paired`).toBeUndefined();
      // Nothing on the card is a bigger lift.
      for (const it of c.card.items) expect(P(it.id).load, `${c.label} ${it.id}`).toBeLessThanOrEqual(p.load);
      // The best gear: it is the ladder's first move this gym can do for one of the area's main patterns.
      const best = AREA_RULES[c.area].main.map((pattern) => bestOf(c, pattern)).filter(Boolean);
      expect(best, `${c.label} best gear`).toContain(first.id);
    }
  });

  it('then an angle variation, then an isolation, where the gym has them and the time allows', () => {
    for (const c of BUILT) {
      const ps = c.card.items.map((it) => P(it.id));
      const compounds = ps.filter(isCompound);
      // Every compound comes before every small move (SPEC 22 rule 1), so no helper is tired first (rule 3).
      const lastCompound = Math.max(...ps.map((p, i) => (isCompound(p) ? i : -1)));
      const firstSmall = ps.findIndex((p) => !isCompound(p));
      if (firstSmall !== -1) expect(lastCompound, `${c.label} compounds first`).toBeLessThan(firstSmall);
      // A second compound is a different angle of the area, never the same press twice, never bigger than the first.
      for (const p of compounds.slice(1)) {
        expect(angleOf(p), `${c.label} angle`).not.toBe(angleOf(compounds[0]!));
        expect(p.targets.some((m) => AREA_RULES[c.area].muscles.includes(m)), `${c.label} angle trains the area`).toBe(true);
      }
      // From 30 min, a gym with an angle variation gets it, right after the first lift.
      if (c.minutes >= 30) {
        const main = ps[0]!;
        const deps = quickDepsFor(c.input, QUICK_DEPS);
        const hasAngle = AREA_RULES[c.area].angle.some((pattern) =>
          SWAP_DATA.patterns[pattern].candidates.map(workoutIdOf).some((id) => id !== main.id && deps.usable(id) && sureGear(SWAP_DATA, id, c.gym) && isCompound(P(id)) && angleOf(deps.profileOf(id, deps.name(id))) !== angleOf(deps.profileOf(main.id, deps.name(main.id))) && P(id).load <= main.load),
        );
        if (hasAngle) expect(isCompound(ps[1]!), `${c.label} angle second`).toBe(true);
      }
      // An isolation for the area follows the compounds when the gym has one.
      const iso = ps.findIndex((p) => !isCompound(p) && c.card.items[ps.indexOf(p)]!.group === undefined);
      if (iso !== -1) expect(iso, `${c.label} isolation after the lifts`).toBeGreaterThan(lastCompound);
    }
    // G's example: a 30 min chest day at a full gym: a barbell press first, a second angle, then a fly.
    const chest = BUILT.find((c) => c.label === 'full 1_2y 30 chest')!.card.items;
    expect(chest.map((it) => it.pattern)).toEqual(['horizontal push', 'horizontal push', 'chest isolation']);
    expect(chest[0]!.name).toMatch(/Barbell/);
    expect(angleOf(P(chest[0]!.id))).not.toBe(angleOf(P(chest[1]!.id)));
    // No barbell: dumbbells lead (the best gear the gym has).
    const noBar: GymKit = { equipment: kitOf('full').equipment.filter((e) => e !== 'barbell_rack' && e !== 'smith_machine'), dumbbellRange: { min: 5, max: 100, step: 5 } };
    const db = focusCard('chest', { base: base(noBar, '1_2y'), minutes: 30, recent: [] }, QUICK_DEPS)!;
    expect(db.items[0]!.name).toBe('Dumbbell Bench Press');
  });

  it('the finisher is a pair with a non competing muscle, last, sharing one rest', () => {
    let pairs = 0;
    for (const c of BUILT) {
      const items = c.card.items;
      const groups = new Map<number, typeof items>();
      for (const it of items) if (it.group !== undefined) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
      for (const g of groups.values()) {
        pairs++;
        expect(g, `${c.label} a pair is two`).toHaveLength(2);
        const [a, b] = g.map((it) => P(it.id));
        expect(canPair(a!, b!), `${c.label} ${a!.id} + ${b!.id}`).toBe(true);
        expect(a!.targets.some((m) => b!.targets.includes(m))).toBe(false);
        expect(isHeavy(a!) || isHeavy(b!) || isCompound(a!) || isCompound(b!)).toBe(false);
        expect(g[0]!.sets).toBe(g[1]!.sets);
        expect(g[0]!.restSec).toBe(PAIR_REST);
        expect(g[1]!.restSec).toBe(PAIR_REST);
        // Partners sit next to each other.
        expect(Math.abs(items.indexOf(g[0]!) - items.indexOf(g[1]!))).toBe(1);
      }
      // Every single comes before every pair: the pairs finish the day.
      const firstPair = items.findIndex((it) => it.group !== undefined);
      if (firstPair !== -1) expect(items.slice(firstPair).every((it) => it.group !== undefined), `${c.label} pairs last`).toBe(true);
    }
    expect(pairs).toBeGreaterThan(20);
    // A full gym's 45 min chest day ends on one.
    expect(BUILT.find((c) => c.label === 'full 1_2y 45 chest')!.card.items.some((it) => it.group !== undefined)).toBe(true);
  });

  it('6 to 10 hard sets for the area (5 at 15 min), and never more than 10 for any muscle', () => {
    for (const c of BUILT) {
      const by = hardSetsBy(c.card.items.map((it) => ({ sets: it.sets, profile: P(it.id) })));
      const area = Math.max(...AREA_RULES[c.area].muscles.map((m) => by.get(m) ?? 0));
      expect(area, `${c.label} area sets`).toBeGreaterThanOrEqual(c.minutes <= 20 ? HARD_SETS.minShort : HARD_SETS.min);
      for (const [m, n] of by) expect(n, `${c.label} ${m}`).toBeLessThanOrEqual(HARD_SETS.max);
      for (const it of c.card.items) expect(it.sets).toBeGreaterThanOrEqual(2);
    }
  });

  it('rest by type: compounds 2 to 3 min and never cut, isolation 60 to 90 s, reps from the goal', () => {
    for (const c of BUILT)
      for (const it of c.card.items) {
        const p = P(it.id);
        if (it.group !== undefined) continue;
        if (isCompound(p)) {
          expect(it.restSec, `${c.label} ${it.id}`).toBe(restFor(p, 'muscle'));
          expect(it.restSec).toBeGreaterThanOrEqual(120);
          expect(it.restSec).toBeLessThanOrEqual(180);
          expect(it.reps).toEqual([8, 12]);
        } else {
          expect(it.restSec, `${c.label} ${it.id}`).toBeGreaterThanOrEqual(ISOLATION_REST.min);
          expect(it.restSec).toBeLessThanOrEqual(ISOLATION_REST.max);
          expect(it.reps).toEqual([10, 15]);
        }
      }
    // A strength goal: heavy compounds rest 3 min and lift 4 to 6.
    const s = focusCard('legs', { base: base(kitOf('full'), '3y', 'strength'), minutes: 45, recent: [] }, QUICK_DEPS)!;
    expect(s.items[0]!.restSec).toBe(180);
    expect(s.items[0]!.reps).toEqual([4, 6]);
  });

  it('the one time estimate: never over the minutes, and the card says its own number', () => {
    for (const c of BUILT) {
      expect(c.card.minutes, c.label).toBe(conceptMinutes(c.card));
      expect(c.card.minutes).toBe(quickMinutes(c.card.items));
      expect(c.card.minutes, `${c.label} over`).toBeLessThanOrEqual(c.minutes);
      if (c.card.minutes < c.minutes - 2) expect(c.card.short, `${c.label} short said`).toBe('moves');
      expect(new Set(c.card.items.map((it) => it.id)).size).toBe(c.card.items.length);
    }
  });

  it('never list, go easy on and loved moves are honoured', () => {
    const gym = kitOf('full');
    const plain = focusCard('chest', { base: base(gym, '1_2y'), minutes: 45, recent: [] }, QUICK_DEPS)!;
    const first = plain.items[0]!.id;
    const without = focusCard('chest', { base: { ...base(gym, '1_2y'), never: [first] }, minutes: 45, recent: [] }, QUICK_DEPS)!;
    expect(without.items.map((it) => it.id)).not.toContain(first);
    const second = plain.items[1]!.id;
    const loved = focusCard('chest', { base: { ...base(gym, '1_2y'), love: [second] }, minutes: 45, recent: [] }, QUICK_DEPS)!;
    expect(loved.items[0]!.id).toBe(second);
    const sore = focusCard('shoulders', { base: { ...base(gym, '1_2y'), easyOn: ['shoulders'] }, minutes: 30, recent: [] }, QUICK_DEPS);
    expect(sore).toBeNull();
    // A left swipe ranks a move lower: the next best leads instead.
    const soft = focusCard('chest', { base: { ...base(gym, '1_2y'), soft: { [first]: 2 } }, minutes: 45, recent: [] }, QUICK_DEPS)!;
    expect(soft.items[0]!.id).not.toBe(first);
  });

  it('the person’s focus areas come first, and a started day keeps its name', () => {
    expect(focusOrder(['back', 'arms', 'glutes'])).toEqual(['back', 'legs', 'chest', 'shoulders']);
    expect(focusOrder(undefined)).toEqual([...SESSION_AREAS]);
    const cards = focusCards({ base: { ...base(kitOf('full'), '1_2y'), focus: ['legs'] }, minutes: 45, recent: [] }, QUICK_DEPS);
    expect(cards[0]!.title).toBe('Leg day');
    expect(cards.map((c) => c.id)).toEqual(cards.map(() => 'focus'));
    expect(quickTitleOf('focus:chest')).toBe('Chest day');
    expect(quickTitleOf('focus:nope')).toBe('Quick workout');
  });
});

describe('3.5f (3) structureSession, pure', () => {
  const prof = (id: string, pattern: Pattern, tier: number, load: number, targets: Profile['targets'], helpers: Profile['helpers'] = []): Profile => ({ id, name: id, pattern, role: 'lift', targets, helpers, tier, load });
  const POOL: Partial<Record<Pattern, Profile[]>> = {
    'horizontal push': [prof('Barbell Bench', 'horizontal push', 0, 8, ['chest'], ['triceps', 'front delts']), prof('Incline Dumbbell Press', 'horizontal push', 0, 7, ['chest'], ['triceps', 'front delts']), prof('Dumbbell Bench', 'horizontal push', 0, 7, ['chest'], ['triceps'])],
    'chest isolation': [prof('Cable Fly', 'chest isolation', 2, 2, ['chest'])],
    triceps: [prof('Pushdown', 'triceps', 2, 1, ['triceps'])],
    biceps: [prof('Curl', 'biceps', 2, 2, ['biceps'])],
  };
  const minutesOf = (items: readonly SessionItem[]) => quickMinutes(items.map((it) => ({ ...it, name: it.id })));
  const run = (minutes: number, pool = POOL) => structureSession({ area: 'chest', minutes, pool: (p) => pool[p] ?? [], reps: { compound: [8, 12], isolation: [10, 15] }, sets: { compound: 3, isolation: 3, max: 4 }, minutesOf });

  it('G’s 30 min chest day: bench, incline, fly, then triceps with biceps when it fits', () => {
    const r = run(45)!;
    expect(r.items.map((it) => `${it.id}:${it.role}`)).toEqual(['Barbell Bench:main', 'Incline Dumbbell Press:angle', 'Cable Fly:isolation', 'Pushdown:finisher', 'Curl:finisher']);
    expect(r.items[3]!.group).toBe(r.items[4]!.group);
    expect(r.hardSets).toBeGreaterThanOrEqual(6);
    expect(r.hardSets).toBeLessThanOrEqual(10);
    const short = run(30)!;
    expect(short.items.slice(0, 3).map((it) => it.id)).toEqual(['Barbell Bench', 'Incline Dumbbell Press', 'Cable Fly']);
    expect(short.minutes).toBeLessThanOrEqual(30);
  });

  it('a flat press is never the angle variation of a flat press', () => {
    const flat = { ...POOL, 'horizontal push': [POOL['horizontal push']![0]!, POOL['horizontal push']![2]!] };
    expect(run(45, flat)!.items.filter((it) => it.role === 'angle')).toEqual([]);
  });

  it('no big lift, or nothing else for the area: no day (never padded)', () => {
    expect(run(45, { 'chest isolation': POOL['chest isolation']!, triceps: POOL.triceps!, biceps: POOL.biceps! })).toBeNull();
    expect(run(45, { 'horizontal push': [POOL['horizontal push']![0]!], triceps: POOL.triceps!, biceps: POOL.biceps! })).toBeNull();
  });

  it('too little time for 5 hard sets at full rest: no day', () => {
    expect(run(8)).toBeNull();
  });
});
