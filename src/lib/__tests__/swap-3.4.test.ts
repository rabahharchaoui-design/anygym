// PLAN 3.4: the ladders (data/patterns.json) and the pure swap engine.
import { describe, expect, it } from 'vitest';
import catalog from '../../../data/catalog.json';
import planExercises from '../../../data/plan-exercises.json';
import { PATTERN_FILE, SWAP_DATA } from '../../data/patterns';
import { EQUIPMENT_IDS, type EquipmentId, type SessionSwap } from '../../db/types';
import { demoFor } from '../../data/exerciseInfo';
import { EXERCISE_MAP } from '../../data/muscles';
import { planExercise } from '../../data/planExercises';
import { PLANS } from '../../data/plans';
import { dayWorkout, firstOpen, upNext, type WorkoutEntry } from '../planWorkout';
import { PATTERNS, adaptDay, applySwap, finishRows, liveEntries, missingWord, patternOf, requiresOf, revertSwap, slotProgress, supports, swapCandidates, swapLine, swapReason, validatePatterns, workoutIdOf, type PatternFile } from '../swap';
import catalogDemos from '../../../data/catalog-demos.json';

const CATALOG = new Set((catalog as { exercises: Array<{ id: string }> }).exercises.map((e) => e.id));
const PLAN_IDS = (planExercises as Array<{ id: string }>).map((e) => e.id);
const kit = (equipment: EquipmentId[]) => ({ equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null });
const FULL = kit([...EQUIPMENT_IDS]);
const HOTEL = kit(['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike']);
const NOTHING = kit([]);
const ids = (id: string, gym = FULL, opts = {}) => swapCandidates(SWAP_DATA, id, gym, opts).map(workoutIdOf);

const HAND_CHECKED = (catalogDemos as { exercises: { catalogId: string }[] }).exercises.map((e) => e.catalogId);

describe('data/patterns.json', () => {
  it('is valid: all 17 patterns, every id in the catalog, every plan exercise has a row', () => {
    expect(validatePatterns(PATTERN_FILE, CATALOG, PLAN_IDS, EQUIPMENT_IDS)).toEqual([]);
    expect(Object.keys(PATTERN_FILE.patterns).sort()).toEqual([...PATTERNS].sort());
    expect(PATTERNS).toHaveLength(17);
  });

  it('a validator catches an invented id, a missing pattern and unknown equipment', () => {
    const bad: PatternFile = JSON.parse(JSON.stringify(PATTERN_FILE));
    bad.patterns.squat.candidates[0]!.id = 'Invented_Squat';
    bad.patterns.hinge.candidates[0]!.requires = [['teleporter' as EquipmentId]];
    delete (bad.patterns as Partial<typeof bad.patterns>).core;
    const problems = validatePatterns(bad, CATALOG, PLAN_IDS, EQUIPMENT_IDS);
    expect(problems.join('\n')).toMatch(/Invented_Squat not in catalog/);
    expect(problems.join('\n')).toMatch(/teleporter/);
    expect(problems.join('\n')).toMatch(/missing pattern core/);
  });

  it('a linked plan exercise really is that catalog exercise: the map never disagrees', () => {
    const map = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));
    for (const ladder of Object.values(PATTERN_FILE.patterns)) {
      for (const c of ladder.candidates) {
        if (!c.planId) continue;
        const entry = map.get(c.planId);
        if (entry?.catalogId) expect(entry.catalogId, c.planId).toBe(c.id);
        expect(planExercise(c.planId)?.loadType === 'timed', c.planId).toBe(!!c.timed);
      }
    }
  });

  it('SPEC 7.2 horizontal push order holds: barbell, dumbbell, machine, Smith, then push ups', () => {
    const order = PATTERN_FILE.patterns['horizontal push'].candidates.map((c) => c.id);
    const at = (id: string) => order.indexOf(id);
    expect(at('Barbell_Bench_Press_-_Medium_Grip')).toBe(0);
    expect(at('Dumbbell_Bench_Press')).toBeLessThan(at('Machine_Bench_Press'));
    expect(at('Machine_Bench_Press')).toBeLessThan(at('Smith_Machine_Bench_Press'));
    expect(at('Smith_Machine_Bench_Press')).toBeLessThan(at('Pushups'));
    expect(at('Pushups')).toBeLessThan(at('Incline_Push-Up'));
  });

  it('every candidate it can show has a photo only through an audited match', () => {
    // PLAN 3.5a round 2: or a catalog exercise whose photos were checked by hand (data/catalog-demos.json).
    const eligible = new Set([...EXERCISE_MAP.filter((e) => e.match !== 'none').map((e) => e.catalogId), ...HAND_CHECKED]);
    for (const ladder of Object.values(PATTERN_FILE.patterns)) {
      for (const c of ladder.candidates) if (demoFor(workoutIdOf(c))) expect(eligible.has(c.id), c.id).toBe(true);
    }
    expect(demoFor('Pushups')).toBeNull();
    expect(demoFor('dumbbell-bench-press')).not.toBeNull();
  });

  it('thin ladders say why', () => {
    expect(PATTERN_FILE.patterns['quads isolation'].thin).toBeTruthy();
    expect(PATTERN_FILE.patterns['quads isolation'].candidates).toHaveLength(2);
  });
});

