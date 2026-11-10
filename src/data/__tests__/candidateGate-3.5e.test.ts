// PLAN 3.5e THE GATE (property tests): with no approvals every suggestion path (swaps, a day adapting
// to a gym, Up next, the plan generator, Quick workout's cards and every photo, muscle and name
// lookup) returns exactly what it returned before candidates existed; with approvals only approved
// candidates ever appear, behind every sure move; clearing them puts everything back.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import { PATTERN_FILE, SWAP_DATA } from '../patterns';
import { approvedCandidate, approvedLadder, loadCandidateFile, ownerCandidates, setApproved } from '../candidateGate';
import { demoFor, infoForExercise, photoEligibility } from '../exerciseInfo';
import { musclesForCatalog } from '../muscles';
import { exerciseNameOf } from '../importMatch';
import { GENERATOR_DEPS } from '../generator';
import { QUICK_DEPS } from '../quick';
import { upNextPool } from '../order';
import { generatePlan, type GeneratorInput } from '../../lib/generator';
import { buildConcepts } from '../../lib/quick';
import { PATTERNS, adaptDay, supports, swapCandidates, workoutIdOf, type SwapData } from '../../lib/swap';
import type { GymKit } from '../../lib/picker';
import { PRESET_KITS } from '../../lib/candidates/presets';

const RAW: SwapData = { patterns: PATTERN_FILE.patterns, planExercises: PATTERN_FILE.planExercises, sameAs: SWAP_DATA.sameAs };
const RAW_GEN = { ...GENERATOR_DEPS, data: RAW };
const RAW_QUICK = { ...QUICK_DEPS, data: RAW };

// A small seeded random (mulberry32): the same gyms every run.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(35);
const GYMS: GymKit[] = [
  ...PRESET_KITS.map((p) => p.kit),
  ...Array.from({ length: 24 }, () => {
    const equipment = EQUIPMENT_IDS.filter(() => rand() < 0.4) as EquipmentId[];
    return { equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null };
  }),
];
const BASE_IDS = PATTERNS.flatMap((p) => PATTERN_FILE.patterns[p].candidates.map(workoutIdOf));
const BASE_CATALOG = new Set(PATTERNS.flatMap((p) => PATTERN_FILE.patterns[p].candidates.map((c) => c.id)));
const PLAN_IDS = Object.keys(PATTERN_FILE.planExercises);
const INPUTS: GeneratorInput[] = GYMS.slice(0, 10).flatMap((gym, i) => [
  { goals: ['muscle'], experience: '1_2y', days: 3 + (i % 3), minutes: 45, gym },
  { goals: ['strength', 'fat_loss'], experience: 'new', days: 2 + (i % 4), minutes: 30, gym },
  { goals: ['athletic'], experience: '3y', days: 4, minutes: 60, gym },
] as GeneratorInput[]);

type Snapshot = { swaps: string; adapt: string; upNext: string; plans: string; quick: string };
function snapshot(data: SwapData, gen: typeof GENERATOR_DEPS, quick: typeof QUICK_DEPS): Snapshot {
  const swaps: string[][] = [];
  for (const gym of GYMS) for (const id of [...BASE_IDS, ...PLAN_IDS]) swaps.push(swapCandidates(data, id, gym).map((c) => c.id));
  const adapt = GYMS.map((gym) => adaptDay(data, PLAN_IDS.slice(0, 40).map((exerciseId) => ({ exerciseId })), gym));
  const upNext = GYMS.map((gym) => upNextPool(gym).map((p) => p.id));
  const plans = INPUTS.map((input) => generatePlan(input, gen));
  const quickCards = GYMS.slice(0, 8).flatMap((gym) => [15, 45].flatMap((minutes) => buildConcepts({ base: { goals: ['muscle'], experience: '1_2y', gym }, minutes, recent: [] }, quick).map((c) => [c.title, c.items.map((it) => it.id)])));
  return { swaps: JSON.stringify(swaps), adapt: JSON.stringify(adapt), upNext: JSON.stringify(upNext), plans: JSON.stringify(plans), quick: JSON.stringify(quickCards) };
}

const BEFORE = snapshot(RAW, RAW_GEN, RAW_QUICK);

afterAll(() => setApproved([]));

