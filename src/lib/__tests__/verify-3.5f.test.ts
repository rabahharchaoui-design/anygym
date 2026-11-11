// Verifier probe for PLAN 3.5f (3): my own property test over presets x 15/30/45/60.
import { describe, expect, it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { profileFor } from '../../data/order';
import { equipmentPreset } from '../../db/gyms';
import { GYM_TYPE_OF, presetEquipment } from '../intake/funnel';
import type { GymKit } from '../picker';
import { SESSION_AREAS, hardSetsBy, isCompound } from '../order';
import { QUICK_MINUTES, focusCard } from '../quick';

const PRESETS = ['full', 'hotel', 'home', 'outdoors', 'mix'] as const;
const kitOf = (p: (typeof PRESETS)[number]): GymKit => ({ equipment: presetEquipment(p), dumbbellRange: equipmentPreset(GYM_TYPE_OF[p], 'lb').dumbbellRange });
const dbOnly: GymKit = { equipment: ['dumbbells' as never], dumbbellRange: { min: 5, max: 50, step: 5 } };
const bw: GymKit = { equipment: [], dumbbellRange: null as never };
const kits: [string, GymKit][] = [...PRESETS.map((p) => [p, kitOf(p)] as [string, GymKit]), ['dbonly', dbOnly], ['bodyweight', bw]];

describe('probe', () => {
  it('dump chest cards', () => {
    const out: string[] = [];
    for (const [label, gym] of kits)
      for (const minutes of QUICK_MINUTES) {
        const c = focusCard('chest', { base: { goals: ['muscle'], gym, experience: '1_2y' }, minutes, recent: [] }, QUICK_DEPS);
        out.push(`${label} ${minutes}: ${c ? c.items.map((i) => `${i.name}[${i.sets}x${JSON.stringify(i.reps)} r${i.restSec}${i.group !== undefined ? ' g' + i.group : ''}]`).join(' | ') + ` =${c.minutes}m` : 'NO CARD'}`);
      }
    console.log(out.join('\n'));
    expect(true).toBe(true);
  });
  it('all areas property', () => {
    for (const [label, gym] of kits)
      for (const minutes of QUICK_MINUTES)
        for (const area of SESSION_AREAS) {
          const c = focusCard(area, { base: { goals: ['muscle'], gym, experience: '1_2y' }, minutes, recent: [] }, QUICK_DEPS);
          if (!c) continue;
          const ps = c.items.map((i) => profileFor(i.id));
          expect(isCompound(ps[0]!), `${label} ${minutes} ${area}`).toBe(true);
          expect(c.minutes, `${label} ${minutes} ${area} time`).toBeLessThanOrEqual(minutes);
          const by = hardSetsBy(c.items.map((i) => ({ sets: i.sets, profile: profileFor(i.id) })));
          for (const [, n] of by) expect(n).toBeLessThanOrEqual(10);
        }
  });
});