describe('supports and missing gear', () => {
  it('reads AND of OR groups, and dumbbells need a range', () => {
    const bench = [['dumbbells'], ['flat_bench', 'adjustable_bench']] as EquipmentId[][];
    expect(supports(bench, HOTEL)).toBe(true);
    expect(supports(bench, kit(['dumbbells']))).toBe(false);
    expect(supports([], NOTHING)).toBe(true);
    expect(supports([['dumbbells']], { equipment: ['dumbbells'], dumbbellRange: null })).toBe(false);
    expect(missingWord(bench, kit(['dumbbells']))).toBe('bench');
    expect(missingWord([['cable_station']], NOTHING)).toBe('cable');
    expect(missingWord(bench, HOTEL)).toBeNull();
  });

  it('a pattern and gear are looked up by plan id or catalog id', () => {
    expect(patternOf(SWAP_DATA, 'barbell-back-squat')).toBe('squat');
    expect(patternOf(SWAP_DATA, 'Pushups')).toBe('horizontal push');
    expect(patternOf(SWAP_DATA, 'static-pigeon-stretch')).toBeNull();
    expect(patternOf(SWAP_DATA, 'made-up')).toBeNull();
    expect(requiresOf(SWAP_DATA, 'Dumbbell_Flyes')).toEqual([['dumbbells'], ['flat_bench', 'adjustable_bench']]);
    expect(requiresOf(SWAP_DATA, '28-method-squat')).toBeNull();
  });
});

describe('swapCandidates', () => {
  it('same pattern, gym can do it, best first, never itself', () => {
    expect(ids('barbell-back-squat', HOTEL)).toEqual(['Dumbbell_Squat', 'Bodyweight_Squat']);
    expect(ids('barbell-back-squat')).not.toContain('barbell-back-squat');
    expect(ids('barbell-back-squat')[0]).toBe('front-squat');
    expect(ids('barbell-back-squat', NOTHING)).toEqual(['Bodyweight_Squat']);
  });

  it('never the same exercise under another id, nor one already in the workout', () => {
    expect(ids('machine-seated-leg-extension')).not.toContain('leg-extension');
    expect(ids('plank', NOTHING, { mode: 'seconds' })).toEqual([]);
    expect(ids('barbell-back-squat', HOTEL, { exclude: ['Dumbbell_Squat'] })).toEqual(['Bodyweight_Squat']);
  });

  it('a hold is only swapped for a hold, reps only for reps: no number is invented', () => {
    expect(ids('spider-plank', NOTHING, { mode: 'seconds' })).toEqual(['elbow-plank']);
    expect(ids('crunch', NOTHING)).not.toContain('elbow-plank');
  });

  it('no pattern, or nothing the gym can do: empty, never another pattern', () => {
    expect(ids('static-pigeon-stretch')).toEqual([]);
    expect(ids('machine-seated-leg-extension', HOTEL)).toEqual([]);
    expect(ids('hip-abductor')).toEqual([]);
  });

  it('every candidate returned is really doable and in the pattern, on any gym', () => {
    for (const gym of [FULL, HOTEL, NOTHING, kit(['resistance_bands', 'pull_up_bar'])]) {
      for (const id of PLAN_IDS) {
        const p = patternOf(SWAP_DATA, id);
        for (const c of swapCandidates(SWAP_DATA, id, gym)) {
          expect(supports(c.requires, gym)).toBe(true);
          expect(p && PATTERN_FILE.patterns[p].candidates.includes(c)).toBeTruthy();
        }
      }
    }
  });

  it('the reason names what is missing, or says it is the same movement', () => {
    const [c] = swapCandidates(SWAP_DATA, 'barbell-back-squat', HOTEL);
    expect(swapReason(SWAP_DATA, 'barbell-back-squat', c!, HOTEL)).toBe('No barbell here · uses dumbbells');
    expect(swapReason(SWAP_DATA, 'barbell-back-squat', c!, FULL)).toBe('Same movement · uses dumbbells');
    const body = swapCandidates(SWAP_DATA, 'barbell-back-squat', NOTHING)[0]!;
    expect(swapReason(SWAP_DATA, 'barbell-back-squat', body, NOTHING)).toBe('No barbell here · just your body');
  });
});

