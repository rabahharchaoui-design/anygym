import { it } from 'vitest';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { presetEquipment } from '../intake/funnel';
import { equipmentPreset } from '../../db/gyms';
import { sureGear, quickDepsFor } from '../quick';
import { workoutIdOf } from '../swap';
it('chest pool by kit', () => {
  const out: string[] = [];
  for (const place of ['full', 'hotel', 'home', 'outdoors'] as const) {
    const gym = { equipment: presetEquipment(place), dumbbellRange: equipmentPreset(place === 'outdoors' ? 'none' : place, 'lb').dumbbellRange };
    const deps = quickDepsFor({ goals: ['muscle'], gym, experience: '1_2y' }, QUICK_DEPS);
    out.push(`${place} equip=${gym.equipment.join(',')}`);
    for (const pat of ['horizontal push', 'chest isolation', 'vertical push'] as const) {
      const ids = SWAP_DATA.patterns[pat].candidates.map(workoutIdOf).filter((id) => deps.usable(id) && sureGear(SWAP_DATA, id, gym as never));
      out.push(`  ${pat}: ${ids.join(', ')}`);
    }
  }
  console.log(out.join('\n'));
});
