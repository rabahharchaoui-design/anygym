// PLAN Q8: the swipe builder's deck (the gates every Quick card uses), its time meter, Start, Undo and
// the suggested next move (Up next's own ranking and reason lines, inside the minutes left).
import { describe, expect, it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { COACH_FACTS } from '../../data/coachFacts';
import { equipmentPreset } from '../../db/gyms';
import { GYM_TYPE_OF, presetEquipment } from '../intake/funnel';
import type { GymKit } from '../picker';
import { quickDepsFor, quickTitleOf, type QuickInput } from '../quick';
import { sureGear } from '../quickDeck';
import { FIT_SLACK, fits } from '../quickShow';
import { upNextIdeas } from '../upNext';
import { addFits, builderPool, builderView, builtConcept, type BuilderPool, type BuilderStep } from '../quickBuilder';

const kitOf = (place: 'full' | 'hotel' | 'home'): GymKit => ({ equipment: presetEquipment(place), dumbbellRange: equipmentPreset(GYM_TYPE_OF[place], 'lb').dumbbellRange });
const input = (gym: GymKit, extra: Partial<QuickInput['base']> = {}): QuickInput => ({ base: { goals: ['muscle'], gym, experience: '1_2y', ...extra }, minutes: 45, recent: [] });
const adds = (pool: BuilderPool, n: number, budget: number): BuilderStep[] => {
  const steps: BuilderStep[] = [];
  for (let i = 0; i < n; i++) {
    const v = builderView(pool, steps, budget);
    const card = v.suggestion?.card ?? v.current;
    if (!card) break;
    steps.push({ kind: 'add', id: card.item.id, from: v.suggestion ? 'suggestion' : 'deck' });
  }
  return steps;
};

describe('Q8 pool: the same gates as every Quick card', () => {
  for (const place of ['full', 'hotel', 'home'] as const)
    it(`${place} gym: only sure gear here, a sure demo, the person's own gates, every card prescribed`, () => {
      const inp = input(kitOf(place));
      const pool = builderPool(inp, QUICK_DEPS);
      const gated = quickDepsFor(inp.base, QUICK_DEPS);
      expect(pool.cards.length).toBeGreaterThan(0);
      for (const c of pool.cards) {
        expect(sureGear(QUICK_DEPS.data, c.item.id, inp.base.gym), c.item.id).toBe(true);
        expect(gated.usable(c.item.id), c.item.id).toBe(true);
        expect(c.profile.role).toBe('lift');
        expect(c.item.sets).toBeGreaterThan(0);
        expect(c.item.restSec).toBeGreaterThan(0);
        expect(c.item.reps !== undefined || c.item.seconds !== undefined).toBe(true);
      }
      expect(new Set(pool.cards.map((c) => c.key)).size).toBe(pool.cards.length);
    });

  it('a hotel gym never offers what only a full gym has', () => {
    const full = new Set(builderPool(input(kitOf('full')), QUICK_DEPS).cards.map((c) => c.item.id));
    const hotel = builderPool(input(kitOf('hotel')), QUICK_DEPS).cards.map((c) => c.item.id);
    expect(hotel.length).toBeLessThan(full.size);
  });

  it('go easy on knees drops squats, lunges and leg extensions, and says how many', () => {
    const plain = builderPool(input(kitOf('full')), QUICK_DEPS);
    const knees = builderPool(input(kitOf('full'), { easyOn: ['knees'] }), QUICK_DEPS);
    for (const c of knees.cards) expect(['squat', 'lunge', 'quads isolation'], c.item.id).not.toContain(c.profile.pattern);
    expect(plain.cards.some((c) => c.profile.pattern === 'squat')).toBe(true);
    expect(knees.easedOut).toBeGreaterThan(0);
    expect(knees.easyLine).toBe(`Going easy on your knees: ${knees.easedOut} ${knees.easedOut === 1 ? 'move' : 'moves'} left out.`);
    expect(plain.easyLine).toBeUndefined();
  });

  it('the never list is never offered (any name of the same exercise)', () => {
    const first = builderPool(input(kitOf('full')), QUICK_DEPS).cards[0]!;
    const pool = builderPool(input(kitOf('full'), { never: [first.item.id] }), QUICK_DEPS);
    expect(pool.cards.map((c) => c.key)).not.toContain(first.key);
  });

  it('a soft dislike ranks a card later, never out', () => {
    const plain = builderPool(input(kitOf('full')), QUICK_DEPS).cards;
    const id = plain[0]!.item.id;
    const soft = builderPool(input(kitOf('full'), { soft: { [id]: 3 } }), QUICK_DEPS).cards.map((c) => c.item.id);
    expect(soft).toContain(id);
    expect(soft.indexOf(id)).toBeGreaterThan(0);
  });

  it('the deck mixes the movement patterns from the start', () => {
    const first = builderPool(input(kitOf('full')), QUICK_DEPS).cards.slice(0, 6).map((c) => c.profile.pattern);
    expect(new Set(first).size).toBe(6);
  });
});

describe('Q8 meter, Start and Undo', () => {
  for (const budget of [15, 30, 45, 60])
    it(`${budget} min: only cards that still fit, Start shows once one is kept and turns main when full`, () => {
      const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
      expect(builderView(pool, [], budget).start).toBe('hidden');
      const one = builderView(pool, adds(pool, 1, budget), budget);
      expect(one.start).not.toBe('hidden');
      const steps = adds(pool, 40, budget);
      const v = builderView(pool, steps, budget);
      expect(fits(v.minutes, budget)).toBe(true);
      expect(v.start).toBe('full');
      expect(v.minutes >= budget - FIT_SLACK || v.left === 0).toBe(true);
      for (const c of pool.cards.filter((c) => !steps.some((s) => s.id === c.item.id))) if (v.left > 0) expect(addFits(v.kept, c.item, budget) || !builderView(pool, steps, budget).current).toBe(true);
      expect(v.meta).toContain(`${v.kept.length} exercise`);
    });

  it('a skip discards the card and the deck moves on; Undo brings it back', () => {
    const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
    const top = builderView(pool, [], 45).current!;
    const skipped = builderView(pool, [{ kind: 'skip', id: top.item.id, from: 'deck' }], 45);
    expect(skipped.current?.item.id).not.toBe(top.item.id);
    expect(skipped.kept).toEqual([]);
    expect(builderView(pool, [], 45).current?.item.id).toBe(top.item.id);
  });

  it('Start stores a non plan Quick workout titled Quick workout', () => {
    const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
    const v = builderView(pool, adds(pool, 3, 45), 45);
    const c = builtConcept(v);
    expect(c).toMatchObject({ id: 'focus', variant: 'custom' });
    expect(c.items).toHaveLength(3);
    expect(quickTitleOf(`focus:${c.variant}`)).toBe('Quick workout');
  });
});

describe('Q8 suggested next', () => {
  it("after an add from the deck: Up next's best move among what still fits, with its curated reason", () => {
    const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
    const top = builderView(pool, [], 45).current!;
    const steps: BuilderStep[] = [{ kind: 'add', id: top.item.id, from: 'deck' }];
    const v = builderView(pool, steps, 45);
    expect(v.suggestion).not.toBeNull();
    expect(v.current).toBeNull();
    const fitting = pool.cards.filter((c) => c.item.id !== top.item.id && addFits([top.item], c.item, 45));
    const want = upNextIdeas([top.profile], fitting.map((c) => c.profile), pool.next, 0)[0]!;
    expect(v.suggestion!.card.item.id).toBe(want.profile.id);
    expect(v.suggestion!.reason).toBe(want.reason);
    expect(COACH_FACTS.some((f) => f.id === v.suggestion!.fact)).toBe(true);
  });

  it('accepting or skipping the suggestion goes back to the deck (no suggestion after a suggestion)', () => {
    const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
    const top = builderView(pool, [], 45).current!;
    const s1: BuilderStep[] = [{ kind: 'add', id: top.item.id, from: 'deck' }];
    const sug = builderView(pool, s1, 45).suggestion!;
    for (const kind of ['add', 'skip'] as const) {
      const v = builderView(pool, [...s1, { kind, id: sug.card.item.id, from: 'suggestion' }], 45);
      expect(v.suggestion).toBeNull();
      expect(v.current).not.toBeNull();
      expect(v.kept).toHaveLength(kind === 'add' ? 2 : 1);
    }
  });

  it('never suggests a move that would run over the minutes left', () => {
    const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
    for (const budget of [15, 30]) {
      const steps = adds(pool, 2, budget);
      const v = builderView(pool, steps, budget);
      if (v.suggestion) expect(addFits(v.kept, v.suggestion.card.item, budget)).toBe(true);
    }
  });

  it('a skip never brings a suggestion', () => {
    const pool = builderPool(input(kitOf('full')), QUICK_DEPS);
    const top = builderView(pool, [], 45).current!;
    expect(builderView(pool, [{ kind: 'skip', id: top.item.id, from: 'deck' }], 45).suggestion).toBeNull();
  });
});
