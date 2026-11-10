// PLAN 3.5b: Quick workout ideas, diverse and full. Property tests over random gyms, intakes and
// histories for the diversity rule and the rotation, and the time math on every length and every
// place preset (lib/quickStyles.ts, lib/quick.ts buildIdeas).
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import { profileFor } from '../../data/order';
import type { GymKit } from '../picker';
import type { GeneratorInput } from '../generator';
import { presetEquipment } from '../intake/funnel';
import { EXPERIENCE, PLACES, type ExperienceId, type GoalId } from '../intake/options';
import { isHeavy, type Muscle } from '../order';
import { estimateDayMinutes } from '../plans';
import { requiresOf } from '../swap';
import { dayWorkout, quickEntry, restAfter, upNext, type WorkoutEntry } from '../planWorkout';
import { applyTrim, trimmedPlan } from '../timeBudget';
import {
  buildIdeas,
  buildStyleCards,
  conceptMinutes,
  daysSince,
  fewerLine,
  gearOf,
  metaLine,
  needsEasy,
  planConcept,
  QUICK_MINUTES,
  quickAvoids,
  regroup,
  restedLine,
  safePairs,
  shortLine,
  sureGear,
  type Concept,
  type QuickItem,
} from '../quick';
import { buildCard, chooseBatch, densityFor, diverse, quickDayOf, quickMinutes, STYLE_ORDER, STYLES, styleSpec, structureOf, type Pickable, type StyleId } from '../quickStyles';

/** A small seeded random (mulberry32): the same cases every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const some = <T,>(r: () => number, xs: readonly T[], p: number): T[] => xs.filter(() => r() < p);

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const MUSCLES: Muscle[] = ['quads', 'glutes', 'hamstrings', 'lower back', 'calves', 'chest', 'front delts', 'side delts', 'rear delts', 'back', 'biceps', 'triceps', 'abs'];
const GOALS: GoalId[] = ['muscle', 'strength', 'fat_loss', 'health', 'tone', 'athletic', 'comeback', 'race'];
const EXPS = EXPERIENCE.map((e) => e.id) as ExperienceId[];
const NOW = new Date(2026, 10, 9, 18, 0).getTime();
const DAY = 86_400_000;

const placeGym = (place: (typeof PLACES)[number]['id']): GymKit => {
  const equipment = presetEquipment(place);
  return { equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null };
};

function randomGym(r: () => number): GymKit {
  if (r() < 0.3) return placeGym(pick(r, PLACES).id);
  const equipment = some(r, EQUIPMENT_IDS, 0.2 + r() * 0.7) as EquipmentId[];
  return { equipment, dumbbellRange: r() < 0.8 ? { min: 5, max: 50 + Math.floor(r() * 4) * 10, step: 5 } : null };
}

function randomInput(r: () => number, gym: GymKit): GeneratorInput {
  const input: GeneratorInput = { goals: [pick(r, GOALS)], experience: pick(r, EXPS), gym };
  if (r() < 0.3) input.easyOn = some(r, ['lower_back', 'knees', 'shoulders', 'wrists', 'neck', 'hips'], 0.4);
  if (r() < 0.2) input.never = some(r, ['leg-press', 'dumbbell-lateral-raise', 'crunch', 'barbell-back-squat', 'cable-tricep-pushdown'], 0.5);
  return input;
}

function randomHistory(r: () => number) {
  const lastTrained: Partial<Record<Muscle, number>> = {};
  if (r() < 0.7) for (const m of some(r, MUSCLES, 0.5)) lastTrained[m] = NOW - Math.floor(r() * 12) * DAY - Math.floor(r() * 10) * 3_600_000;
  const recent = MUSCLES.filter((m) => lastTrained[m] !== undefined && NOW - lastTrained[m]! < 3 * DAY);
  const done: string[] = some(r, STYLE_ORDER, 0.3).slice(0, 2);
  return { lastTrained, recent, done };
}

/** The pairs of cards on screen are all diverse (and so is every card More ideas can swap in). */
function expectDiverse(cards: readonly Concept[], label: string) {
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) expect(diverse(cards[i]!.primary, cards[j]!.primary), `${label}: ${cards[i]!.id} vs ${cards[j]!.id}`).toBe(true);
}

/** Every card: sure demos, sure gear, a true name, its own estimate and meta line. */
function expectHonestCards(cards: readonly Concept[], gym: GymKit, minutes: number, label: string) {
  for (const c of cards) {
    // 3.5b round 2: the plan card may be the honest smaller one (1 or 2 lifts) when the day cannot fit.
    expect(c.items.length, `${label} ${c.id}`).toBeGreaterThanOrEqual(c.id === 'plan' ? 1 : 3);
    for (const it of c.items) {
      expect(demoFor(it.id), `${label} ${c.id} ${it.id} demo`).not.toBeNull();
      expect(sureGear(SWAP_DATA, it.id, gym), `${label} ${c.id} ${it.id} gear`).toBe(true);
    }
    expect(new Set(c.items.map((it) => SWAP_DATA.sameAs(it.id))).size).toBe(c.items.length);
    expect(c.minutes).toBe(conceptMinutes(c));
    expect(c.minutes, `${label} ${c.id} over the chip`).toBeLessThanOrEqual(minutes);
    // More than 2 min under the chip only with its reason said on the card.
    if (c.minutes < minutes - 2) expect(c.short, `${label} ${c.id} short without a reason`).toBeDefined();
    if (c.id !== 'plan' && c.id !== 'fresh') expect(STYLES[c.id].honest(c.items.map((it) => profileFor(it.id)), c.items), `${label} ${c.id} honest`).toBe(true);
    // Partners of a superset or circuit have the same sets (3.6a) and the same rest.
    const groups = new Map<number, QuickItem[]>();
    for (const it of c.items) if (it.group !== undefined) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
    for (const g of groups.values()) {
      expect(g.length).toBeGreaterThan(1);
      expect(new Set(g.map((it) => it.sets)).size).toBe(1);
      expect(new Set(g.map((it) => it.restSec)).size).toBe(1);
    }
    expect(c.gear).toEqual(gearOf(c.items.map((it) => it.id), SWAP_DATA, gym));
    expect(metaLine(c.items, c.minutes)).toMatch(/^\d+ exercises? (· \d+ (rounds?|pairs?) )*· ~\d+ min$/);
  }
}

