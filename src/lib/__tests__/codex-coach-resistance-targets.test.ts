import { describe, expect, it } from 'vitest';
import { liftVerdict } from '../coach/levelUp';
import { targetOf } from '../coach/target';
import { loadAt, stackLoad, type LoadSetup } from '../load';
import { KG, LB, NOW, lift, nov, sess } from './coach/fixtures';

// SPEC 0, 5, 6, 20.2; completed PLAN 3.8. ExerciseView rebuilds the
// accepted target through targetOf -> loadAt; test that entire numeric path.
describe('coach targets preserve the resistance the lifter actually used', () => {
  // CODEX FOUND BUG: A coach pin increase drops added resistance, turning 125 lb into 105 lb and 60 kg into 52.5 kg.
  it('never turns an earned pin increase into a lighter total by dropping the add-on, in lb or kg', () => {
    for (const [setup, pin, added] of [[LB, 100, 25], [KG, 50, 10]] as const) {
      const old = stackLoad(pin, setup.unit, added);
      const l = lift({ exerciseId: 'lat-pulldown', loadKind: 'stack', pattern: 'vertical pull', setup,
        sessions: [sess(nov(5), [12, 12, 12], old)] });
      const before = structuredClone(l);
      const verdict = liftVerdict(l, [], NOW);
      expect(verdict && 'raise' in verdict).toBe(true);
      if (!verdict || !('raise' in verdict)) throw new Error('Expected an earned increase');
      const target = targetOf(verdict.raise, NOW);
      const next = loadAt('stack', target.value, setup);
      expect(next).not.toBeNull();
      expect.soft(next!.total, `${setup.unit}: an increase must exceed pin plus add-on`).toBeGreaterThan(old.total);
      expect(l).toEqual(before);
    }
  });

  it('rebuilds earned bar and machine targets with the real base, two equal sleeves and the correct collars', () => {
    const cases: { kind: 'barbell' | 'plate_machine'; setup: LoadSetup; total: number }[] = [
      { kind: 'barbell', setup: { ...KG, base: 15, collars: 'competition', sleeveLength: 320 }, total: 60 },
      { kind: 'barbell', setup: { ...LB, base: 35 }, total: 135 },
      { kind: 'plate_machine', setup: { ...KG, base: 25, collars: 'competition' }, total: 105 },
      { kind: 'plate_machine', setup: { ...LB, base: 50 }, total: 140 },
    ];
    for (const { kind, setup, total } of cases) {
      const old = loadAt(kind, total, setup)!;
      expect(old).not.toBeNull();
      const l = lift({ loadKind: kind, setup, sessions: [sess(nov(5), [12, 12, 12], old)] });
      const verdict = liftVerdict(l, [], NOW);
      expect(verdict && 'raise' in verdict).toBe(true);
      if (!verdict || !('raise' in verdict)) throw new Error('Expected an earned increase');
      const next = loadAt(kind, targetOf(verdict.raise, NOW).value, setup)!;
      expect(next).not.toBeNull();
      const collars = kind === 'barbell' && setup.collars === 'competition' ? 5 : 0;
      expect(next.unit).toBe(setup.unit);
      expect(next.barWeight).toBe(setup.base);
      expect(next.collars).toBe(collars);
      expect(next.total).toBe(setup.base! + collars + 2 * next.perSide!.reduce((a, b) => a + b, 0));
      expect(next.total).toBeGreaterThan(total);
      for (const plate of next.perSide!) expect(setup.plates).toContain(plate);
    }
  });
});
