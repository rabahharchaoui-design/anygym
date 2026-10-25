// PLAN 1.7j: the Codex 1025 0635 / 0705 / 0736 findings, each reproduced first (pure parts).
import { describe, expect, it } from 'vitest';
import type { Gym, Load } from '../../db/types';
import { makeGym } from '../../db/gyms';
import { RECORD_CHECKS } from '../backup';
import {
  barbellLoad,
  bodyweightLoad,
  copyLoad,
  dumbbellLoad,
  timedLoad,
  heldChoices,
  isStackPin,
  loadAt,
  nearestLoadable,
  plateMachineLoad,
  singleLoad,
  stackLoad,
  stackValues,
  stepUp,
  validStackStep,
  type LoadSetup,
} from '../load';
import { countsToward, dayWorkout, doneCounts, quickEntry, type WorkoutEntry } from '../planWorkout';
import { planById } from '../../data/plans';
import { progress, type PastSession } from '../progression';
import { pendingRows } from '../setTable';
import { hydrateRest, loadRest, saveRest, startRest } from '../rest';
import { copyLastLoad, isHeldPlate, loadSetupFor, prefillLoad, wheelWeights } from '../../screens/workout/exerciseLoad';

const lbSetup = (over: Partial<LoadSetup> = {}): LoadSetup => ({
  unit: 'lb',
  base: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  collars: 'none',
  dumbbellRange: { min: 5, max: 100, step: 5 },
  stackStep: 5,
  ...over,
});

describe('(3) working set completion is tracked apart from warm ups', () => {
  const lift = quickEntry('bench', 'Bench', 'barbell', 0);
  const warm: WorkoutEntry = { ...quickEntry('jacks', 'Jumping jacks', 'bodyweight', 1), warmup: true };
  it('Codex 0635 #6: three W rows on a normal lift complete nothing; a dedicated warm up block counts its own', () => {
    const sets = [
      { exerciseId: 'bench', kind: 'warmup' as const },
      { exerciseId: 'bench', kind: 'warmup' as const },
      { exerciseId: 'bench', kind: 'warmup' as const },
      { exerciseId: 'jacks', kind: 'warmup' as const },
      { exerciseId: 'bench', kind: 'drop' as const },
    ];
    expect(doneCounts([lift, warm], sets)).toEqual({ bench: 1, jacks: 1 });
    expect(countsToward(lift, 'warmup')).toBe(false);
    expect(countsToward(warm, 'warmup')).toBe(true);
    expect(countsToward(lift, 'work')).toBe(true);
    expect(countsToward(undefined, 'warmup')).toBe(false);
  });

  it('the plan day progress uses the same rule (Finish and the live view agree)', () => {
    const plan = planById('five-day-split')!;
    const entries = dayWorkout(plan, 0, 0);
    const first = entries.find((e) => !e.warmup && !e.finisher)!;
    const sets = Array.from({ length: first.sets }, () => ({ exerciseId: first.exerciseId, kind: 'warmup' as const }));
    expect(doneCounts(entries, sets)[first.exerciseId]).toBeUndefined();
  });

  it('rows after warm ups keep the planned targets in order (workLogged)', () => {
    const target = (reps: number) => ({ load: barbellLoad(45, [45], 'none', 'lb')!, reps });
    const progression = {
      lastTime: null,
      next: { load: null, reps: null, reason: '', kind: 'first_time' as const },
      perSet: [{ target: target(10) }, { target: target(9) }, { target: target(8) }],
    };
    const logged = [
      { reps: 5, load: barbellLoad(45, [], 'none', 'lb')! },
      { reps: 5, load: barbellLoad(45, [], 'none', 'lb')! },
    ];
    const rows = pendingRows({
      count: logged.length + 3,
      logged,
      workLogged: 0,
      progression,
      draftOf: () => null,
      rebuild: (l) => l,
      carry: () => null,
      certain: null,
      defaultType: 'normal',
    });
    expect(rows.map((r) => [r.index, r.reps])).toEqual([
      [2, 10],
      [3, 9],
      [4, 8],
    ]);
  });
});

