// The three generated curated plans (SPEC 7.5 items 3 to 5, PLAN 3.5): their fixed inputs. The
// generator turns them into data/plans/*.json (scripts/freeze-plans.mts writes the files, a Vitest
// checks the files still equal the generator's output), so they stay reviewable and reproducible.
import { equipmentPreset } from '../db/gyms';
import type { GeneratorInput } from '../lib/generator';
import { generate } from './generator';

export type FrozenPlan = { file: string; input: GeneratorInput };

const hotel = equipmentPreset('hotel', 'lb');
const full = equipmentPreset('full', 'lb');

export const FROZEN_PLANS: readonly FrozenPlan[] = [
  {
    file: 'hotel-gym-3-day.json',
    input: {
      goals: ['muscle'],
      experience: '1_2y',
      days: 3,
      minutes: 45,
      // SPEC 3 Hotel gym: dumbbells to 50 lb, a bench, one cable station (and a treadmill and bike).
      gym: { equipment: hotel.equipment, dumbbellRange: hotel.dumbbellRange },
      place: 'hotel',
      meta: {
        id: 'hotel-gym-3-day',
        name: 'Hotel Gym 3 Day',
        summary: 'Full body three days a week with dumbbells up to 50 lb, a bench and one cable. Built for travel.',
        gymType: 'hotel',
      },
    },
  },
  {
    file: 'no-equipment-3-day.json',
    input: {
      goals: ['health'],
      experience: 'months',
      days: 3,
      minutes: 30,
      gym: { equipment: [], dumbbellRange: null },
      place: 'outdoors',
      meta: {
        id: 'no-equipment-3-day',
        name: 'No Equipment 3 Day',
        summary: 'Full body three days a week with just your body. No pulling moves: those need a bar or bands.',
        gymType: 'none',
      },
    },
  },
  {
    file: 'beginner-full-body-3-day.json',
    input: {
      goals: ['muscle'],
      experience: 'new',
      days: 3,
      minutes: 45,
      style: 'machines',
      gym: { equipment: full.equipment, dumbbellRange: full.dumbbellRange },
      place: 'full',
      meta: {
        id: 'beginner-full-body-3-day',
        name: 'Beginner Full Body 3 Day',
        summary: 'Full body three days a week for a full gym, machines first. Start light and learn the moves.',
        gymType: 'full',
      },
    },
  },
];

/** The file's exact text for one frozen plan. Throws when the generator cannot build it. */
export function frozenPlanText(p: FrozenPlan): string {
  const r = generate(p.input);
  if (!r.ok) throw new Error(`${p.file}: ${r.reason}`);
  return JSON.stringify(r.plan, null, 1) + '\n';
}
