import { it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA } from '../../data/patterns';
import { presetEquipment } from '../intake/funnel';
import { requiresOf } from '../swap';
import { isCompound, isHeavy } from '../order';
import { sureGear } from '../quick';
import { lowImpact } from '../quickStyles';
import { GENERATOR_DEPS } from '../../data/generator';
it('pool', () => {
  const gym = { equipment: (process.env.GYM==='full'? undefined as any : presetEquipment('hotel')), dumbbellRange: { min: 5, max: 50, step: 5 } };
  const all = [...new Set(Object.values(SWAP_DATA.patterns).flatMap((l) => l.candidates.map((c) => c.planId ?? c.id)))];
  void GENERATOR_DEPS;
  const rows: string[] = [`hotel equipment: ${gym.equipment.join(',')}`, `ids: ${all.length}`];
  for (const id of all) {
    if (!QUICK_DEPS.usable(id) || !sureGear(SWAP_DATA, id, gym)) continue;
    const p = QUICK_DEPS.profile(id);
    rows.push(`${p.pattern} | ${id} | ${QUICK_DEPS.name(id)} | tier ${p.tier} ${p.role} ${isCompound(p) ? 'C' : ''}${isHeavy(p) ? 'H' : ''} ${lowImpact(p, requiresOf(SWAP_DATA, id)) ? 'low' : ''} | ${JSON.stringify(requiresOf(SWAP_DATA, id))} | t:${p.targets.join(',')}`);
  }
  appendFileSync('/tmp/pool35b.txt', rows.sort().join('\n') + '\n');
});
