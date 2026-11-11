// Independent check of PLAN 3.5j: G's gym, generated plans at 30 and 45 min, 3 and 4 days.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EquipmentId } from '../../db/types';
import { generate } from '../../data/generator';
import { loadCandidateFile, setApproved } from '../../data/candidateGate';
import { requiresOf, supports } from '../swap';
import { SWAP_DATA } from '../../data/patterns';
import type { RawDay } from '../generator';

const G_GEAR: EquipmentId[] = ['treadmill', 'elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'yoga_mat', 'lat_pulldown', 'cable_station'];
const gym = (unit: 'lb' | 'kg') => ({ equipment: G_GEAR, dumbbellRange: unit === 'lb' ? { min: 5, max: 45, step: 5 } : { min: 2, max: 22, step: 2 } });
const ids = (d: RawDay) => d.blocks.flatMap((b) => (b.type === 'superset' ? b.items.map((i) => i.id) : [b.id]));
const label = (d: RawDay) => d.blocks.map((b) => (b.type === 'superset' ? `[${b.items.map((i) => i.id).join(' + ')}]x${b.sets}` : `${b.id}x${b.sets}${b.warmup ? 'W' : ''}`)).join(', ') + (d.finisher ? ` FIN ${d.finisher.name}` : '');

beforeAll(async () => {
  await loadCandidateFile();
  setApproved([]);
});
afterAll(() => setApproved([]));

describe('verify 3.5j plans', () => {
  for (const unit of ['lb', 'kg'] as const)
    for (const minutes of [30, 45])
      for (const days of [3, 4])
        for (const goal of ['muscle', 'strength'] as const)
          it(`${unit} ${minutes} ${days}d ${goal}`, () => {
            const r = generate({ goals: [goal], experience: '1_2y', days, minutes, gym: gym(unit), place: 'hotel' });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            const out: string[] = [];
            r.plan.days.forEach((d, i) => {
              const n = ids(d).length + (d.finisher ? 1 : 0);
              out.push(`  ${d.name} (${n} moves, ${r.applied.minutes[i]} min): ${label(d)}`);
              for (const id of ids(d)) expect(supports(requiresOf(SWAP_DATA, id)!, gym(unit)), id).toBe(true);
              if (r.applied.minutes[i]! > minutes || r.applied.minutes[i]! < minutes - 2) out.push(`  !! ${d.name} ${r.applied.minutes[i]} min vs chip ${minutes}, over=${r.applied.over}`);
              // SPEC 22: the day's first (heaviest) lift is never in a pair; strength days have no pairs
              expect(d.blocks[0]!.type).toBe('single');
              if (goal === 'strength') expect(d.blocks.every((b) => b.type === 'single')).toBe(true);
              for (const b of d.blocks) if (b.type === 'superset') for (const it of b.items) expect(it.id).not.toBe((d.blocks[0] as { id: string }).id);
              if (!(n >= 5 && n <= 7)) out.push(`  !! ${d.name} has ${n} moves`);
            });
            console.log(`PLAN ${unit} ${minutes}min ${days}d ${goal}\n${out.join('\n')}`);
          });
});