describe('(6) LAST TIME copies the stored total on today\'s equipment', () => {
  it('Codex 0736 #4: 135 lb Olympic history on a 35 lb bar stays 135 (50 per side), never 125', () => {
    const prev = barbellLoad(45, [45], 'none', 'lb', 'olympic')!;
    const r = copyLoad(prev, 'barbell', lbSetup({ base: 35 }), 'womens');
    expect(r.load).toMatchObject({ total: 135, barWeight: 35, barId: 'womens' });
    expect(r.load!.perSide!.reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('Codex 0736 #4: a 90 lb machine set after the start went from 0 to 50 stays 90, never 140', () => {
    const prev = plateMachineLoad(0, [45], 'lb')!;
    const r = copyLoad(prev, 'plate_machine', lbSetup({ base: 50 }));
    expect(r.load).toMatchObject({ kind: 'plate_machine', total: 90, barWeight: 50 });
  });

  it('keeps the same plates when they still make the total; collars are solved in', () => {
    const prev = barbellLoad(45, [25, 10], 'none', 'lb')!;
    expect(copyLoad(prev, 'barbell', lbSetup())).toEqual({ load: barbellLoad(45, [25, 10], 'none', 'lb')! });
    const kg = barbellLoad(20, [20], 'none', 'kg')!; // 60 kg
    const withCollars = copyLoad(kg, 'barbell', { ...lbSetup(), unit: 'kg', base: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'competition' });
    expect(withCollars.load).toMatchObject({ total: 60, collars: 5 });
  });

  it('refuses, with the reason, when no exact loading exists, the unit differs or the base is unknown', () => {
    const prev = barbellLoad(45, [45, 1.25], 'none', 'lb')!; // 137.5: needs 1.25s
    expect(copyLoad(prev, 'barbell', lbSetup())).toEqual({ load: null, why: 'inexact' });
    expect(copyLoad(barbellLoad(20, [20], 'none', 'kg')!, 'barbell', lbSetup())).toEqual({ load: null, why: 'unit' });
    expect(copyLoad(barbellLoad(45, [45], 'none', 'lb')!, 'barbell', lbSetup({ base: null }))).toEqual({ load: null, why: 'base' });
    expect(copyLoad(stackLoad(50, 'lb'), 'stack', lbSetup({ stackStep: 15 }))).toEqual({ load: null, why: 'inexact' });
    expect(copyLoad(stackLoad(50, 'lb', 10), 'stack', lbSetup())).toEqual({ load: stackLoad(50, 'lb', 10) });
    expect(copyLoad(bodyweightLoad('lb', 25), 'bodyweight', { ...lbSetup(), unit: 'kg' })).toEqual({ load: null, why: 'unit' });
    expect(copyLoad(bodyweightLoad('lb'), 'bodyweight', { ...lbSetup(), unit: 'kg' })).toEqual({ load: bodyweightLoad('kg') });
  });

  it('the screen helper explains a refusal in plain words', () => {
    const gym: Gym = { ...makeGym({ name: 'Club', type: 'full', unit: 'lb' }, 1), bars: { ...makeGym({ name: 'C', type: 'full', unit: 'lb' }, 1).bars, olympic: 45 } };
    const off = { ...gym, plateInventory: gym.plateInventory.map((p) => ({ ...p, enabled: p.weight !== 2.5 && p.weight !== 5 && p.weight !== 1.25 })) };
    const r = copyLastLoad(barbellLoad(45, [2.5], 'none', 'lb')!, 'barbell', off, 'bench', 'Bench Press');
    expect(r.load).toBeNull();
    expect(!r.load && r.why).toBe("50 lb cannot be made exactly with today's equipment. Reps copied.");
  });
});

describe('(7) held plates pick from the enabled plates', () => {
  const kg = makeGym({ name: 'Club', type: 'full', unit: 'kg' }, 1);
  it('Codex 0736 #5: Plate Russian Twist in the default kg gym offers 5 kg, not the dumbbell range', () => {
    expect(isHeldPlate('single', 'Plate Russian Twist')).toBe(true);
    expect(isHeldPlate('single', 'Front and Lateral Plate Raise')).toBe(true);
    expect(isHeldPlate('single', 'Goblet Squat')).toBe(false);
    expect(isHeldPlate('plate_machine', 'Plate Loaded Row')).toBe(false);
    const weights = wheelWeights(kg, 'single', 'Plate Russian Twist');
    expect(weights).toEqual([1.25, 2.5, 5, 10, 15, 20, 25]);
    expect(prefillLoad(singleLoad(5, 'kg'), 'single', kg, 'plate-russian-twist', 'Plate Russian Twist')).toEqual(singleLoad(5, 'kg'));
    expect(prefillLoad(singleLoad(4, 'kg'), 'single', kg, 'plate-russian-twist', 'Plate Russian Twist')).toBeNull();
  });

  it('selection, validation and progression use the same plates: 5 stays 5, the next step is the next plate', () => {
    const s = { unit: 'kg' as const, ...loadSetupFor(kg, 'single', 'plate-russian-twist', 'Plate Russian Twist') };
    expect(heldChoices('single', s)).toContain(5);
    expect(loadAt('single', 5, s)).toEqual(singleLoad(5, 'kg'));
    expect(loadAt('single', 4, s)).toBeNull();
    expect(nearestLoadable('single', 6, s)).toBe(5);
    expect(stepUp('single', 5, s)).toBe(10);
    const history: PastSession[] = [{ date: 1, gymId: kg.id, unit: 'kg', sets: [10, 10, 9].map((reps) => ({ kind: 'work' as const, reps, load: singleLoad(5, 'kg') })) }];
    const p = progress({ exerciseId: 'plate-russian-twist', loadKind: 'single', unit: 'kg', gym: loadSetupFor(kg, 'single', 'plate-russian-twist', 'Plate Russian Twist'), repRange: [10, 12], history });
    expect(p.next.load).toEqual(singleLoad(5, 'kg'));
    const top: PastSession[] = [{ ...history[0]!, sets: [12, 12, 12].map((reps) => ({ kind: 'work' as const, reps, load: singleLoad(5, 'kg') })) }];
    const up = progress({ exerciseId: 'plate-russian-twist', loadKind: 'single', unit: 'kg', gym: loadSetupFor(kg, 'single', 'plate-russian-twist', 'Plate Russian Twist'), repRange: [10, 12], history: top });
    expect(up.next.load).toEqual(singleLoad(10, 'kg'));
  });

  it('a goblet squat still uses the dumbbell range', () => {
    expect(wheelWeights(kg, 'single', 'Goblet Squat')).not.toContain(1.25);
  });
});

describe('(9) weighted bodyweight history across units', () => {
  it('Codex 0635 #4: +25 lb dips, now a kg gym: no target is invented and the row never becomes "just you"', () => {
    const history: PastSession[] = [{ date: 1, gymId: 'g', unit: 'lb', sets: [8, 8, 8].map((reps) => ({ kind: 'work' as const, reps, load: bodyweightLoad('lb', 25) })) }];
    const kgSetup = { base: null, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'none' as const, dumbbellRange: null, stackStep: 2.5 };
    const p = progress({ exerciseId: 'dips', loadKind: 'bodyweight', unit: 'kg', gym: kgSetup, repRange: [6, 10], history });
    expect(p.next.load).toBeNull();
    expect(p.next.kind).toBe('converted');
    expect(p.next.reason).toBe('Last time +25 lb. Pick the added weight in kg');
    const rows = pendingRows({
      count: 3,
      logged: [],
      progression: p,
      draftOf: () => null,
      rebuild: (l) => l,
      carry: () => null,
      certain: bodyweightLoad('kg'),
      defaultType: 'normal',
    });
    expect(rows.map((r) => r.load)).toEqual([null, null, null]);
  });

  it('unweighted history or a first time still gets "just you" without asking', () => {
    const plain: PastSession[] = [{ date: 1, gymId: 'g', unit: 'lb', sets: [{ kind: 'work', reps: 8, load: bodyweightLoad('lb') }] }];
    const kgSetup = { base: null, plates: [], collars: 'none' as const, dumbbellRange: null, stackStep: 2.5 };
    const p = progress({ exerciseId: 'dips', loadKind: 'bodyweight', unit: 'kg', gym: kgSetup, repRange: [6, 10], history: plain });
    const rows = pendingRows({ count: 1, logged: [], progression: p, draftOf: () => null, rebuild: (l) => l, carry: () => null, certain: bodyweightLoad('kg'), defaultType: 'normal' });
    expect(rows[0]!.load).toEqual(bodyweightLoad('kg'));
  });
});

describe('(10) stack settings that would break weight selection', () => {
  const gym = (over: Partial<Gym>) => ({ ...makeGym({ name: 'Club', type: 'full', unit: 'lb' }, 1), ...over });
  it('Codex 0635 #2: stackStep 1e-12 no longer passes; zero, negative and NaN neither', () => {
    for (const bad of [1e-12, 0, -5, Number.NaN, 0.001, 20000]) expect(RECORD_CHECKS.gyms(gym({ stackStep: bad }))).toBe(false);
    expect(RECORD_CHECKS.gyms(gym({ stackStep: 5 }))).toBe(true);
    expect(RECORD_CHECKS.gyms(gym({ stackStep: 2.5 }))).toBe(true);
    expect(RECORD_CHECKS.gyms(gym({ stackStep: 1.25 }))).toBe(true);
  });

  it('per machine overrides are checked too; other answers must be ≥ 0', () => {
    expect(RECORD_CHECKS.gyms(gym({ equipmentWeights: { cable_station: { kind: 'stack_step', value: 1e-12 } } }))).toBe(false);
    expect(RECORD_CHECKS.gyms(gym({ equipmentWeights: { cable_station: { kind: 'stack_step', value: 0 } } }))).toBe(false);
    expect(RECORD_CHECKS.gyms(gym({ equipmentWeights: { leg_press: { kind: 'starting_resistance', value: -10 } } }))).toBe(false);
    expect(RECORD_CHECKS.gyms(gym({ equipmentWeights: { cable_station: { kind: 'stack_step', value: 7.5 }, leg_press: { kind: 'plates_only', value: null } } }))).toBe(true);
  });

  it('reversed dumbbell bounds are rejected', () => {
    expect(RECORD_CHECKS.gyms(gym({ dumbbellRange: { min: 50, max: 5, step: 5 } }))).toBe(false);
  });

  it('the pin list never throws and stays bounded, whatever the step', () => {
    expect(() => stackValues(1e-12, 300)).not.toThrow();
    expect(stackValues(1e-12, 300)).toEqual([]);
    expect(stackValues(0, 300)).toEqual([]);
    expect(stackValues(5, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(stackValues(0.01, 1e9).length).toBeLessThanOrEqual(2000);
    expect(stackValues(5, 20)).toEqual([5, 10, 15, 20]);
    expect(isStackPin(10, 1e-12)).toBe(false);
    expect(validStackStep(2.5)).toBe(true);
  });
});

describe('(11) the rest countdown survives minimize with localStorage full', () => {
  const full = () => ({
    getItem: () => null,
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError');
    },
    removeItem: () => undefined,
  });
  it('Codex 0635 #7: a refused write still keeps the same deadline for the screen that mounts next', () => {
    const kv = full();
    const rest = startRest('w1', 1_000, 90);
    saveRest(rest, kv);
    // The workout screen unmounts (minimize) and mounts again (resume): it reads the rest again.
    expect(loadRest('w1', kv)).toEqual(rest);
    expect(loadRest('w2', kv)).toBeNull();
    // Skip clears it, and it stays cleared.
    saveRest(null, kv);
    expect(loadRest('w1', kv)).toBeNull();
  });

  it('a start with localStorage still refusing takes the IndexedDB copy (hydrateRest)', () => {
    const kv = full();
    const rest = startRest('w1', 5_000, 60);
    hydrateRest(JSON.stringify(rest), kv);
    expect(loadRest('w1', kv)).toEqual(rest);
    hydrateRest(null, kv);
    expect(loadRest('w1', kv)).toBeNull();
  });
});

describe('Load sanity for the copy helper', () => {
  it('bodyweight with an addition in the same unit copies exactly', () => {
    const l: Load = bodyweightLoad('lb', 25);
    expect(copyLoad(l, 'bodyweight', lbSetup())).toEqual({ load: l });
  });

  it('dumbbells and one weight copy only a weight the rack has; holds and other kinds', () => {
    expect(copyLoad(dumbbellLoad(30, 'lb'), 'dumbbell_each', lbSetup())).toEqual({ load: dumbbellLoad(30, 'lb') });
    expect(copyLoad(dumbbellLoad(32, 'lb'), 'dumbbell_each', lbSetup())).toEqual({ load: null, why: 'inexact' });
    expect(copyLoad(singleLoad(50, 'lb'), 'single', lbSetup())).toEqual({ load: singleLoad(50, 'lb') });
    expect(copyLoad(singleLoad(50, 'lb'), 'single', lbSetup({ heldPlates: [45, 25] }))).toEqual({ load: null, why: 'inexact' });
    expect(copyLoad(timedLoad('lb'), 'timed', { ...lbSetup(), unit: 'kg' })).toEqual({ load: timedLoad('kg') });
    expect(copyLoad(singleLoad(50, 'lb'), 'dumbbell_each', lbSetup())).toEqual({ load: null, why: 'kind' });
  });

  it('nearest loadable one weight without held plates, and dumbbells, still use the range', () => {
    expect(nearestLoadable('single', 23, lbSetup())).toBe(25);
    expect(nearestLoadable('dumbbell_each', 23, lbSetup())).toBe(25);
    expect(nearestLoadable('single', 23, lbSetup({ dumbbellRange: null }))).toBeNull();
    expect(nearestLoadable('single', 23, lbSetup({ heldPlates: [] }))).toBeNull();
    expect(heldChoices('stack', lbSetup())).toBeNull();
    expect(heldChoices('dumbbell_each', lbSetup({ dumbbellRange: null }))).toEqual([]);
  });
});
