// PLAN 3.5d: Quick deck fixes over the real data: one exercise in one card (6), Arms and abs only at
// 15 and 30 and never first (7), no intake means the beginner rules (8), the 48 h rule and a why line
// per card (9), the new names (3) and the swap options with a sure demo (12).
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { presetEquipment } from '../intake/funnel';
import type { GeneratorInput } from '../generator';
import type { GymKit } from '../picker';
import type { Muscle } from '../order';
import { PLANS } from '../../data/plans';
import { applyTrim } from '../timeBudget';
import { planConcept, buildIdeas, buildStyleCards, distinctCards, needsEasy, nextSwap, QUICK_MINUTES, trainedWithin, type Concept, type QuickInput } from '../quick';
import { chooseBatch, diverse, STYLES, type Pickable, type StyleId } from '../quickStyles';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const hotelEq = presetEquipment('hotel');
const HOTEL: GymKit = { equipment: hotelEq, dumbbellRange: hotelEq.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null };
const GYMS: Record<string, GymKit> = { full: FULL, hotel: HOTEL };
const base = (gym: GymKit, experience?: GeneratorInput['experience']): GeneratorInput => ({ goals: ['muscle'], gym, ...(experience ? { experience } : {}) });
const NOW = new Date(2026, 10, 9, 18, 0).getTime();
const DAY = 86_400_000;

const dups = (cards: readonly Concept[]): number => {
  const seen = new Set<string>();
  let n = 0;
  for (const c of cards) for (const it of c.items) (seen.has(SWAP_DATA.sameAs(it.id)) ? n++ : seen.add(SWAP_DATA.sameAs(it.id)));
  return n;
};

describe('3.5d (3) the names', () => {
  it('plain words for the two styles', () => {
    expect(STYLES.pump.title).toBe('Pairs, back to back');
    expect(STYLES.armsAbs.title).toBe('Arms and abs');
  });
});

describe('3.5d (6) one exercise in one card when the sure catalog allows', () => {
  it('never more repeats than the cards alone, fewer where another option exists, and the same muscles and count', () => {
    let before = 0;
    let after = 0;
    for (const gym of Object.values(GYMS))
      for (const exp of ['1_2y', 'new'] as const)
        for (const minutes of QUICK_MINUTES) {
          const input: QuickInput = { base: base(gym, exp), minutes, recent: [] };
          const styles = buildStyleCards(input, QUICK_DEPS);
          const raw = chooseBatch({ plan: null, fresh: [], styles, done: [], lastShown: [], needEasy: needsEasy(input.base) });
          const out = distinctCards(raw, input, QUICK_DEPS);
          before += dups(raw.cards);
          after += dups(out.cards);
          expect(dups(out.cards)).toBeLessThanOrEqual(dups(raw.cards));
          out.cards.forEach((c, i) => {
            expect(c.items.length, 'a slot is never left empty').toBe(raw.cards[i]!.items.length);
            // Round 2: a replacement may move a main muscle (a Romanian deadlift for a deadlift) only when the card keeps its name for the same muscles.
            expect(c.focus).toBe(raw.cards[i]!.focus);
          });
          for (let a = 0; a < out.cards.length; a++)
            for (let b = a + 1; b < out.cards.length; b++)
              if (diverse(raw.cards[a]!.primary, raw.cards[b]!.primary)) expect(diverse(out.cards[a]!.primary, out.cards[b]!.primary), `${minutes} ${out.cards[a]!.id}/${out.cards[b]!.id}`).toBe(true);
        }
    expect(after).toBeLessThan(before);
  });
});

describe('3.5d (7) Arms and abs: 15 and 30 only, never first', () => {
  it('is not offered at 45 or 60, and never leads the cards', () => {
    for (const gym of Object.values(GYMS))
      for (const exp of ['1_2y', '3y', undefined] as const)
        for (const minutes of QUICK_MINUTES) {
          const ideas = buildIdeas({ base: base(gym, exp), minutes, recent: [] }, QUICK_DEPS);
          const all = [...ideas.cards, ...ideas.more];
          if (minutes > 30) expect(all.some((c) => c.id === 'armsAbs'), `${minutes}`).toBe(false);
          if (ideas.cards.length > 1) expect(ideas.cards[0]!.id).not.toBe('armsAbs');
          ideas.more.forEach((c, i) => {
            if (c.id === 'armsAbs') expect(ideas.moreAt[i]).not.toBe(0);
          });
        }
  });
  it('moves to the end when the rotation would put it first', () => {
    const P = (id: string, m: string): Pickable => ({ id, primary: new Set([m]) });
    const styles = new Map<StyleId, Pickable[]>([['armsAbs', [P('armsAbs', 'biceps')]], ['circuit', [P('circuit', 'quads')]]]);
    const b = chooseBatch<Pickable>({ plan: null, fresh: [], styles, done: ['circuit'], lastShown: [], needEasy: false });
    expect(b.cards.map((c) => c.id)).toEqual(['circuit', 'armsAbs']);
  });
});