describe('applySwap and revertSwap', () => {
  const start = { exerciseIds: ['a', 'b', 'c'], swaps: [] as SessionSwap[] };

  it('no sets: the replacement takes the place; back again the record is gone', () => {
    const one = applySwap(start, 'b', 'x', false);
    expect(one.exerciseIds).toEqual(['a', 'x', 'c']);
    expect(one.swaps).toEqual([{ slot: 'b', current: 'x' }]);
    const back = applySwap(one, 'x', 'b', false);
    expect(back).toEqual(start);
  });

  it('logged sets: the original keeps its row, the replacement goes right after it', () => {
    const one = applySwap(start, 'b', 'x', true);
    expect(one.exerciseIds).toEqual(['a', 'b', 'x', 'c']);
    expect(one.swaps).toEqual([{ slot: 'b', current: 'x', kept: ['b'] }]);
    const two = applySwap(one, 'x', 'y', true);
    expect(two.exerciseIds).toEqual(['a', 'b', 'x', 'y', 'c']);
    expect(two.swaps).toEqual([{ slot: 'b', current: 'y', kept: ['b', 'x'] }]);
    const home = applySwap(two, 'y', 'b', false);
    expect(home.exerciseIds).toEqual(['a', 'b', 'x', 'c']);
    expect(home.swaps).toEqual([{ slot: 'b', current: 'b', kept: ['x'] }]);
  });

  it('a manual change of an auto swap keeps why; Always is recorded', () => {
    const auto = { exerciseIds: ['x'], swaps: [{ slot: 'b', current: 'x', auto: true, reason: 'no cable here' }] };
    expect(applySwap(auto, 'x', 'y', false, { always: true }).swaps).toEqual([{ slot: 'b', current: 'y', reason: 'no cable here', always: true }]);
  });

  it('revert undoes either case exactly', () => {
    const plain = applySwap(start, 'b', 'x', false);
    expect(revertSwap(plain, 'b', 'x', undefined, false)).toEqual(start);
    const kept = applySwap(start, 'b', 'x', true);
    expect(revertSwap(kept, 'b', 'x', undefined, false)).toEqual(start);
    const second = applySwap(plain, 'x', 'y', false);
    expect(revertSwap(second, 'x', 'y', plain.swaps[0], false)).toEqual(plain);
  });
});

