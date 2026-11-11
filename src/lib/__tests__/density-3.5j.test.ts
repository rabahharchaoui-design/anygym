// PLAN 3.5j round 2: G's hotel style gym (no barbell) at 30 and 45 min: 5 to 7 moves a day for a
// muscle goal, and never over the minutes picked, strength goal included (long rests kept).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EquipmentId } from '../../db/types';
import { generate } from '../../data/generator';
import { loadCandidateFile, setApproved } from '../../data/candidateGate';

const G_GEAR: EquipmentId[] = ['treadmill', 'elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'yoga_mat', 'lat_pulldown', 'cable_station'];
const gym = { equipment: G_GEAR, dumbbellRange: { min: 5, max: 45, step: 5 } };

beforeAll(async () => {
  await loadCandidateFile();
  setApproved([]);
});
afterAll(() => setApproved([]));

describe('G gym density', () => {
  for (const minutes of [30, 45])
    for (const days of [3, 4])
      for (const goal of ['muscle', 'strength'] as const)
        it(`${minutes} min, ${days} days, ${goal}`, () => {
          const r = generate({ goals: [goal], experience: '1_2y', days, minutes, gym, place: 'hotel' });
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(r.applied.over).toBe(false);
          r.plan.days.forEach((d, i) => {
            const moves = d.blocks.reduce((n, b) => n + (b.type === 'superset' ? b.items.length : 1), 0);
            expect(r.applied.minutes[i]!, d.name).toBeLessThanOrEqual(minutes);
            if (goal === 'muscle') {
              expect(moves, d.name).toBeGreaterThanOrEqual(5);
              expect(moves, d.name).toBeLessThanOrEqual(7);
            }
            if (goal === 'strength') expect((d.blocks[0] as { restSec: number }).restSec, `${d.name} lead lift rest`).toBeGreaterThanOrEqual(150);
          });
        });
});