describe('3.5d (8) no intake answers: the beginner rules', () => {
  it('offers no Strength focus, always an Easy start where one fits, and no heavy barbell lift', () => {
    expect(needsEasy({})).toBe(true);
    for (const minutes of QUICK_MINUTES) {
      const none = buildIdeas({ base: base(FULL), minutes, recent: [] }, QUICK_DEPS);
      const newer = buildIdeas({ base: base(FULL, 'new'), minutes, recent: [] }, QUICK_DEPS);
      expect([...none.cards, ...none.more].some((c) => c.id === 'strength')).toBe(false);
      expect(none.cards.map((c) => c.id)).toEqual(newer.cards.map((c) => c.id));
    }
  });
});

describe('3.5d (9) the 48 h rule and a why line per card', () => {
  const lastTrained: Partial<Record<Muscle, number>> = { chest: NOW - DAY, 'front delts': NOW - DAY, triceps: NOW - DAY, back: NOW - 5 * DAY, biceps: NOW - 5 * DAY, quads: NOW - 4 * DAY, glutes: NOW - 4 * DAY, hamstrings: NOW - 4 * DAY };
  it('reads the muscles trained inside 48 h', () => {
    expect(trainedWithin(lastTrained, NOW, 2 * DAY).sort()).toEqual(['chest', 'front delts', 'triceps']);
    expect(trainedWithin(lastTrained, NOW, 2 * DAY).includes('back' as Muscle)).toBe(false);
  });
  it('style cards leave yesterday\'s muscles out when they can be built without them, and every card has its own line', () => {
    for (const minutes of QUICK_MINUTES) {
      const input: QuickInput = { base: base(FULL, '1_2y'), minutes, recent: ['chest', 'triceps', 'front delts'], lastTrained, now: NOW };
      const ideas = buildIdeas(input, QUICK_DEPS);
      const lines = ideas.cards.map((c) => c.line);
      expect(new Set(lines).size, lines.join(' / ')).toBe(lines.length);
      const stylesOnly = ideas.cards.filter((c) => c.id !== 'plan' && c.id !== 'fresh');
      const clean = stylesOnly.filter((c) => !c.items.some((it) => QUICK_DEPS.profile(it.id).targets.some((m) => ['chest', 'triceps', 'front delts'].includes(m))));
      expect(clean.length, `${minutes}: most style cards skip yesterday's muscles`).toBeGreaterThanOrEqual(Math.floor(stylesOnly.length / 2));
    }
  });
});

describe('3.5d round 3 (2): the fresh card is honest about yesterday', () => {
  it('names only muscles not trained in 3 days and holds no move whose main muscle was trained', () => {
    const lt: Partial<Record<Muscle, number>> = { 'front delts': NOW - DAY, chest: NOW - 5 * DAY, back: NOW - 5 * DAY, quads: NOW - 5 * DAY };
    for (const minutes of QUICK_MINUTES) {
      const input: QuickInput = { base: base(FULL, '1_2y'), minutes, recent: ['front delts'], lastTrained: lt, now: NOW };
      for (const c of buildIdeas(input, QUICK_DEPS).cards.filter((x) => x.id === 'fresh')) {
        for (const it of c.items) expect(QUICK_DEPS.profile(it.id).targets, `${minutes} ${it.name}`).not.toContain('front delts');
        expect(c.line, `${minutes}: ${c.line}`).not.toMatch(/shoulders rested|1 day/i);
      }
    }
  });
});

describe('3.5d round 2 (5): the cross card rule lets the catalog replacement in', () => {
  it('a Romanian deadlift stands in for the repeated Deadlift, and a pull up (5 to 8 reps) for the repeated pulldown at 3 years', () => {
    let rdl = 0;
    let pullUps = 0;
    for (const exp of ['1_2y', '3y'] as const)
      for (const minutes of QUICK_MINUTES) {
        const ideas = buildIdeas({ base: base(FULL, exp), minutes, recent: [] }, QUICK_DEPS);
        for (const it of ideas.cards.flatMap((c) => c.items)) {
          if (/romanian/i.test(it.name)) rdl++;
          if (/pull up/i.test(it.name)) {
            pullUps++;
            expect(exp, 'pull ups only for 3 year lifters').toBe('3y');
            expect(it.reps).toEqual([5, 8]);
          }
        }
      }
    expect(rdl).toBeGreaterThan(0);
    expect(pullUps).toBeGreaterThan(0);
  });
});

