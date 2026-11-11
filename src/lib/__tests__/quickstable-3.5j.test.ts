// PLAN 3.5j round 2: the same inputs and rotation memory give the same Quick cards (a reload never
// reshuffles them), and a Strength focus card is never over the minutes picked.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EquipmentId } from '../../db/types';
import { loadCandidateFile, setApproved } from '../../data/candidateGate';
import { QUICK_DEPS } from '../../data/quick';
import { buildIdeas, QUICK_MINUTES } from '../quick';

const G_GEAR: EquipmentId[] = ['treadmill', 'elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'yoga_mat', 'lat_pulldown', 'cable_station'];
const gym = { equipment: G_GEAR, dumbbellRange: { min: 5, max: 45, step: 5 } };

beforeAll(async () => {
  await loadCandidateFile();
  setApproved([]);
});
afterAll(() => setApproved([]));

describe('quick cards are stable', () => {
  for (const minutes of QUICK_MINUTES)
    it(`${minutes} min: ten builds, same cards and same moves; strength never over`, () => {
      const run = () => buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes, recent: [], lastShown: ['circuit', 'pump'], done: [] }, QUICK_DEPS);
      const first = run();
      const key = (r: ReturnType<typeof run>) => JSON.stringify([r.cards, r.more].map((cs) => cs.map((c) => [c.id, c.variant, c.items.map((i) => [i.id, i.sets, i.restSec])])));
      for (let i = 0; i < 10; i++) expect(key(run())).toBe(key(first));
      for (const c of [...first.cards, ...first.more]) {
        expect(c.minutes, `${c.id} ${c.variant ?? ''}`).toBeLessThanOrEqual(minutes + 2);
        if (c.id === 'strength') {
          expect(c.over).toBe(false);
          expect(c.minutes).toBeLessThanOrEqual(minutes);
        }
      }
    });
});
