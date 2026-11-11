// PLAN 3.5j round 2: SPEC 7.3's set ceiling holds in every generator rule (fill up, added moves, the
// time trim, focus for a new lifter), over every experience level, goal, time and day count.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import { maxSetsFor } from '../generatorRules';
import { EXPERIENCE, MINUTES, type GoalId } from '../intake/options';

const kit = (place: 'full' | 'hotel' | 'home') => {
  const p = equipmentPreset(place, 'lb');
  return { equipment: p.equipment, dumbbellRange: p.dumbbellRange };
};

describe('set ceilings by experience (SPEC 7.3)', () => {
  for (const exp of EXPERIENCE.map((e) => e.id))
    it(`${exp}: no block goes past its ceiling`, () => {
      let checked = 0;
      for (const place of ['full', 'hotel', 'home'] as const)
        for (const minutes of [...MINUTES, undefined])
          for (const days of [2, 3, 4, 5, 6])
            for (const goal of ['muscle', 'strength', 'fat_loss', 'comeback'] as GoalId[]) {
              const r = generate({ goals: [goal], experience: exp, days, minutes, gym: kit(place), place });
              if (!r.ok) continue;
              const cap = maxSetsFor(exp, goal === 'comeback');
              for (const d of r.plan.days)
                for (const b of d.blocks) {
                  if (b.type === 'single' && b.warmup) continue;
                  expect(b.sets, `${exp} ${place} ${days}d ${minutes} ${goal} ${d.name}`).toBeLessThanOrEqual(cap);
                  checked++;
                }
            }
      expect(checked).toBeGreaterThan(100);
    });

  it('a new lifter with a focus still stays at 3 sets', () => {
    const r = generate({ goals: ['muscle'], experience: 'new', days: 3, focus: ['arms', 'core'], gym: kit('full'), place: 'full' });
    expect(r.ok).toBe(true);
    if (r.ok) for (const d of r.plan.days) for (const b of d.blocks) expect(b.sets).toBeLessThanOrEqual(3);
  });
});