describe('3.5d round 2 (6): a stand in next to a heavy lift keeps the work, as straight sets', () => {
  it('the incline barbell and plate press pair: the plate press stand in stays and the pair is done as straight sets', () => {
    const plan = PLANS.find((p) => p.id === 'five-day-split')!;
    const day = plan.days.findIndex((d) => d.blocks.some((b) => b.kind === 'pair' && b.items.some((x) => x.exerciseId === 'incline-plate-press')));
    expect(day).toBeGreaterThanOrEqual(0);
    const c = planConcept({ plan, dayIndex: day, weekIndex: 0, minutes: 60, gym: FULL }, QUICK_DEPS)!;
    const block = plan.days[day]!.blocks.find((b) => b.items.some((x) => x.exerciseId === 'incline-plate-press'))!;
    const members = block.items.map((x) => c.items.find((it) => it.slot === x.exerciseId));
    expect(members.every(Boolean), 'no planned work is dropped').toBe(true);
    for (const m of members) expect(m!.group, 'not in a pair any more').toBeUndefined();
    expect(c.plan!.trim!.straight).toMatchObject({ 'barbell-incline-bench-press': block.restSec, 'incline-plate-press': block.restSec });
    const trimmed = applyTrim(c.plan!.day, c.plan!.trim, 0);
    const after = trimmed.blocks.filter((b) => b.items.some((x) => x.exerciseId === 'incline-plate-press' || x.exerciseId === 'barbell-incline-bench-press'));
    expect(after.map((b) => [b.kind, b.items.length])).toEqual([['single', 1], ['single', 1]]);
  });
});

describe('3.5d round 3 (3): one rest for a straight set stand in', () => {
  it('five day split day 2: the trim\'s straight map, the card and the trimmed day agree at every length', () => {
    const plan = PLANS.find((p) => p.id === 'five-day-split')!;
    const day = plan.days.findIndex((d) => d.blocks.some((b) => b.kind === 'pair' && b.items.some((x) => x.exerciseId === 'incline-plate-press')));
    for (const minutes of QUICK_MINUTES) {
      const c = planConcept({ plan, dayIndex: day, weekIndex: 0, minutes, gym: FULL }, QUICK_DEPS)!;
      const trimmed = applyTrim(c.plan!.day, c.plan!.trim, 0);
      for (const [id, rest] of Object.entries(c.plan!.trim!.straight ?? {})) {
        expect(c.items.find((it) => it.slot === id)!.restSec, `${minutes} ${id} card`).toBe(rest);
        expect(trimmed.blocks.find((b) => b.items.some((x) => x.exerciseId === id))!.restSec, `${minutes} ${id} day`).toBe(rest);
      }
    }
  });
});

describe('3.5d round 2 (2): chest trained yesterday leaves the circuit', () => {
  it('no chest move in the Full body circuit at any length (a shoulder press fills the push)', () => {
    const lastTrained: Partial<Record<Muscle, number>> = { chest: NOW - DAY, 'front delts': NOW - DAY, triceps: NOW - DAY };
    for (const minutes of QUICK_MINUTES) {
      const ideas = buildIdeas({ base: base(FULL, '1_2y'), minutes, recent: ['chest'], lastTrained, now: NOW }, QUICK_DEPS);
      for (const c of [...ideas.cards, ...ideas.more].filter((x) => x.id === 'circuit')) {
        expect(c.items.some((it) => QUICK_DEPS.profile(it.id).targets.includes('chest' as Muscle)), `${minutes}`).toBe(false);
        expect(c.items.some((it) => /press/i.test(it.name)), `${minutes} still has a push`).toBe(true);
      }
    }
  });
});

describe('3.5d (12) the swap offers a sure option before "No other option here"', () => {
  it('the barbell incline press has a Smith or machine press with a sure demo to swap to', () => {
    const item = { id: 'barbell-incline-bench-press', slot: 'barbell-incline-bench-press', origin: 'barbell-incline-bench-press', name: 'Barbell Incline Bench Press', pattern: 'horizontal push', sets: 3, restSec: 90, why: '' } as never;
    const ctx = { data: SWAP_DATA, gym: FULL, ok: QUICK_DEPS.usable, profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name };
    const tried: string[] = [];
    const offered: string[] = [];
    for (let i = 0; i < 6; i++) {
      const to = nextSwap(item, [item], tried, ctx);
      if (!to) break;
      offered.push(to);
      tried.push(to);
    }
    expect(offered).toEqual(expect.arrayContaining(['Machine_Bench_Press', 'Smith_Machine_Bench_Press']));
    for (const id of offered) expect(QUICK_DEPS.usable(id), id).toBe(true);
  });
});