describe('adaptDay (SPEC 7.5)', () => {
  const plan = PLANS.find((p) => p.id === 'five-day-split')!;
  const unique = (d: number) => dayWorkout(plan, d, 0).filter((e, i, a) => a.findIndex((x) => x.exerciseId === e.exerciseId) === i);

  it('a full gym changes nothing, on any day of any plan', () => {
    for (const p of PLANS) p.days.forEach((_, i) => expect(adaptDay(SWAP_DATA, dayWorkout(p, i, 0), FULL).swaps).toEqual([]));
  });

  it('a hotel gym swaps what it lacks, says why, and leaves what it has', () => {
    const day = unique(0);
    const { swaps, exerciseIds } = adaptDay(SWAP_DATA, day, HOTEL);
    const squat = swaps.find((s) => s.slot === 'barbell-back-squat')!;
    expect(squat).toEqual({ slot: 'barbell-back-squat', current: 'Dumbbell_Squat', auto: true, reason: 'no barbell here' });
    expect(exerciseIds).toContain('Dumbbell_Squat');
    expect(exerciseIds).not.toContain('barbell-back-squat');
    expect(exerciseIds).toContain('static-quadricep-stretch');
    expect(swaps.some((s) => s.slot === 'static-quadricep-stretch')).toBe(false);
    expect(new Set(exerciseIds).size).toBe(exerciseIds.length);
  });

  it('nothing fits stays the plan exercise and says so, never a guess', () => {
    const { swaps, exerciseIds } = adaptDay(SWAP_DATA, [{ exerciseId: 'machine-seated-leg-extension' }], HOTEL);
    expect(swaps).toEqual([{ slot: 'machine-seated-leg-extension', current: 'machine-seated-leg-extension', noFit: true, reason: 'no leg extension here' }]);
    expect(exerciseIds).toEqual(['machine-seated-leg-extension']);
  });

  it('gear not known for sure is left alone; a finisher is never touched', () => {
    expect(adaptDay(SWAP_DATA, [{ exerciseId: '28-method-squat' }, { exerciseId: 'finisher-stair-climbing', finisher: true }], NOTHING).swaps).toEqual([]);
  });

  it('two squats in one day never land on the same replacement', () => {
    const { exerciseIds } = adaptDay(SWAP_DATA, [{ exerciseId: 'barbell-back-squat' }, { exerciseId: 'front-squat' }], HOTEL);
    expect(exerciseIds).toEqual(['Dumbbell_Squat', 'Bodyweight_Squat']);
  });

  it('a hold finds a hold or nothing', () => {
    expect(adaptDay(SWAP_DATA, [{ exerciseId: 'hip-abductor', seconds: 30 }], HOTEL).swaps[0]?.noFit).toBe(true);
  });

  it('Always use this wins while the gym can do it, then falls back', () => {
    const always = { 'barbell-back-squat': 'Smith_Machine_Squat' };
    expect(adaptDay(SWAP_DATA, [{ exerciseId: 'barbell-back-squat' }], FULL, always).swaps).toEqual([{ slot: 'barbell-back-squat', current: 'Smith_Machine_Squat', always: true }]);
    expect(adaptDay(SWAP_DATA, [{ exerciseId: 'barbell-back-squat' }], HOTEL, always).swaps[0]).toMatchObject({ current: 'Dumbbell_Squat', auto: true });
  });

  it('the line says it plainly', () => {
    expect(swapLine({ slot: 'a', current: 'b', auto: true, reason: 'no cable here' })).toBe('Swapped: no cable here');
    expect(swapLine({ slot: 'a', current: 'a', noFit: true, reason: 'no cable here' })).toBe('Nothing fits: no cable here. Skip it.');
    expect(swapLine({ slot: 'a', current: 'b' })).toBe('Swapped: your pick today');
    expect(swapLine({ slot: 'a', current: 'b', always: true })).toBe('Swapped: your pick for this plan');
    expect(swapLine({ slot: 'a', current: 'a', kept: ['b'] })).toBeNull();
    expect(swapLine(undefined)).toBeNull();
  });
});

