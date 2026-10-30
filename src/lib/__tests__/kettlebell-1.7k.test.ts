// PLAN 1.7k (Codex 1025 1348 #7): kettlebells and other single implements use their own
// availability (exact entry: gyms keep no kettlebell list), never the dumbbell range.
import { describe, expect, it } from 'vitest';
import { makeGym } from '../../db/gyms';
import type { Gym } from '../../db/types';
import { exactHeldLoad, heldChoices, loadAt, nearestLoadable, singleLoad, stepUp } from '../load';
import { heldDumbbellName } from '../loadTypeRule';
import { progress, RESET } from '../progression';
import { copyLastLoad, isExactHeld, loadSetupFor, prefillLoad, wheelWeights } from '../../screens/workout/exerciseLoad';

const gym = (): Gym => makeGym({ name: 'Club', type: 'full', unit: 'lb' }, 0); // dumbbells 5 to 100 by 5
const KB = 'Kettlebell Swing';
const day = (n: number) => new Date(2026, 9, n, 18).getTime();
const kbHistory = (reps: number[], weight = 53, unit: 'lb' | 'kg' = 'lb', date = day(10)) => ({ date, gymId: 'g', unit, sets: reps.map((r) => ({ kind: 'work' as const, reps: r, load: singleLoad(weight, unit) })) });
const run = (history: ReturnType<typeof kbHistory>[], g = gym()) =>
  progress({ exerciseId: 'kettlebell-swing', loadKind: 'single', unit: g.unit, gym: loadSetupFor(g, 'single', 'kettlebell-swing', KB), repRange: [8, 12], history });

describe('kettlebells use exact entry, never the dumbbell range', () => {
  it('Codex repro: 53 lb kettlebell history targets 53 lb, never a 55 lb dumbbell weight', () => {
    const p = run([kbHistory([10, 10])]);
    expect(p.next.load).toEqual(singleLoad(53, 'lb'));
    expect(p.perSet.every((r) => r.target.load?.total === 53)).toBe(true);
    expect(p.next.reason).toBe('Aim for 11, 10 or better');
  });
  it('at the top of the range: no made up next kettlebell, the same 53 lb and the honest words', () => {
    const p = run([kbHistory([12, 12])]);
    expect(p.next.load!.total).toBe(53);
    expect(p.next.reason).toBe('All sets hit 12. Go heavier if you have it, or add a rep to each set');
  });
  it('a reset or another unit never invents a weight', () => {
    const reset = run([kbHistory([6, 6], 53, 'lb', day(11)), kbHistory([6, 6], 53, 'lb', day(10))]);
    expect(reset.next.load).toBeNull();
    expect(reset.next.reason).toBe(`${RESET}: type a lighter weight you have`);
    const conv = run([kbHistory([10, 10], 24, 'kg')]);
    expect(conv.next.load).toBeNull();
    expect(conv.next.reason).toBe('Last time 24 kg. Type the weight in lb');
  });
  it('selection, validation and prefill: any real weight typed exactly, nothing from the dumbbell range', () => {
    const g = gym();
    expect(isExactHeld('single', KB)).toBe(true);
    expect(isExactHeld('single', 'Sumo Squat')).toBe(true);
    expect(isExactHeld('single', 'Goblet Squat')).toBe(false);
    expect(isExactHeld('single', 'Single Arm Dumbbell Row')).toBe(false);
    expect(isExactHeld('single', 'Plate Russian Twist')).toBe(false);
    expect(heldDumbbellName('Kettlebell Goblet Squat')).toBe(false);
    expect(wheelWeights(g, 'single', KB)).toEqual([]);
    const setup = { unit: g.unit, ...loadSetupFor(g, 'single', 'kettlebell-swing', KB) };
    expect(heldChoices('single', setup)).toBeNull();
    expect(loadAt('single', 53, setup)).toEqual(singleLoad(53, 'lb'));
    expect(loadAt('single', 0, setup)).toBeNull();
    expect(loadAt('single', 501, setup)).toBeNull();
    expect(nearestLoadable('single', 53, setup)).toBeNull();
    expect(stepUp('single', 53, setup)).toBeNull();
    expect(prefillLoad(singleLoad(53, 'lb'), 'single', g, 'kettlebell-swing', KB)).toEqual(singleLoad(53, 'lb'));
    expect(prefillLoad(singleLoad(53, 'lb'), 'single', { ...g, dumbbellRange: null }, 'kettlebell-swing', KB)).toEqual(singleLoad(53, 'lb'));
    expect(prefillLoad(singleLoad(24, 'kg'), 'single', g, 'kettlebell-swing', KB)).toBeNull();
    expect(copyLastLoad(singleLoad(53, 'lb'), 'single', g, 'kettlebell-swing', KB)).toEqual({ load: singleLoad(53, 'lb') });
    // A dumbbell held upright still uses the range.
    expect(prefillLoad(singleLoad(53, 'lb'), 'single', g, 'goblet-squat', 'Goblet Squat')).toBeNull();
  });
  it('exactHeldLoad refuses what is not a weight', () => {
    expect(exactHeldLoad(35, 'kg')).toEqual(singleLoad(35, 'kg'));
    expect(exactHeldLoad(0, 'lb')).toBeNull();
    expect(exactHeldLoad(-4, 'lb')).toBeNull();
    expect(exactHeldLoad(Number.NaN, 'lb')).toBeNull();
    expect(exactHeldLoad(251, 'kg')).toBeNull();
  });
});

describe('exactHeldProblem (PLAN 2.0d follow up): the real reason a typed weight cannot be used', () => {
  it('empty, over the limit, zero, or fine', async () => {
    const { exactHeldProblem } = await import('../load');
    expect(exactHeldProblem(null, 'lb')).toBe('empty');
    expect(exactHeldProblem(501, 'lb')).toBe('over');
    expect(exactHeldProblem(500, 'lb')).toBeNull();
    expect(exactHeldProblem(251, 'kg')).toBe('over');
    expect(exactHeldProblem(0, 'kg')).toBe('zero');
    expect(exactHeldProblem(53, 'lb')).toBeNull();
  });
});
