import { it, beforeAll } from 'vitest';
import { generate } from '../../data/generator';
import { loadCandidateFile, setApproved } from '../../data/candidateGate';
beforeAll(async () => { await loadCandidateFile(); setApproved([]); });
it('dbg', () => {
  const G = ['treadmill','elliptical','stair_climber','leg_extension','leg_curl','chest_press_machine','shoulder_press_machine','flat_bench','adjustable_bench','dumbbells','kettlebells','yoga_mat','lat_pulldown','cable_station'] as never[];
  const r = generate({ goals: ['muscle'], experience: '1_2y', days: 4, minutes: 30, gym: { equipment: G, dumbbellRange: { min: 5, max: 45, step: 5 } }, place: 'hotel' });
  if (!r.ok) return;
  for (const d of r.plan.days) console.log(d.name, JSON.stringify(d.blocks.map((b) => b.type === 'single' ? [b.id, b.sets, b.restSec] : [b.items.map((i) => i.id), b.sets, b.restSec])));
});