describe('the diversity rule (random gyms, intakes and histories)', () => {
  it('no two cards share more than half their primary muscles, More ideas included; every card honest', () => {
    const r = rng(35_000);
    let fourCards = 0;
    for (let n = 0; n < 160; n++) {
      const gym = randomGym(r);
      const base = randomInput(r, gym);
      const minutes = pick(r, QUICK_MINUTES);
      const h = randomHistory(r);
      const split = r() < 0.4 ? pick(r, PLANS) : null;
      const plan = split ? planConcept({ plan: split, dayIndex: Math.floor(r() * split.days.length), weekIndex: 0, minutes, gym, ...(base.easyOn ? { easyOn: base.easyOn } : {}) }, QUICK_DEPS) : null;
      const lastShown = some(r, ['plan', 'fresh', ...STYLE_ORDER], 0.4);
      const ideas = buildIdeas({ base, minutes, recent: h.recent, plan, lastTrained: h.lastTrained, now: NOW, done: h.done, lastShown }, QUICK_DEPS);
      const label = `case ${n} (${minutes} min)`;
      expect(ideas.cards.length).toBeLessThanOrEqual(4);
      expect(new Set(ideas.cards.map((c) => c.id)).size).toBe(ideas.cards.length);
      expectDiverse(ideas.cards, label);
      expectHonestCards(ideas.cards, gym, minutes, label);
      if (ideas.cards.length === 4) fourCards++;
      // Card 1 is the plan when there is one; card 2 is fresh only from logged sets.
      if (ideas.cards.some((c) => c.id === 'plan')) expect(ideas.cards[0]!.id).toBe('plan');
      if (!Object.keys(h.lastTrained).length && !h.recent.length) expect(ideas.cards.some((c) => c.id === 'fresh')).toBe(false);
      // More ideas: each one, in the place it takes, keeps every card diverse.
      expect(ideas.moreAt.length).toBe(ideas.more.length);
      ideas.more.forEach((alt, k) => {
        const at = ideas.moreAt[k]!;
        const swapped = [...ideas.cards];
        swapped.splice(at, 1, alt);
        expectDiverse(swapped, `${label} more ${alt.id}`);
        // Never in place of the plan, the fresh card or a beginner's Easy start.
        const out = ideas.cards[at];
        if (out) expect(['plan', 'fresh'].includes(out.id) || (needsEasy(base) && out.id === 'easy'), `${label} more replaces ${out.id}`).toBe(false);
        // 3.5b round 4 (M12): another style, or another body area of the style it replaces.
        expect(swapped.filter((c) => c.id === alt.id).length).toBe(1);
        if (out?.id === alt.id) expect(alt.variant).not.toBe(out.variant);
      });
      // A style done in the last 2 quick workouts never leads the styles while another is shown.
      const styleCards = ideas.cards.filter((c) => c.id !== 'plan' && c.id !== 'fresh');
      // 3.5b round 4 (B3): a beginner's Easy start leads even if it was done lately.
      if (!needsEasy(base) && styleCards.some((c) => !h.done.includes(c.id))) expect(h.done).not.toContain(styleCards[0]!.id);
      // Beginners and Go easy on: an Easy start whenever one can be built next to the plan and fresh.
      if (needsEasy(base) && buildStyleCards({ base, minutes, recent: [] }, QUICK_DEPS).has('easy') && !plan && !Object.keys(h.lastTrained).length && !h.recent.length)
        expect(ideas.cards.map((c) => c.id)).toContain('easy');
    }
    // Most random gyms still fill the screen with 4.
    expect(fourCards).toBeGreaterThan(20);
  });

  it('a full gym never shows two cards that are the same workout under two names (G: Upper and Upper body)', () => {
    for (const m of QUICK_MINUTES) {
      const cards = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: m, recent: [] }, QUICK_DEPS).cards;
      // 3.5b round 4 (M12): the rule compares each card's main muscles, so a full gym fills 4 at every chip.
      expect(cards.length).toBe(4);
      expect(new Set(cards.map((c) => c.title)).size).toBe(cards.length);
      expect(new Set(cards.map((c) => c.chip)).size).toBeGreaterThanOrEqual(2);
      expectDiverse(cards, `${m} min`);
    }
  });

  it('the rule itself: shared × 2 never over all the muscles of the two', () => {
    const set = (...xs: string[]) => new Set(xs);
    expect(diverse(set('chest', 'back', 'biceps', 'triceps', 'shoulders'), set('chest', 'back', 'biceps', 'triceps'))).toBe(false);
    expect(diverse(set('quads', 'chest', 'back', 'abs'), set('quads', 'glutes', 'lower back'))).toBe(true);
    expect(diverse(set('a', 'b'), set('b', 'c'))).toBe(true);
    expect(diverse(set('a', 'b'), set('a', 'b'))).toBe(false);
    // 3.5b round 2, the strict reading (Codex #2): a pump and an arms card sharing biceps and triceps, 2 of 3.
    expect(diverse(set('chest', 'biceps', 'triceps', 'front', 'rear'), set('biceps', 'triceps', 'abs'))).toBe(false);
    expect(diverse(set(), set('a'))).toBe(false);
  });
});