describe('the gate with no approvals', () => {
  it('leaves the committed ladders themselves in place', () => {
    expect(SWAP_DATA.patterns).toBe(PATTERN_FILE.patterns);
    for (const p of PATTERNS) expect(approvedLadder(p)).toEqual([]);
  });

  it('every suggestion path returns exactly what it did before candidates existed', () => {
    // The snapshot is not empty: cards, plans and swaps were really built.
    const cards = JSON.parse(BEFORE.quick) as Array<[string, string[]]>;
    expect(cards.length, 'cards').toBeGreaterThan(10);
    expect(cards.every(([, ids]) => ids.length >= 3), 'card sizes').toBe(true);
    expect(BEFORE.plans.length, 'plans').toBeGreaterThan(10_000);
    expect((JSON.parse(BEFORE.swaps) as string[][]).filter((l) => l.length).length, 'swaps').toBeGreaterThan(200);
    expect(snapshot(SWAP_DATA, GENERATOR_DEPS, QUICK_DEPS)).toEqual(BEFORE);
  });

  it('no candidate is ever a photo, a muscle map, a name or a swap, even with the file loaded', async () => {
    const file = await loadCandidateFile();
    expect(ownerCandidates().length).toBe(file.candidates.length);
    for (const c of ownerCandidates()) {
      expect(approvedCandidate(c.id)).toBeUndefined();
      expect(photoEligibility(c.id)).toBe('none');
      expect(demoFor(c.id)).toBeNull();
      expect(infoForExercise(c.id).demo).toBeNull();
      expect(musclesForCatalog(c.id)).toBeNull();
      expect(exerciseNameOf(c.id)).toBeUndefined();
    }
    expect(snapshot(SWAP_DATA, GENERATOR_DEPS, QUICK_DEPS)).toEqual(BEFORE);
  });

  it('ids that are not candidates are never approved', async () => {
    await loadCandidateFile();
    setApproved(['Pushups', 'not-a-move']);
    expect(SWAP_DATA.patterns).toBe(PATTERN_FILE.patterns);
    expect(approvedCandidate('Pushups')).toBeUndefined();
  });
});

describe('the gate with approvals', () => {
  it('only approved candidates appear, last in their ladder, and clearing them restores everything', async () => {
    await loadCandidateFile();
    const hotel = PRESET_KITS.find((p) => p.id === 'hotel')!.kit;
    const ladder = ownerCandidates().filter((c) => c.ladder && supports(c.requires, hotel));
    const approved = [...ladder.filter((c) => c.pattern === 'squat').slice(0, 2), ...ladder.filter((c) => c.pattern === 'lunge').slice(0, 1), ...ladder.filter((c) => c.pattern === 'core').slice(0, 3), ...ownerCandidates().filter((c) => !c.ladder).slice(0, 2)].map((c) => c.id);
    const rejected = ownerCandidates().map((c) => c.id).filter((id) => !approved.includes(id));
    setApproved(approved);

    for (const p of PATTERNS) {
      const base = PATTERN_FILE.patterns[p].candidates;
      const now = SWAP_DATA.patterns[p].candidates;
      expect(now.slice(0, base.length)).toEqual(base);
      for (const c of now.slice(base.length)) expect(approved).toContain(c.id);
    }
    for (const id of approved) {
      expect(photoEligibility(id)).toBe('exact');
      expect(demoFor(id)).not.toBeNull();
      expect(musclesForCatalog(id)).not.toBeNull();
      expect(exerciseNameOf(id)).toBe(approvedCandidate(id)!.name);
    }
    // An approved squat is offered to the hotel (sure demo, sure gear): Up next and swaps see it.
    const squat = approved[0]!;
    expect(upNextPool(hotel).map((p) => p.id)).toContain(squat);
    expect(swapCandidates(SWAP_DATA, 'Dumbbell_Squat', hotel).map((c) => c.id)).toContain(squat);

    const after = snapshot(SWAP_DATA, GENERATOR_DEPS, QUICK_DEPS);
    const all = Object.values(after).join('\n');
    for (const id of rejected) expect(all.includes(`"${id}"`), id).toBe(false);
    // Nothing but the approved ones is new.
    for (const gym of GYMS) for (const id of BASE_IDS) for (const c of swapCandidates(SWAP_DATA, id, gym)) expect(BASE_CATALOG.has(c.id) || approved.includes(c.id), c.id).toBe(true);

    setApproved([]);
    expect(snapshot(SWAP_DATA, GENERATOR_DEPS, QUICK_DEPS)).toEqual(BEFORE);
    for (const id of approved) expect(demoFor(id)).toBeNull();
  });
});

describe('the gate is one place in code', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? (f === '__tests__' ? [] : files(join(dir, f))) : /\.tsx?$/.test(f) ? [join(dir, f)] : []));
  const app = files('src');
  it('only src/data/candidateGate.ts reads the candidate file', () => {
    expect(app.filter((f) => /(?:from |import\()'[^']*catalog-candidates\.json'/.test(readFileSync(f, 'utf8')))).toEqual(['src/data/candidateGate.ts']);
  });
  it('only the owner Review screen lists every candidate', () => {
    expect(app.filter((f) => /\bownerCandidates\(/.test(readFileSync(f, 'utf8'))).sort()).toEqual(['src/screens/review/useCandidateReview.ts']);
  });
});
