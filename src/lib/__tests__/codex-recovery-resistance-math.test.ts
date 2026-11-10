import { describe, expect, it } from 'vitest';
import { deloadChanges, plateauOf, welcomeChanges } from '../coach/recovery';
import { targetOf } from '../coach/target';
import type { Lift, PlannedChange } from '../coach/types';
import { loadAt, stackLoad } from '../load';
import { KG, LB, NOW, lift, nov, sess } from './coach/fixtures';

// SPEC 0/5/6 and completed PLAN 3.8: follow a recovery suggestion all the
// way to the load reconstructed for the check button, using literal totals.
const routes: { name: string; change: (l: Lift) => PlannedChange | undefined }[] = [
  { name: 'lighter week', change: (l) => deloadChanges([l], NOW)[0] },
  { name: 'welcome back', change: (l) => welcomeChanges([l], [nov(1)], NOW)[0] },
  { name: 'plateau reset', change: (l) => {
    const p = plateauOf(l, NOW);
    return p?.action.kind === 'lighter' ? p.action.change : undefined;
  } },
];

describe('recovery targets use complete resistance', () => {
  for (const route of routes) {
    // CODEX FOUND BUG: Lighter week, welcome back and plateau reset drop stack add-ons, reducing 150 lb to 90 lb and 75 kg to 45 kg instead of 135 lb and 67.5 kg.
    it(`${route.name} reduces pin plus add-on by about 10%`, () => {
      for (const [setup, pin, added, expected] of [[LB, 100, 50, 135], [KG, 50, 25, 67.5]] as const) {
        const old = stackLoad(pin, setup.unit, added);
        const l = lift({ exerciseId: 'lat-pulldown', pattern: 'vertical pull', setup,
          sessions: [sess(nov(5), [8, 8, 8], old, [8, 12], 'hard'), sess(nov(1), [8, 8, 8], old, [8, 12], 'hard')] });
        const before = structuredClone(l);
        const c = route.change(l);
        expect(c).toBeDefined();
        const next = loadAt('stack', targetOf(c!, NOW).value, setup);
        expect.soft(next?.total, `${setup.unit}: 90% of complete resistance`).toBe(expected);
        expect(l).toEqual(before);
      }
    });
  }

  it('all recovery routes preserve the women’s bar, collars and plate machine starting resistance', () => {
    for (const route of routes) {
      for (const [kind, setup, total, expected] of [
        ['barbell', { ...KG, base: 15, collars: 'competition' as const, sleeveLength: 320 }, 100, 90],
        ['plate_machine', { ...LB, base: 50, collars: 'competition' as const }, 200, 180],
      ] as const) {
        const old = loadAt(kind, total, setup)!;
        expect(old).not.toBeNull();
        const l = lift({ loadKind: kind, setup,
          sessions: [sess(nov(5), [8, 8, 8], old, [8, 12], 'hard'), sess(nov(1), [8, 8, 8], old, [8, 12], 'hard')] });
        const c = route.change(l);
        expect(c).toBeDefined();
        const next = loadAt(kind, targetOf(c!, NOW).value, setup)!;
        expect(next.total).toBe(expected);
        expect(next.barWeight).toBe(setup.base);
        expect(next.collars).toBe(kind === 'barbell' ? 5 : 0);
        expect(next.total).toBe(setup.base + next.collars! + 2 * next.perSide!.reduce((a, b) => a + b, 0));
      }
    }
  });
});