describe('the rotation', () => {
  /** An independent brute force: every pick of at most one variant per style. */
  function allBatches(styles: Map<StyleId, Pickable[]>, fixed: Pickable[], max: number): Pickable[][] {
    const out: Pickable[][] = [];
    const ids = [...styles.keys()];
    const rec = (i: number, cur: Pickable[]) => {
      if (i === ids.length || cur.length === max) {
        out.push([...cur]);
        return;
      }
      for (const v of styles.get(ids[i]!)!) if (cur.every((c) => diverse(c.primary, v.primary))) rec(i + 1, [...cur, v]);
      rec(i + 1, cur);
    };
    rec(0, fixed);
    return out;
  }
  const ALL = ['q', 'g', 'h', 'lb', 'c', 'ch', 'fd', 'bd', 'ub', 'bi', 'tr', 'ab'];

  it('random pools: as many cards as any diverse pick, never the same 4 twice in a row while another exists, done styles never lead, Easy start for beginners', () => {
    const r = rng(77);
    for (let n = 0; n < 400; n++) {
      const styles = new Map<StyleId, Pickable[]>();
      for (const id of STYLE_ORDER) {
        if (r() < 0.2) continue;
        const k = 1 + Math.floor(r() * 3);
        styles.set(id, Array.from({ length: k }, () => ({ id, primary: new Set(some(r, ALL, 0.3).concat(pick(r, ALL))) })));
      }
      const fixed: Pickable[] = [];
      const plan = r() < 0.4 ? { id: 'plan', primary: new Set(some(r, ALL, 0.4).concat('q')) } : null;
      if (plan) fixed.push(plan);
      const done: string[] = some(r, STYLE_ORDER, 0.3).slice(0, 2);
      const needEasy = r() < 0.3;
      let lastShown: string[] = some(r, ['plan', ...STYLE_ORDER], 0.5);
      for (let visit = 0; visit < 4; visit++) {
        const batch = chooseBatch({ plan, fresh: [], styles, done, lastShown, needEasy });
        const ids = batch.cards.map((c) => c.id);
        for (let i = 0; i < batch.cards.length; i++) for (let j = i + 1; j < batch.cards.length; j++) expect(diverse(batch.cards[i]!.primary, batch.cards[j]!.primary)).toBe(true);
        const every = allBatches(styles, fixed, 4);
        const withEasy = every.filter((b) => b.some((c) => c.id === 'easy'));
        const pool = needEasy && withEasy.length ? withEasy : every;
        const best = Math.max(...pool.map((b) => b.length));
        if (needEasy && withEasy.length) expect(ids).toContain('easy');
        const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
        const others = pool.filter((b) => b.length === best && !same(b.map((c) => c.id), lastShown));
        // Never fewer cards than the rules allow; the same 4 again only when nothing else of as many exists.
        expect(batch.cards.length === best || (same(ids, lastShown) ? false : batch.cards.length === best)).toBe(true);
        if (others.length) expect(same(ids, lastShown), `case ${n} visit ${visit}`).toBe(false);
        const styleIds = ids.filter((id) => id !== 'plan');
        // 3.5b round 4 (B3): a beginner's Easy start leads even if it was done lately.
        if (!needEasy && styleIds.some((id) => !done.includes(id))) expect(done).not.toContain(styleIds[0]);
        lastShown = ids;
      }
    }
  });

  // 3.5d: at 30 (Arms and abs is a 15 and 30 card only, so at 45 the rotation has one style fewer).
  it('real data: visit after visit at a full gym, the 4 cards change and a done style never leads', () => {
    let lastShown: string[] = [];
    let done: string[] = [];
    for (let visit = 0; visit < 8; visit++) {
      const cards = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 30, recent: [], lastShown, done }, QUICK_DEPS).cards;
      const ids = cards.map((c) => c.id);
      if (visit > 0) expect([...ids].sort()).not.toEqual([...lastShown].sort());
      expect(done).not.toContain(ids[0]);
      // The person does the second card.
      done = [ids[1]!, ...done].slice(0, 2);
      lastShown = ids;
    }
  });
});

describe('the time math (one estimator), every length and every place preset', () => {
  it('hand worked: a superset and a circuit charge their rest once per round', () => {
    const pair = quickDayOf([
      { id: 'a', name: 'A', sets: 3, reps: [10, 15], restSec: 60, group: 0 },
      { id: 'b', name: 'B', sets: 3, reps: [10, 15], restSec: 60, group: 0 },
    ]);
    expect(pair.blocks).toHaveLength(1);
    expect(pair.blocks[0]!.kind).toBe('pair');
    // 3 rounds × (2 × 40 s + 60 s rest) + one change of exercise.
    expect(estimateDayMinutes(pair)).toBe(Math.round((3 * (80 + 60) + 60) / 60));
    const circuit = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, sets: 3, reps: [10, 15] as [number, number], restSec: 60, group: 0 }));
    expect(quickMinutes(circuit)).toBe(Math.round((3 * (4 * 40 + 60) + 3 * 60) / 60));
    // Without groups the same moves rest after every set.
    expect(quickMinutes(circuit.map(({ group: _g, ...it }) => it))).toBe(Math.round((4 * 3 * 100 + 3 * 60) / 60));
  });

  it("G's counts: 15 = 3 to 4 as a circuit, 30 = 5 to 6 with 2 supersets, 45 = 6 to 7, 60 = 7 to 9; within 2 min of the chip, or honestly smaller", () => {
    const deps = { ...QUICK_DEPS, requires: (id: string) => requiresOf(SWAP_DATA, id) };
    let built = 0;
    for (const place of PLACES)
      for (const experience of ['new', '1_2y', '3y'] as ExperienceId[])
        for (const goal of ['muscle', 'fat_loss'] as GoalId[])
          for (const m of QUICK_MINUTES) {
            const gym = place.id === 'full' || place.id === 'mix' ? FULL : placeGym(place.id);
            const base: GeneratorInput = { goals: [goal], experience, gym };
            const d = densityFor(m);
            for (const id of STYLE_ORDER) {
              const style = STYLES[id];
              for (const v of style.variants) {
                const card = style.minMinutes && m < style.minMinutes ? null : buildCard(styleSpec(style, v, base, m), deps, m);
                if (!card || !style.honest(card.items.map((it) => profileFor(it.id)), card.items)) continue;
                built++;
                const label = `${place.id} ${experience} ${goal} ${m} ${id}-${v.key}`;
                const n = card.items.length;
                expect(card.minutes, label).toBe(quickMinutes(card.items.map((it) => ({ ...it, name: it.id }))));
                expect(card.minutes, label).toBeLessThanOrEqual(m);
                // Within 2 min of the chip, or the reason it is shorter is a true one.
                if (card.minutes < m - 2) expect(card.short, label).toBeDefined();
                if (id === 'strength') expect(n, label).toBeLessThanOrEqual(style.maxMoves!(m));
                else {
                  expect(n, label).toBeLessThanOrEqual(d.max);
                  if (card.short !== 'moves') expect(n, label).toBeGreaterThanOrEqual(Math.min(d.min, n));
                }
                const st = structureOf(card.items);
                // 15 min: one circuit holds every move but a heavy lift (3.5b round 2: those stay on their own at full rest).
                if (m === 15 && id !== 'pump' && id !== 'strength') {
                  const light = card.items.filter((it) => !isHeavy(profileFor(it.id)));
                  expect(new Set(light.map((it) => it.group)).size, `${label}: one circuit`).toBe(1);
                  expect(light[0]!.group, label).toBeDefined();
                }
                // A heavy lift is never inside a group, and keeps its prescribed rest.
                for (const it of card.items) if (isHeavy(profileFor(it.id))) expect(it.group, `${label} ${it.id}`).toBeUndefined();
                // 3.5b round 2: a gym with only 3 sure pump moves gets the 1 superset it can hold.
                // 3.5b round 4: pairs only where two moves suit each other (a hotel has fewer such pairs).
                if ((m === 15 || m === 30) && id === 'pump') expect(st.supersets, label).toBeGreaterThanOrEqual(1);
                expect(st.supersets, label).toBeLessThanOrEqual(d.supersets);
              }
            }
          }
    expect(built).toBeGreaterThan(200);
  });

  it('a full gym lands in the counts for every non strength card at every chip', () => {
    for (const m of QUICK_MINUTES) {
      const d = densityFor(m);
      for (const c of buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: m, recent: [] }, QUICK_DEPS).cards) {
        if (c.id === 'strength') continue;
        expect(c.items.length, `${m} ${c.id}`).toBeGreaterThanOrEqual(d.min);
        expect(c.items.length, `${m} ${c.id}`).toBeLessThanOrEqual(d.max);
        expect(c.minutes, `${m} ${c.id}`).toBeGreaterThanOrEqual(m - 2);
      }
    }
  });

  it('a gym with no sure moves gets no card at all, never padding', () => {
    for (const place of ['home', 'outdoors'] as const) {
      for (const m of QUICK_MINUTES) expect(buildIdeas({ base: { goals: ['muscle'], gym: placeGym(place) }, minutes: m, recent: [] }, QUICK_DEPS).cards).toEqual([]);
    }
  });
});