describe('liveEntries and slotProgress', () => {
  const slot: WorkoutEntry = { exerciseId: 'a', name: 'Plan A', note: 'Wide stance', block: 0, kind: 'single', warmup: false, pairIndex: 0, pairSize: 1, sets: 4, reps: [8, 12], restSec: 90, statedRest: 90, setsText: '4 sets × 8 to 12', line: '4 sets × 8 to 12 reps · 90 s rest', amount: '8 to 12 reps' };
  const other: WorkoutEntry = { ...slot, exerciseId: 'b', name: 'Plan B', block: 1, sets: 2, setsText: '2 sets × 8 to 12', line: '2 sets × 8 to 12 reps · 90 s rest' };
  const make = (id: string, block: number): WorkoutEntry => ({ ...slot, exerciseId: id, name: id, block, sets: 3, setsText: '3 sets × 8 to 12', line: '3 sets × 8 to 12 reps' });
  const nameOf = (id: string) => `Name ${id}`;
  const work = (id: string, n: number) => Array.from({ length: n }, () => ({ exerciseId: id, kind: 'work' as const }));
  const base = { planEntries: [slot, other], make, nameOf };

  it('without swaps it is the plain order', () => {
    const rows = liveEntries({ ...base, exerciseIds: ['b', 'a'], sets: [], adjust: { a: 1 } });
    expect(rows.map((r) => [r.exerciseId, r.sets])).toEqual([['b', 2], ['a', 5]]);
  });

  it('a swap with nothing logged: the targets stay, the plan note and name do not', () => {
    const rows = liveEntries({ ...base, exerciseIds: ['x', 'b'], swaps: [{ slot: 'a', current: 'x' }], sets: [] });
    expect(rows[0]).toMatchObject({ exerciseId: 'x', name: 'Name x', sets: 4, reps: [8, 12], restSec: 90, setsText: '4 sets × 8 to 12' });
    expect(rows[0]!.note).toBeUndefined();
  });

  it('logged sets stay under the original; the replacement gets what is left', () => {
    const rows = liveEntries({ ...base, exerciseIds: ['a', 'x', 'b'], swaps: [{ slot: 'a', current: 'x', kept: ['a'] }], sets: work('a', 2) });
    expect(rows.map((r) => [r.exerciseId, r.sets, r.setsText])).toEqual([['a', 2, '2 sets × 8 to 12'], ['x', 2, '2 sets × 8 to 12'], ['b', 2, '2 sets × 8 to 12']]);
    expect(rows[0]!.name).toBe('Plan A');
    expect(rows[0]!.note).toBe('Wide stance');
  });

  it('a kept row with its sets deleted goes and the planned sets come back; warm ups never use one up', () => {
    const rows = liveEntries({ ...base, exerciseIds: ['a', 'x'], swaps: [{ slot: 'a', current: 'x', kept: ['a'] }], sets: [{ exerciseId: 'a', kind: 'warmup' }] });
    expect(rows.map((r) => [r.exerciseId, r.sets])).toEqual([['x', 4]]);
  });

  it('rows added by hand on the replacement count once', () => {
    const rows = liveEntries({ ...base, exerciseIds: ['x', 'b'], swaps: [{ slot: 'a', current: 'x' }], sets: [], adjust: { x: 1 } });
    expect(rows[0]!.sets).toBe(5);
    expect(rows[0]!.setsText).toBe('5 sets × 8 to 12');
  });

  it('each side comes from the replacement, not the original', () => {
    const rows = liveEntries({ ...base, planEntries: [{ ...slot, eachSide: true, amount: '8 to 12 reps each side' }], exerciseIds: ['x', 'y'], swaps: [{ slot: 'a', current: 'x' }], sets: [], eachSideOf: () => false, make });
    expect(rows[0]!.amount).toBe('8 to 12 reps');
    const sided = liveEntries({ ...base, exerciseIds: ['x'], swaps: [{ slot: 'a', current: 'x' }], sets: [], eachSideOf: () => true });
    expect(sided[0]!.amount).toBe('8 to 12 reps each side');
  });

  it('a quick workout swap keeps the quick targets', () => {
    const rows = liveEntries({ planEntries: [], make, nameOf, exerciseIds: ['x'], swaps: [{ slot: 'q', current: 'x' }], sets: [] });
    expect(rows[0]).toMatchObject({ exerciseId: 'x', sets: 3 });
  });

  it('nothing fits is never up next until a set is logged on it', () => {
    const rows = liveEntries({ ...base, exerciseIds: ['a', 'b'], swaps: [{ slot: 'a', current: 'a', noFit: true, reason: 'no cable here' }], sets: [] });
    expect(rows[0]!.noFit).toBe(true);
    expect(firstOpen(rows, {})).toBe('b');
    expect(upNext(rows, {})).toBe('b');
    expect(upNext(rows, { a: 1 })).toBe('a');
  });

  it('progress counts one slot, whatever filled it', () => {
    const swaps = [{ slot: 'a', current: 'x', kept: ['a'] }];
    const p = slotProgress([slot, other], swaps, undefined, [...work('a', 2), ...work('x', 2), ...work('b', 2)]);
    expect(p).toMatchObject({ done: 2, total: 2, logged: 6, planned: 6, complete: true });
    const half = slotProgress([slot, other], swaps, undefined, work('a', 2));
    expect(half).toMatchObject({ done: 0, total: 2, logged: 2, planned: 6 });
    expect(slotProgress([slot], swaps, undefined, work('x', 9)).logged).toBe(4);
  });

  it('a slot nothing fits costs the day nothing, unless it was done anyway', () => {
    const swaps = [{ slot: 'a', current: 'a', noFit: true, reason: 'no cable here' }];
    expect(slotProgress([slot, other], swaps, undefined, work('b', 2))).toMatchObject({ total: 1, done: 1, planned: 2, complete: true });
    expect(slotProgress([slot, other], swaps, undefined, work('a', 1))).toMatchObject({ total: 2, planned: 6, logged: 1 });
  });

  it('with no swaps slotProgress equals the plain count', () => {
    expect(slotProgress([slot, other], undefined, { b: 1 }, [...work('a', 4), ...work('b', 1)])).toMatchObject({ done: 1, total: 2, logged: 5, planned: 7 });
  });

  it('finishRows lists the slots and what filled them, not rows added by hand', () => {
    const rows = finishRows([slot, other], { exerciseIds: ['a', 'x', 'b', 'added'], swaps: [{ slot: 'a', current: 'x', kept: ['a'] }] }, work('a', 1), nameOf);
    expect(rows.map((r) => [r.exerciseId, r.sets])).toEqual([['a', 1], ['x', 3], ['b', 2]]);
  });
});
