// PLAN 3.6h2 (2): Level up and Not now (hold) targets keep a stack's add-on, like the test set and
// the lighter week (3.6w). The raise is judged on the whole resistance; the target is a heavier
// pin with the SAME add-on on top. Expected numbers are worked by hand.
import { describe, expect, it } from 'vitest';
import { autoExample, holdChanges, liftVerdict, toWeight } from '../coach';
import { levelUpTarget, levelUpWeight, stackLoad, type LoadSetup } from '../load';
import { KG, LB, NOW, lift, nov, sess } from './coach/fixtures';

const upper = { lb: { pct: 0.025, minAdd: 5, capPct: 0.05 }, kg: { pct: 0.025, minAdd: 2.5, capPct: 0.05 } };
const lower = { pct: 0.05, minAdd: 10, capPct: 0.1 };

describe('levelUpTarget', () => {
  it('lb: 100 pin + 50 added (150) → 105 pin + 50 = 155 (upper), 110 + 50 = 160 (lower)', () => {
    expect(levelUpTarget('stack', 100, upper.lb, LB, 50)).toEqual({ value: 105, added: 50 });
    expect(levelUpTarget('stack', 100, lower, LB, 50)).toEqual({ value: 110, added: 50 });
  });

  it('kg: 50 pin + 25 added (75) → 52.5 pin + 25 = 77.5', () => {
    expect(levelUpTarget('stack', 50, upper.kg, KG, 25)).toEqual({ value: 52.5, added: 25 });
  });

  it('the same whole total the pin only raise reached, with the add-on kept', () => {
    const pinOnly = levelUpWeight('stack', 100, upper.lb, LB, 50)!;
    const kept = levelUpTarget('stack', 100, upper.lb, LB, 50)!;
    expect(toWeight({ to: kept.value, toAdded: kept.added })).toBe(pinOnly);
  });

  it('an add-on that is not a whole step: 120 pin + 2.5 → 125 pin + 2.5 = 127.5', () => {
    expect(levelUpTarget('stack', 120, upper.lb, LB, 2.5)).toEqual({ value: 125, added: 2.5 });
  });

  it('no add-on and other loads: levelUpWeight, nothing added; no step up: null', () => {
    expect(levelUpTarget('stack', 100, upper.lb, LB)).toEqual({ value: 105, added: 0 });
    expect(levelUpTarget('barbell', 135, upper.lb, LB)).toEqual({ value: 140, added: 0 });
    expect(levelUpTarget('barbell', 135, upper.lb, { ...LB, base: null })).toBeNull();
    const noStep: LoadSetup = { ...LB, stackStep: 0 };
    expect(levelUpTarget('stack', 100, upper.lb, noStep, 50)).toBeNull();
  });
});

describe('the Level up card and Not now', () => {
  const pulldown = (setup: LoadSetup, pin: number, added: number) =>
    lift({ exerciseId: 'lat-pulldown', name: 'Lat Pulldown', loadKind: 'stack', pattern: 'vertical pull', setup, sessions: [sess(nov(5), [12, 12, 12], stackLoad(pin, setup.unit, added))] });

  it('lb: the raise is 105 pin + 50 and the card says +5 lb from 150; Not now keeps 100 + 50', () => {
    const v = liftVerdict(pulldown(LB, 100, 50), [], NOW);
    if (!v || !('raise' in v)) throw new Error('expected a raise');
    expect(v.raise).toMatchObject({ from: 100, fromTotal: 150, to: 105, toAdded: 50 });
    expect(v.raise.reason).toMatch(/^\+5 lb:/);
    const [hold] = holdChanges({ earned: [v.raise] }, NOW);
    expect(hold).toMatchObject({ from: 100, fromTotal: 150, to: 100, toAdded: 50, source: 'hold' });
    expect(toWeight(hold!)).toBe(150);
  });

  it('kg: 50 pin + 25 → 52.5 + 25; Not now keeps 50 + 25', () => {
    const v = liftVerdict(pulldown(KG, 50, 25), [], NOW);
    if (!v || !('raise' in v)) throw new Error('expected a raise');
    expect(v.raise).toMatchObject({ from: 50, fromTotal: 75, to: 52.5, toAdded: 25 });
    expect(v.raise.reason).toMatch(/^\+2\.5 kg:/);
    expect(holdChanges({ earned: [v.raise] }, NOW)[0]).toMatchObject({ to: 50, toAdded: 25 });
  });

  it('a pin with nothing added: no add-on field on the raise or the hold (old shape)', () => {
    const v = liftVerdict(pulldown(LB, 100, 0), [], NOW);
    if (!v || !('raise' in v)) throw new Error('expected a raise');
    expect('toAdded' in v.raise).toBe(false);
    expect('toAdded' in holdChanges({ earned: [v.raise] }, NOW)[0]!).toBe(false);
  });

  it('the Auto level up example shows the whole total: 150 → 155 lb', () => {
    const ex = autoExample([pulldown(LB, 100, 50)], [], NOW)!;
    expect(ex).toMatchObject({ from: 100, fromTotal: 150, to: 105, toAdded: 50 });
  });
});