describe('inclusive', () => {
  it('beginners and Go easy on always get an Easy start (Low impact) card at a full gym and a hotel', () => {
    for (const base of [
      { goals: ['muscle'], experience: 'new', gym: FULL },
      { goals: ['health'], experience: 'months', gym: FULL },
      { goals: ['muscle'], experience: '3y', easyOn: ['knees'], gym: FULL },
      { goals: ['muscle'], experience: 'new', gym: placeGym('hotel') },
    ] as GeneratorInput[])
      for (const m of QUICK_MINUTES) {
        const cards = buildIdeas({ base, minutes: m, recent: [] }, QUICK_DEPS).cards;
        const easy = cards.find((c) => c.id === 'easy');
        expect(easy, `${base.experience} ${m}`).toBeDefined();
        expect(easy!.chip).toBe('Low impact');
        for (const it of easy!.items) expect(requiresOf(SWAP_DATA, it.id)!.some((g) => g.every((x) => x === 'barbell_rack'))).toBe(false);
      }
  });

  it('Go easy on knees: no lunge on any card, and the Easy start says so', () => {
    const cards = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', easyOn: ['knees'], gym: FULL }, minutes: 45, recent: [] }, QUICK_DEPS).cards;
    for (const c of cards) for (const it of c.items) expect(profileFor(it.id).pattern).not.toBe('lunge');
    expect(cards.find((c) => c.id === 'easy')!.line).toBe('A light day, easy on your knees');
  });

  it('Cardio and core and Mobility reset are never offered while no cardio move or stretch has a sure demo', () => {
    for (const m of QUICK_MINUTES) {
      const ideas = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: m, recent: [] }, QUICK_DEPS);
      for (const c of [...ideas.cards, ...ideas.more]) expect(['cardioCore', 'mobility']).not.toContain(c.id);
    }
  });
});

describe('the why line comes from logged sets only', () => {
  it('"Back and biceps rested 4 days": the least rested of the named muscles', () => {
    const lastTrained: Partial<Record<Muscle, number>> = {};
    for (const m of MUSCLES) lastTrained[m] = NOW - 4 * DAY;
    lastTrained.chest = NOW - 6 * DAY;
    const ideas = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 30, recent: [], lastTrained, now: NOW }, QUICK_DEPS);
    const fresh = ideas.cards.find((c) => c.id === 'fresh')!;
    expect(fresh).toBeDefined();
    expect(fresh.line).toMatch(/^[A-Z][a-z ,]+ rested 4 days$/);
    expect(daysSince(NOW - 4 * DAY, NOW)).toBe(4);
  });

  it('no logged sets: no fresh card and no "rested" claim anywhere', () => {
    const cards = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 30, recent: [], now: NOW }, QUICK_DEPS).cards;
    expect(cards.some((c) => c.id === 'fresh')).toBe(false);
    for (const c of cards) expect(c.line).not.toMatch(/rested/);
  });

  it('a muscle with no logged date is never said to be rested', () => {
    const lastTrained: Partial<Record<Muscle, number>> = { quads: NOW - 5 * DAY };
    const cards = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 45, recent: [], lastTrained, now: NOW }, QUICK_DEPS).cards;
    for (const c of cards) if (/rested/.test(c.line)) expect(c.line).toMatch(/^Quads rested 5 days$/);
  });
});

describe('the deck and the workout keep the groups', () => {
  it('Never on a superset member makes its partner a single; numbers stay in order', () => {
    const it0 = (id: string, group?: number): QuickItem => ({ id, slot: id, origin: id, name: id, pattern: null, sets: 3, restSec: 60, why: 'x', ...(group !== undefined ? { group } : {}) });
    const out = regroup([it0('a', 0), it0('c', 1), it0('d', 1), it0('e')]);
    expect(out.map((x) => x.group)).toEqual([undefined, 0, 0, undefined]);
  });

  it('a swap that leaves a superset with partners sharing a muscle splits it into two singles', () => {
    const it0 = (id: string, group?: number): QuickItem => ({ id, slot: id, origin: id, name: id, pattern: null, sets: 3, restSec: 60, why: 'x', ...(group !== undefined ? { group } : {}) });
    const ok = [it0('cable-tricep-pushdown', 0), it0('cable-single-arm-bicep-curl', 0)];
    expect(safePairs(ok, profileFor).map((x) => x.group)).toEqual([0, 0]);
    const clash = [it0('cable-tricep-pushdown', 0), it0('cable-overhead-tricep-extension', 0), it0('crunch', 1), it0('dead-bug', 1)];
    expect(safePairs(clash, profileFor).map((x) => x.group)).toEqual([undefined, undefined, undefined, undefined]);
    // The estimate follows: two singles rest after every set.
    expect(quickMinutes(safePairs(clash, profileFor))).toBeGreaterThan(quickMinutes(clash));
  });

  it('a superset or circuit target becomes a pair entry the day list groups', () => {
    const e = quickEntry('x', 'X', 'stack', 3, undefined, { sets: 3, reps: [10, 15], restSec: 60, pair: { group: 1, index: 2, size: 4 } });
    expect(e.kind).toBe('pair');
    expect(e.pairIndex).toBe(2);
    expect(e.pairSize).toBe(4);
    const f = quickEntry('y', 'Y', 'stack', 4, undefined, { sets: 3, reps: [10, 15], restSec: 60, pair: { group: 1, index: 3, size: 4 } });
    expect(f.block).toBe(e.block);
    expect(quickEntry('z', 'Z', 'stack', 5, undefined, { sets: 3, restSec: 60 }).kind).toBe('single');
  });
});

