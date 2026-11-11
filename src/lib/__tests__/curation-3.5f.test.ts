// PLAN 3.5f (2) many lefts: the deep ranked pool (same pattern and gym first, then close patterns),
// "Show me 6" after 3 lefts, the honest end, lefts lowering a move's rank, and the once only
// "Hide it for good?" after 3 lefts across workouts.
import { afterAll, describe, expect, it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { profileFor } from '../../data/order';
import { demoFor } from '../../data/exerciseInfo';
import { loadCandidateFile, setApproved } from '../../data/candidateGate';
import { EQUIPMENT_IDS } from '../../db/types';
import type { GymKit } from '../picker';
import { isCompound } from '../order';
import { FALLBACK } from '../generatorRules';
import { END_LINE, HIDE_ASK_AFTER, SHOW_SIX, SHOW_SIX_AFTER, learnLeft, nextSwap, sixOf, sureGear, swapItem, swapPool, type Dislikes, type QuickItem, type SwapContext } from '../quick';
import { PATTERNS, patternOf, workoutIdOf, type Pattern } from '../swap';
import { INTAKE_DECK_MAX, decideExercise, intakeDeck } from '../intake/exerciseDeck';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const HOTEL: GymKit = { equipment: ['dumbbells', 'adjustable_bench', 'cable_station'], dumbbellRange: { min: 5, max: 50, step: 5 } };
const ctxOf = (gym: GymKit, soft?: Record<string, number>): SwapContext => ({ data: SWAP_DATA, gym, ok: (id) => QUICK_DEPS.usable(id), profile: (id) => profileFor(id), nameOf: QUICK_DEPS.name, ...(soft ? { soft } : {}) });
const item = (id: string, pattern: Pattern): QuickItem => ({ id, slot: id, origin: id, name: QUICK_DEPS.name(id), pattern, sets: 3, reps: [8, 12], restSec: 120, why: '' });

afterAll(() => setApproved([]));

describe('3.5f (2) the ranked pool', () => {
  const bench = item('dumbbell-bench-press', 'horizontal push');

  it('same pattern at this gym first, then the close patterns, each move once, all sure', () => {
    const pool = swapPool(bench, [bench], [], ctxOf(FULL));
    expect(pool.length).toBeGreaterThan(2);
    const firstClose = pool.findIndex((o) => o.close);
    expect(firstClose).toBeGreaterThan(0);
    expect(pool.slice(firstClose).every((o) => o.close), 'close ones after every same pattern one').toBe(true);
    for (const o of pool) {
      const pattern = patternOf(SWAP_DATA, o.id)!;
      if (o.close) expect(FALLBACK['horizontal push']).toContain(pattern);
      else expect(pattern).toBe('horizontal push');
      expect(demoFor(o.id), o.id).not.toBeNull();
      expect(sureGear(SWAP_DATA, o.id, FULL), o.id).toBe(true);
      // The same size of lift: a big lift is never swapped for a small move.
      expect(isCompound(profileFor(o.id))).toBe(true);
      expect(SWAP_DATA.sameAs(o.id)).not.toBe(SWAP_DATA.sameAs(bench.id));
    }
    expect(new Set(pool.map((o) => SWAP_DATA.sameAs(o.id))).size).toBe(pool.length);
    // The first of the pool is what a left swipe has always put in.
    expect(pool[0]!.id).toBe(nextSwap(bench, [bench], [], ctxOf(FULL)));
  });

  it('never a move already in the workout, one already shown, or one this gym lacks', () => {
    const all = swapPool(bench, [bench], [], ctxOf(FULL));
    const other = item(all[1]!.id, 'horizontal push');
    expect(swapPool(bench, [bench, other], [], ctxOf(FULL)).map((o) => o.id)).not.toContain(other.id);
    expect(swapPool(bench, [bench], [all[0]!.id], ctxOf(FULL)).map((o) => o.id)).not.toContain(all[0]!.id);
    for (const o of swapPool(bench, [bench], [], ctxOf(HOTEL))) expect(sureGear(SWAP_DATA, o.id, HOTEL), o.id).toBe(true);
  });

  it('every left pulls the next best, and the pool runs out honestly: no move comes back, nothing is padded', () => {
    let card = bench;
    const tried: string[] = [];
    const shown = [card.id];
    for (let guard = 0; guard < 40; guard++) {
      const pool = swapPool(card, [card], tried, ctxOf(FULL));
      if (!pool.length) break;
      tried.push(card.id);
      card = swapItem(card, pool[0]!.id, QUICK_DEPS.name(pool[0]!.id), false, bench.name, false, pool[0]!.close);
      shown.push(card.id);
    }
    expect(new Set(shown.map(SWAP_DATA.sameAs)).size, 'each move once').toBe(shown.length);
    expect(shown.length).toBe(swapPool(bench, [bench], [], ctxOf(FULL)).length + 1);
    // The true end: nothing left, and the deck's line for it.
    expect(swapPool(card, [card], tried, ctxOf(FULL))).toEqual([]);
    expect(END_LINE).toBe('That is every move your gym has for this');
    // A close move says so (its fact is "the closest move"), a same pattern one does not.
    expect(card.close).toBe(true);
  });

  it('"Show me 6" after 3 lefts: up to six of the pool, in rank order, never padded', () => {
    expect(SHOW_SIX_AFTER).toBe(3);
    expect(SHOW_SIX).toBe(6);
    const pool = swapPool(bench, [bench], [], ctxOf(FULL));
    expect(sixOf(pool)).toEqual(pool.slice(0, 6));
    expect(sixOf(pool).length).toBeLessThanOrEqual(6);
    const few = swapPool(bench, [bench], [], ctxOf(HOTEL));
    expect(sixOf(few)).toEqual(few);
    expect(sixOf([])).toEqual([]);
  });

  it('lefts lower a move’s rank, more lefts lower it more, never a ban', () => {
    // A slot with at least 3 moves of its own pattern at a full gym.
    const deep = PATTERNS.flatMap((p) => SWAP_DATA.patterns[p].candidates.map((c) => item(workoutIdOf(c), p))).find((it) => QUICK_DEPS.usable(it.id) && swapPool(it, [it], [], ctxOf(FULL)).filter((o) => !o.close).length >= 3)!;
    expect(deep, 'a deep slot exists').toBeDefined();
    const bench = deep;
    const pool = swapPool(bench, [bench], [], ctxOf(FULL)).filter((o) => !o.close);
    const [a, b, c] = pool.map((o) => o.id);
    const once = swapPool(bench, [bench], [], ctxOf(FULL, { [a!]: 1 })).filter((o) => !o.close).map((o) => o.id);
    expect(once[0]).toBe(b);
    expect(once).toContain(a);
    expect(once[once.length - 1]).toBe(a);
    const more = swapPool(bench, [bench], [], ctxOf(FULL, { [a!]: 1, [b!]: 3 })).filter((o) => !o.close).map((o) => o.id);
    expect(more[0]).toBe(c);
    expect(more.indexOf(a!)).toBeLessThan(more.indexOf(b!));
    // A same pattern move with lefts still comes before every close pattern move.
    const whole = swapPool(bench, [bench], [], ctxOf(FULL, { [a!]: 9 }));
    const firstClose = whole.findIndex((o) => o.close);
    if (firstClose !== -1) expect(whole.findIndex((o) => o.id === a)).toBeLessThan(firstClose);
  });

  it('a candidate joins the pool only once approved on this phone (it deepens by itself)', async () => {
    const file = await loadCandidateFile();
    const before = swapPool(bench, [bench], [], ctxOf(FULL)).map((o) => o.id);
    const mine = file.candidates.filter((c) => c.ladder && c.pattern === 'horizontal push').map((c) => c.id);
    expect(mine.length).toBeGreaterThan(0);
    for (const id of mine) expect(before).not.toContain(id);
    setApproved(mine);
    const after = swapPool(bench, [bench], [], ctxOf(FULL)).map((o) => o.id);
    expect(after.length).toBeGreaterThan(before.length);
    // The sure moves keep their places: approved ones only add.
    expect(after.filter((id) => before.includes(id))).toEqual(before);
    setApproved([]);
    expect(swapPool(bench, [bench], [], ctxOf(FULL)).map((o) => o.id)).toEqual(before);
  });
});

describe('3.5f (2) "Hide it for good?" after 3 lefts across workouts, once', () => {
  const left = (d: Dislikes, workout: string) => learnLeft(d, 'x', workout);

  it('3 lefts in one workout never ask; the third different workout asks', () => {
    expect(HIDE_ASK_AFTER).toBe(3);
    let d: Dislikes = {};
    for (let i = 0; i < 5; i++) {
      const r = left(d, 'w1');
      expect(r.ask).toBe(false);
      d = r.dislikes;
    }
    expect(d.soft).toEqual({ x: 5 });
    expect(d.lefts).toEqual({ x: ['w1'] });
    const two = left(d, 'w2');
    expect(two.ask).toBe(false);
    const three = left(two.dislikes, 'w3');
    expect(three.ask).toBe(true);
    expect(three.dislikes.asked).toEqual(['x']);
    expect(three.dislikes.lefts).toEqual({ x: ['w1', 'w2', 'w3'] });
    expect(three.dislikes.never, 'asking never bans').toBeUndefined();
  });

  it('asked once only, whatever the answer, and the stored workouts stay bounded', () => {
    let d: Dislikes = {};
    const asks: boolean[] = [];
    for (let i = 1; i <= 8; i++) {
      const r = left(d, `w${i}`);
      asks.push(r.ask);
      d = r.dislikes;
    }
    expect(asks).toEqual([false, false, true, false, false, false, false, false]);
    expect(d.lefts!.x).toHaveLength(3);
    expect(d.soft!.x).toBe(8);
  });

  it('a move already on the never list is not asked about, other moves keep their own count', () => {
    let d: Dislikes = { never: ['x'] };
    for (const w of ['a', 'b', 'c']) {
      const r = left(d, w);
      expect(r.ask).toBe(false);
      d = r.dislikes;
    }
    let e: Dislikes = {};
    e = learnLeft(e, 'x', 'a').dislikes;
    e = learnLeft(e, 'y', 'a').dislikes;
    e = learnLeft(e, 'x', 'b').dislikes;
    expect(learnLeft(e, 'y', 'c').ask).toBe(false);
    expect(learnLeft(e, 'x', 'c').ask).toBe(true);
  });
});

describe('3.5f (1) the intake deck: exercises you love / never want', () => {
  const deps = { data: SWAP_DATA, usable: (id: string) => demoFor(id) !== null };

  it('well known moves this gym surely has, one pattern after another, each once, never padded', () => {
    const full = intakeDeck(FULL, deps);
    expect(full.length).toBeGreaterThan(8);
    expect(full.length).toBeLessThanOrEqual(INTAKE_DECK_MAX);
    expect(new Set(full.map(SWAP_DATA.sameAs)).size).toBe(full.length);
    for (const id of full) {
      expect(demoFor(id), id).not.toBeNull();
      expect(sureGear(SWAP_DATA, id, FULL), id).toBe(true);
    }
    // The first cards cover the body: legs, a push, a pull.
    expect(full.slice(0, 3).map((id) => patternOf(SWAP_DATA, id))).toEqual(['squat', 'horizontal push', 'horizontal pull']);
    const hotel = intakeDeck(HOTEL, deps);
    for (const id of hotel) expect(sureGear(SWAP_DATA, id, HOTEL), id).toBe(true);
    expect(hotel.length).toBeLessThanOrEqual(full.length);
    // No equipment: only moves that need none (a floor move for the abs), never one this gym lacks.
    const NONE: GymKit = { equipment: [], dumbbellRange: null };
    for (const id of intakeDeck(NONE, deps)) expect(sureGear(SWAP_DATA, id, NONE), id).toBe(true);
    expect(intakeDeck(NONE, deps).length).toBeLessThan(4);
  });

  it('Love and Never never hold the same move; a pass changes nothing', () => {
    expect(decideExercise({ love: [], never: [] }, 'a', 'love')).toEqual({ love: ['a'], never: [] });
    expect(decideExercise({ love: ['a'], never: [] }, 'a', 'never')).toEqual({ love: [], never: ['a'] });
    expect(decideExercise({ love: [], never: ['a'] }, 'a', 'love')).toEqual({ love: ['a'], never: [] });
    expect(decideExercise({ love: ['a'], never: ['b'] }, 'c', 'pass')).toEqual({ love: ['a'], never: ['b'] });
    expect(decideExercise({ love: ['a'], never: [] }, 'a', 'love')).toEqual({ love: ['a'], never: [] });
  });
});