describe('3.5b round 2', () => {
  const split = PLANS.find((p) => p.id === 'five-day-split')!;

  it('#1 "Your plan, short" is fitted like the style cards: never over the chip, within 2 min under or a reason, card 1 at every chip', () => {
    for (const plan of PLANS)
      for (const gym of [FULL, placeGym('hotel')])
        for (const experience of ['new', '1_2y'] as ExperienceId[])
          for (const [dayIndex] of plan.days.entries()) {
            if (!planConcept({ plan, dayIndex, weekIndex: 0, minutes: 60, gym, experience }, QUICK_DEPS)) continue;
            for (const m of QUICK_MINUTES) {
              const label = `${plan.id} day ${dayIndex + 1} ${experience} ${m}`;
              const c = planConcept({ plan, dayIndex, weekIndex: 0, minutes: m, gym, experience }, QUICK_DEPS);
              // The day can be done here: the card is always there, the honest smaller one if need be.
              expect(c, label).not.toBeNull();
              expect(c!.minutes, label).toBeLessThanOrEqual(m);
              if (c!.minutes < m - 2) expect(shortLine(c!), label).not.toBeNull();
              // The workout starts as the card says: the same trimmed day, the same estimate.
              const day = applyTrim(plan.days[dayIndex]!, c!.plan!.trim, 0);
              expect(estimateDayMinutes(day, 0), label).toBe(c!.minutes);
              const cards = buildIdeas({ base: { goals: ['muscle'], experience, gym }, minutes: m, recent: [], plan: c }, QUICK_DEPS).cards;
              expect(cards[0]!.id, label).toBe('plan');
              // A heavy lift is never in a pair made to fit.
              for (const b of day.blocks) if (b.roundRest) for (const it of b.items) expect(isHeavy(profileFor(it.exerciseId)), `${label} ${it.exerciseId}`).toBe(false);
            }
          }
  });

  it('#1 the five day split day 2 at 30 min on a full gym is a real 30 min workout (was "3 exercises · ~31 min")', () => {
    const c = planConcept({ plan: split, dayIndex: 1, weekIndex: 0, minutes: 30, gym: FULL, experience: '1_2y' }, QUICK_DEPS)!;
    expect(c.title).toBe('Your plan, short');
    expect(c.items.length).toBeGreaterThanOrEqual(5);
    expect(c.minutes).toBeLessThanOrEqual(30);
    expect(c.minutes).toBeGreaterThanOrEqual(28);
    // The day list of that workout: its fitted pairs rest after each round.
    const entries = dayWorkout(trimmedPlan(split, 1, c.plan!.trim, 0), 1, 0);
    expect(entries.some((e) => e.roundRest)).toBe(true);
    expect(entries.some((e) => e.finisher)).toBe(false);
  });

  it('#4 the timers follow the estimate: a 30 min Pairs, back to back (3.5d: was Superset pump) walked set by set rests only after each round', () => {
    const pump = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 30, recent: [] }, QUICK_DEPS).cards.find((c) => c.id === 'pump')!;
    const members = new Map<number, string[]>();
    for (const it of pump.items) if (it.group !== undefined) members.set(it.group, [...(members.get(it.group) ?? []), it.id]);
    const entries: WorkoutEntry[] = pump.items.map((it, i) => {
      const ids = it.group !== undefined ? members.get(it.group)! : [];
      const pair = ids.length > 1 ? { group: it.group!, index: ids.indexOf(it.id), size: ids.length } : undefined;
      return quickEntry(it.id, it.name, 'stack', i, undefined, { sets: it.sets, restSec: it.restSec, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(pair ? { pair } : {}) });
    });
    const walk = (rule: (e: WorkoutEntry[], d: Record<string, number>, id: string) => number) => {
      const done: Record<string, number> = {};
      let cur = upNext(entries, done);
      let seconds = 0;
      while (cur) {
        done[cur] = (done[cur] ?? 0) + 1;
        seconds += 40 + rule(entries, done, cur);
        cur = upNext(entries, done, cur);
      }
      return { seconds };
    };
    const now = walk((e, d, id) => restAfter(e, d, id) ?? 0);
    const before = walk((e, d, id) => (upNext(e, d, id) === null ? 0 : e.find((x) => x.exerciseId === id)!.restSec));
    // The estimate: every set 40 s, rest once per round, 60 s per change of exercise; the walk has no last rest.
    const lastRest = pump.items[pump.items.length - 1]!.restSec;
    const changesSec = (pump.items.length - 1) * 60;
    expect(Math.abs(Math.round((now.seconds + changesSec + lastRest) / 60) - pump.minutes)).toBeLessThanOrEqual(1);
    // Resting after every member (the old behaviour) would run well past the card.
    expect(Math.round((before.seconds + changesSec) / 60)).toBeGreaterThan(pump.minutes + 2);
  });

  it('#4 curated plan pairs keep their rest after every set', () => {
    const entries = split.days.flatMap((_, i) => dayWorkout(split, i, 0)).filter((e) => e.kind === 'pair');
    const pair = entries[0]!;
    expect(pair.roundRest).toBeUndefined();
    const done = { [pair.exerciseId]: 1 };
    expect(restAfter(entries, done, pair.exerciseId)).toBe(pair.restSec);
  });

  it('#5 a card more than 2 min under the chip says why in one plain line', () => {
    const hotel = placeGym('hotel');
    for (const experience of ['new', '1_2y'] as ExperienceId[])
      for (const m of QUICK_MINUTES)
        for (const c of buildIdeas({ base: { goals: ['muscle'], experience, gym: hotel }, minutes: m, recent: [] }, QUICK_DEPS).cards) {
          if (c.minutes >= m - 2) continue;
          expect(shortLine(c), `${experience} ${m} ${c.id}`).toMatch(/^(No more moves of this kind here|No more rested moves here|Fewer sets while you're new|As long as this style goes|All of today's plan this gym can do)$/);
        }
    expect(shortLine({ id: 'easy', short: 'caps', newer: true })).toBe("Fewer sets while you're new");
    expect(shortLine({ id: 'pump', short: 'moves' })).toBe('No more moves of this kind here');
    expect(shortLine({ id: 'pump' })).toBeNull();
  });

  it('#6 the fresh why line names the longest rested muscles the card trains, with the shorter of their rests', () => {
    const lastTrained: Partial<Record<Muscle, number>> = { back: NOW - 4 * DAY, biceps: NOW - 4 * DAY, chest: NOW - 9 * DAY, quads: NOW - 6 * DAY, triceps: NOW - 1 * DAY };
    const ideas = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 45, recent: ['triceps'], lastTrained, now: NOW }, QUICK_DEPS);
    const fresh = ideas.cards.find((c) => c.id === 'fresh')!;
    expect(fresh).toBeDefined();
    const trained = new Map<string, number>();
    for (const it of fresh.items)
      for (const m of profileFor(it.id).targets) {
        const at = lastTrained[m];
        if (at === undefined) continue;
        const w = { 'front delts': 'shoulders', 'side delts': 'shoulders', 'rear delts': 'rear shoulders', 'lower back': 'lower back' }[m as string] ?? m;
        trained.set(w, Math.min(trained.get(w) ?? Infinity, daysSince(at, NOW)));
      }
    const named = [...trained.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const words = named.map(([w]) => w);
    const want = `${words.join(' and ').replace(/^./, (c) => c.toUpperCase())} rested ${Math.min(...named.map(([, d]) => d))} days`;
    expect(fresh.line).toBe(want);
    // Every muscle named is one the card works.
    for (const w of words) expect(fresh.items.some((it) => profileFor(it.id).targets.some((m) => m === w || (w === 'shoulders' && /delts/.test(m))))).toBe(true);
    expect(restedLine(fresh.items, QUICK_DEPS, {}, NOW)).toBeNull();
  });
});

describe('3.5b round 4 (ux-critic)', () => {
  const HOTEL: GymKit = { equipment: ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'] as EquipmentId[], dumbbellRange: { min: 5, max: 50, step: 5 } };
  const JOINTS = ['knees', 'lower_back', 'shoulders', 'wrists', 'neck', 'hips'];

  it('B1: hotel cards hold G\'s count for the minutes, fill to the chip, and never claim the gym ran out while it has more', () => {
    for (const experience of ['new', '1_2y', '3y'] as ExperienceId[])
      for (const m of [30, 45, 60]) {
        const cards = buildIdeas({ base: { goals: ['muscle'], experience, gym: HOTEL }, minutes: m, recent: [] }, QUICK_DEPS).cards;
        expect(cards.length, `${experience} ${m}`).toBeGreaterThan(0);
        for (const c of cards) {
          const label = `${experience} ${m} ${c.id}: ${c.items.map((it) => it.name).join(', ')}`;
          if (c.id !== 'strength') expect(c.items.length, label).toBeGreaterThanOrEqual(densityFor(m).min);
          expect(c.minutes, label).toBeLessThanOrEqual(m);
          if (c.minutes < m - 2) expect(shortLine(c), label).not.toBeNull();
          expect(shortLine(c) ?? '', label).not.toMatch(/All this gym can do/);
        }
      }
  });

  it('B2: every Go easy on joint is respected on every card (knees: no leg extension or deep squat, never a legs only Easy start)', () => {
    for (const joint of JOINTS)
      for (const gym of [FULL, HOTEL])
        for (const m of QUICK_MINUTES) {
          const base: GeneratorInput = { goals: ['muscle'], experience: 'new', easyOn: [joint], gym };
          const ideas = buildIdeas({ base, minutes: m, recent: [] }, QUICK_DEPS);
          for (const c of [...ideas.cards, ...ideas.more])
            for (const it of c.items) expect(quickAvoids([joint], profileFor(it.id)), `${joint} ${m} ${c.id} ${it.id}`).toBe(false);
          if (joint === 'knees') {
            for (const c of [...ideas.cards, ...ideas.more]) {
              const names = c.items.map((it) => it.name);
              expect(names.some((n) => /leg extension|squat/i.test(n) && !/leg press/i.test(n)), `${m} ${c.id} ${names.join(', ')}`).toBe(false);
              // One knee dominant move at most (a leg press).
              expect(c.items.filter((it) => profileFor(it.id).pattern === 'squat').length, `${m} ${c.id}`).toBeLessThanOrEqual(1);
            }
            const easy = ideas.cards.find((c) => c.id === 'easy');
            if (easy) expect(easy.variant).not.toBe('legs');
          }
        }
    // The rule itself, per joint.
    const p = (id: string) => profileFor(id);
    expect(quickAvoids(['knees'], p('leg-extension'))).toBe(true);
    expect(quickAvoids(['knees'], p('barbell-back-squat'))).toBe(true);
    // 3.5b round 4 (B2, G's brief): knees: no leg press either.
    expect(quickAvoids(['knees'], p('leg-press'))).toBe(true);
    expect(quickAvoids(['knees'], p('hip-thrust'))).toBe(false);
    expect(quickAvoids(['lower_back'], p('deadlift'))).toBe(true);
    expect(quickAvoids(['lower_back'], p('barbell-bent-over-row'))).toBe(true);
    expect(quickAvoids(['lower_back'], p('cable-seated-close-grip-row'))).toBe(false);
    expect(quickAvoids(['shoulders'], p('overhead-press'))).toBe(true);
    expect(quickAvoids(['wrists'], p('barbell-bicep-curl'))).toBe(true);
    expect(quickAvoids(['hips'], p('dumbbell-bench-press'))).toBe(false);
  });

  it('B3: a brand new lifter never sees Strength focus and gets Easy start first (second after the plan)', () => {
    const split = PLANS.find((x) => x.id === 'five-day-split')!;
    for (const gym of [FULL, HOTEL])
      for (const m of QUICK_MINUTES) {
        const base: GeneratorInput = { goals: ['muscle'], experience: 'new', gym };
        const ideas = buildIdeas({ base, minutes: m, recent: [] }, QUICK_DEPS);
        expect([...ideas.cards, ...ideas.more].some((c) => c.id === 'strength')).toBe(false);
        expect(ideas.cards[0]!.id, `${m}`).toBe('easy');
        // No heavy barbell lift for a brand new lifter, anywhere.
        for (const c of ideas.cards) for (const it of c.items) expect(isHeavy(profileFor(it.id)) && requiresOf(SWAP_DATA, it.id)!.some((g) => g.every((x) => x === 'barbell_rack')), `${m} ${c.id} ${it.id}`).toBe(false);
        const plan = planConcept({ plan: split, dayIndex: 1, weekIndex: 0, minutes: m, gym, experience: 'new' }, QUICK_DEPS);
        if (!plan) continue;
        const withPlan = buildIdeas({ base, minutes: m, recent: [], plan }, QUICK_DEPS).cards;
        expect(withPlan[0]!.id).toBe('plan');
        if (withPlan.some((c) => c.id === 'easy')) expect(withPlan[1]!.id).toBe('easy');
      }
  });

  it('B4: a Full body circuit has a real leg lift, opens on a compound, holds one heavy lift at most (a leg lift, on its own) and no pull ups for newer lifters', () => {
    const r = rng(404);
    let seen = 0;
    for (let n = 0; n < 120; n++) {
      const gym = randomGym(r);
      const base = randomInput(r, gym);
      for (const m of QUICK_MINUTES) {
        const c = buildStyleCards({ base, minutes: m, recent: [] }, QUICK_DEPS).get('circuit')?.[0];
        if (!c) continue;
        seen++;
        const ps = c.items.map((it) => profileFor(it.id));
        const label = `${m}: ${c.items.map((it) => it.name).join(', ')}`;
        expect(ps.some((p) => p.pattern !== null && ['squat', 'hinge', 'lunge', 'glutes'].includes(p.pattern) && p.tier <= 1), label).toBe(true);
        expect(ps[0]!.tier <= 1 && ps[0]!.role === 'lift', label).toBe(true);
        const heavy = c.items.filter((it) => isHeavy(profileFor(it.id)));
        expect(heavy.length, label).toBeLessThanOrEqual(1);
        for (const it of heavy) {
          expect(it.group, label).toBeUndefined();
          expect(['squat', 'hinge', 'lunge', 'glutes']).toContain(profileFor(it.id).pattern);
        }
        if (base.experience !== '3y') expect(c.items.some((it) => /pull.?up/i.test(it.name)), label).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('B5: Strength focus on a full gym holds 4 lifts at 45 and 5 at 60 before any extra set', () => {
    for (const [m, n] of [[45, 4], [60, 5]] as const) {
      const c = buildStyleCards({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: m, recent: [] }, QUICK_DEPS).get('strength')!;
      for (const v of c) {
        expect(v.items.length, `${m} ${v.variant}`).toBe(n);
        expect(shortLine(v)).toBeNull();
      }
    }
  });

  it('M6: a Pairs, back to back opens on a main lift, holds one calf move at most, and its line names the muscles it pairs', () => {
    for (const gym of [FULL, HOTEL])
      for (const m of QUICK_MINUTES)
        for (const c of buildStyleCards({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes: m, recent: [] }, QUICK_DEPS).get('pump') ?? []) {
          const ps = c.items.map((it) => profileFor(it.id));
          expect(ps[0]!.tier <= 1, `${m} ${c.variant}`).toBe(true);
          expect(ps.filter((p) => p.pattern === 'calves').length).toBeLessThanOrEqual(1);
          expect(c.line).toMatch(/^[A-Z][a-z ,]+ pairs$/);
          expect(c.chip).toBe('Pairs');
        }
  });

  it('M9: one vocabulary on every card: pairs and rounds, never supersets or "1 circuit"', () => {
    for (const gym of [FULL, HOTEL])
      for (const m of QUICK_MINUTES)
        for (const c of buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes: m, recent: [] }, QUICK_DEPS).cards) {
          const line = metaLine(c.items, c.minutes);
          expect(line).not.toMatch(/superset|circuit/i);
          expect(c.chip).not.toMatch(/superset/i);
          // A circuit card counts its rounds; a pairs card its pairs.
          if (c.chip === 'Circuit') expect(line).toMatch(/· \d+ rounds? ·/);
          if (c.chip === 'Pairs') expect(line).toMatch(/· \d+ pairs? ·/);
        }
    expect(metaLine([{ sets: 3, group: 0 }, { sets: 3, group: 0 }, { sets: 3, group: 0 }, { sets: 3, group: 0 }], 14)).toBe('4 exercises · 3 rounds · ~14 min');
    expect(metaLine([{ sets: 3, group: 0 }, { sets: 3, group: 0 }, { sets: 3, group: 1 }, { sets: 3, group: 1 }, { sets: 3 }, { sets: 3 }], 30)).toBe('6 exercises · 2 pairs · ~30 min');
  });
});

describe('3.5b round 4, the rest of the critic list', () => {
  const HOTEL: GymKit = { equipment: presetEquipment('hotel'), dumbbellRange: { min: 5, max: 50, step: 5 } };
  const ideas = (base: GeneratorInput, minutes: number, extra: Partial<Parameters<typeof buildIdeas>[0]> = {}) => buildIdeas({ base, minutes, recent: [], ...extra }, QUICK_DEPS);

  it('B1: the hotel preset at 30, 45 and 60: every card filled to the minutes (G\'s count), 4 cards or the honest reason, a More ideas row', () => {
    for (const hist of [false, true])
      for (const m of [30, 45, 60]) {
        const extra = hist ? { recent: ['quads', 'glutes'] as Muscle[], lastTrained: { quads: NOW - DAY, glutes: NOW - DAY, back: NOW - 4 * DAY } as Partial<Record<Muscle, number>>, now: NOW } : {};
        const got = ideas({ goals: ['muscle'], experience: '1_2y', gym: HOTEL }, m, extra);
        const label = `hotel ${m} hist=${hist}`;
        if (got.cards.length < 4) expect(got.fewer, label).toMatch(/no leg lift we can show you/);
        else expect(got.fewer).toBeUndefined();
        for (const c of got.cards) {
          if (c.id !== 'strength') expect(c.items.length, `${label} ${c.id}`).toBeGreaterThanOrEqual(densityFor(m).min);
          expect(c.minutes, `${label} ${c.id}`).toBeLessThanOrEqual(m);
          if (c.minutes < m - 2) expect(shortLine(c), `${label} ${c.id}`).not.toBeNull();
        }
        if (!hist) expect(got.more.length, label).toBeGreaterThan(0);
      }
    // The rested muscles rank a style card's moves, never remove them: the pump still opens on a big lift.
    const pump = buildStyleCards({ base: { goals: ['muscle'], experience: '1_2y', gym: HOTEL }, minutes: 30, recent: ['chest', 'back'] }, QUICK_DEPS).get('pump')!;
    expect(pump[0]!.items.length).toBeGreaterThanOrEqual(5);
  });

  it('B2: one test per joint, on every card and every More idea, full gym and hotel', () => {
    const banned: Record<string, (id: string, name: string) => boolean> = {
      knees: (_id, name) => /leg press|leg extension|squat|lunge/i.test(name) && !/calf/i.test(name),
      lower_back: (_id, name) => /good morning|deadlift|bent over|back extension|barbell squat|back squat/i.test(name),
      shoulders: (_id, name) => /overhead press|shoulder press|military|arnold|\bdips?\b|upright/i.test(name),
      wrists: (id) => /barbell-bicep-curl|skullcrusher/i.test(id),
      hips: (id) => /sumo|adductor|abductor/i.test(id),
      neck: (id) => /shrug|upright/i.test(id),
    };
    for (const [joint, bad] of Object.entries(banned)) {
      let seen = 0;
      for (const gym of [FULL, HOTEL])
        for (const experience of ['new', '1_2y'] as ExperienceId[])
          for (const m of QUICK_MINUTES) {
            const got = ideas({ goals: ['muscle'], experience, easyOn: [joint], gym }, m);
            for (const c of [...got.cards, ...got.more])
              for (const it of c.items) {
                seen++;
                expect(bad(it.id, it.name), `${joint} ${m} ${c.id}: ${it.name}`).toBe(false);
              }
          }
      expect(seen, joint).toBeGreaterThan(50);
    }
  });

  it('B3: a brand new lifter (with history or a plan too) gets Easy start first and never Strength focus', () => {
    const split = PLANS.find((x) => x.id === 'five-day-split')!;
    for (const m of QUICK_MINUTES)
      for (const easyOn of [[], ['knees']]) {
        const base: GeneratorInput = { goals: ['muscle'], experience: 'new', easyOn, gym: FULL };
        const hist = { recent: ['chest'] as Muscle[], lastTrained: { chest: NOW - DAY, back: NOW - 5 * DAY } as Partial<Record<Muscle, number>>, now: NOW };
        const a = ideas(base, m, hist);
        expect(a.cards[0]!.id, `${m}`).toBe('easy');
        expect([...a.cards, ...a.more].some((c) => c.id === 'strength')).toBe(false);
        const plan = planConcept({ plan: split, dayIndex: 0, weekIndex: 0, minutes: m, gym: FULL, experience: 'new', easyOn }, QUICK_DEPS);
        const b = ideas(base, m, { ...hist, plan });
        expect(b.cards.map((c) => c.id).slice(0, plan ? 2 : 1)).toEqual(plan ? ['plan', 'easy'] : ['easy']);
      }
  });

  it('B4: a full body card always holds a real leg lift and opens on a big lift, never an isolation; pull ups are 5 to 8 reps', () => {
    for (const gym of [FULL, placeGym('home'), HOTEL])
      for (const experience of EXPS)
        for (const m of QUICK_MINUTES)
          for (const c of buildStyleCards({ base: { goals: ['muscle'], experience, gym }, minutes: m, recent: [] }, QUICK_DEPS).get('circuit') ?? []) {
            const ps = c.items.map((it) => profileFor(it.id));
            expect(ps.some((p) => p.pattern !== null && ['squat', 'hinge', 'lunge', 'glutes'].includes(p.pattern) && p.tier <= 1)).toBe(true);
            expect(ps[0]!.role === 'lift' && ps[0]!.tier <= 1).toBe(true);
            for (const it of c.items) if (/pull.?up|chin.?up/i.test(it.name)) expect(it.reps).toEqual([5, 8]);
          }
    // honest(): "legs" is a real leg pattern; a back extension or a leg extension alone is not.
    const ps = ['hyperextension-roman-chair-back-extension', 'dumbbell-bench-press', 'cable-seated-close-grip-row'].map((id) => profileFor(id));
    expect(STYLES.circuit.honest(ps, [{ group: 0 }, { group: 0 }, { group: 0 }])).toBe(false);
  });

  it('B5: Strength focus on a full gym at 60 holds 5 lifts (a press and a pull among them) and no reason line', () => {
    for (const c of buildStyleCards({ base: { goals: ['muscle'], experience: '1_2y', gym: FULL }, minutes: 60, recent: [] }, QUICK_DEPS).get('strength')!) {
      expect(c.items.length).toBe(5);
      expect(c.items.some((it) => it.pattern === 'horizontal push' || it.pattern === 'vertical push')).toBe(true);
      expect(c.items.some((it) => it.pattern === 'horizontal pull' || it.pattern === 'vertical pull')).toBe(true);
      expect(shortLine(c)).toBeNull();
    }
  });

  it('M6: a pump\'s first pair is its main lift with a move of another area (push + pull, legs + upper)', () => {
    const area = (p: string | null) => (p === null ? null : ['squat', 'hinge', 'lunge', 'glutes', 'quads isolation', 'hamstrings isolation'].includes(p) ? 'legs' : ['horizontal push', 'vertical push', 'chest isolation', 'triceps'].includes(p) ? 'push' : ['horizontal pull', 'vertical pull', 'rear delt', 'biceps'].includes(p) ? 'pull' : null);
    for (const gym of [FULL, HOTEL])
      for (const m of QUICK_MINUTES)
        for (const c of buildStyleCards({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes: m, recent: [] }, QUICK_DEPS).get('pump') ?? []) {
          const [a, b] = c.items;
          expect(a!.group).toBe(0);
          expect(b!.group).toBe(0);
          expect(area(a!.pattern)).not.toBeNull();
          expect(area(b!.pattern)).not.toBeNull();
          expect(area(a!.pattern)).not.toBe(area(b!.pattern));
          expect(c.line).not.toMatch(/Moves in pairs/);
        }
  });

  it('B1: the line under fewer cards says why and never claims it is all the gym can do while More ideas has more', () => {
    expect(fewerLine(4, 30, false, undefined)).toBeUndefined();
    expect(fewerLine(0, 30, false, undefined)).toBeUndefined();
    expect(fewerLine(2, 30, false, undefined)).toBe('This gym has no leg lift we can show you yet, so these are the workouts different enough to show together.');
    expect(fewerLine(1, 45, false, undefined, 2)).toBe('This gym has no leg lift we can show you yet, so this is the one workout different enough to show together. More ideas has other kinds.');
    expect(fewerLine(3, 30, false, ['knees'], 1)).toMatch(/^Going easy on your knees leaves no leg lift/);
    expect(fewerLine(3, 60, true, undefined)).toBe('In 60 min these are the workouts different enough to show together here.');
    for (const m of QUICK_MINUTES) {
      const got = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: HOTEL }, minutes: m, recent: [] }, QUICK_DEPS);
      expect(got.fewer ?? '').not.toMatch(/all (this gym|the different)/i);
      if (got.more.length && got.fewer) expect(got.fewer).toMatch(/More ideas has other kinds\.$/);
    }
  });

  it('M12: a full gym always offers a More ideas row, with or without history', () => {
    for (const m of QUICK_MINUTES)
      for (const experience of ['new', '1_2y', '3y'] as ExperienceId[]) {
        const got = ideas({ goals: ['muscle'], experience, gym: FULL }, m);
        expect(got.more.length, `${experience} ${m}`).toBeGreaterThan(0);
      }
  });
});

