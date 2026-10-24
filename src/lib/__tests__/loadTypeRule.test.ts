import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barForName, buildPlanExercises, loadTypeFromName, planItemLoadType, slugify, type LoadTypeOverride } from '../loadTypeRule';
import overrides from '../../../data/plan-exercise-overrides.json';
import { planById } from '../../data/plans';
import { dayWorkout } from '../planWorkout';
import { PLAN_EXERCISES, planExercise } from '../../data/planExercises';

describe('loadTypeFromName', () => {
  it.each([
    ['Barbell Back Squat', 'barbell'],
    ['Bent Over Barbell Row', 'barbell'],
    ['Dumbbell Bench Press', 'dumbbell_each'],
    ['Single Arm Dumbbell Row', 'single'],
    ['Dumbbell Single Arm Preacher Curl', 'single'],
    ['One-Arm Dumbbell Row', 'single'],
    ['Single-Arm Kettlebell Press', 'single'],
    ['One Arm Goblet Squat', 'single'],
    ['Unilateral Dumbbell Press', 'single'],
    ['Single Arm Cable Row', 'stack'],
    ['Single Leg Romanian Deadlift', 'unknown'],
    ['Cable Tricep Pushdown', 'stack'],
    ['Static Pigeon Stretch', 'timed'],
    ['Elbow Plank', 'timed'],
    ['Dead Hang Hold', 'timed'],
    ['Wide Grip Pull Up', 'bodyweight'],
    ['Chin Up', 'bodyweight'],
    ['Push Up', 'bodyweight'],
    ['Bench Dip', 'bodyweight'],
    ['Weighted Pull Up', 'unknown'],
    ['Machine Assisted Dip', 'unknown'],
    ['Plate Loaded Push Up', 'unknown'],
    ['Angled Machine Leg Press', 'unknown'],
    ['Machine Seated Leg Extension', 'unknown'],
    ['Smith Machine Upright Row', 'unknown'],
    ['Lat Machine Wide Grip Pulldown', 'unknown'],
    ['Leg Press', 'unknown'],
    ['Deadlift', 'unknown'],
    ['Dipper Curl', 'unknown'], // whole words only
    ['Planking Drill', 'unknown'],
  ])('%s → %s', (name, type) => {
    expect(loadTypeFromName(name)).toBe(type);
  });

  it('the name rule never calls anything a plate machine (only the hand written table does, PLAN 1.7c)', () => {
    const hand = new Set((overrides as LoadTypeOverride[]).map((o) => slugify(o.name)));
    for (const e of PLAN_EXERCISES) {
      if (!hand.has(e.id)) expect(e.loadType).not.toBe('plate_machine');
      expect(loadTypeFromName(e.name)).not.toBe('plate_machine');
    }
  });
});

describe('plan exercise list', () => {
  it('slugs are stable', () => {
    expect(slugify('Band Internal Shoulder Rotation (0 degrees)')).toBe('band-internal-shoulder-rotation-0-degrees');
    expect(slugify('  Barbell Back Squat ')).toBe('barbell-back-squat');
  });

  it('dedupes by id and finds nested exercises', () => {
    const list = buildPlanExercises([{ days: [{ blocks: [{ exercise: 'Plank' }, { items: [{ exercise: 'plank ' }, { exercise: 'Leg Press' }] }] }] }, { exercise: '' }, null, 3]);
    expect(list).toEqual([
      { id: 'leg-press', name: 'Leg Press', loadType: 'unknown' },
      { id: 'plank', name: 'Plank', loadType: 'timed' },
    ]);
  });

  it('the committed data/plan-exercises.json matches the plans (run npm run plan-exercises)', () => {
    const dir = new URL('../../../data/plans/', import.meta.url);
    const plans = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    expect(PLAN_EXERCISES).toEqual(buildPlanExercises(plans, overrides as LoadTypeOverride[]));
    expect(new Set(PLAN_EXERCISES.map((e) => e.id)).size).toBe(PLAN_EXERCISES.length);
    expect(planExercise('barbell-back-squat')).toEqual({ id: 'barbell-back-squat', name: 'Barbell Back Squat', loadType: 'barbell' });
    expect(planExercise('nope')).toBeUndefined();
  });
});

describe('hand written load types (PLAN 1.7c)', () => {
  const plans = [{ exercise: 'Leg Curl' }, { exercise: 'Smith Machine Row' }, { exercise: 'Plank' }];
  it('override wins over the name rule, keeps a bar, rejects bad entries', () => {
    const list = buildPlanExercises(plans, [
      { name: 'leg curl', loadType: 'stack', why: 'pin stack' },
      { name: 'Smith Machine Row', loadType: 'barbell', bar: 'smith', why: 'Smith bar' },
    ]);
    expect(list).toEqual([
      { id: 'leg-curl', name: 'Leg Curl', loadType: 'stack' },
      { id: 'plank', name: 'Plank', loadType: 'timed' },
      { id: 'smith-machine-row', name: 'Smith Machine Row', loadType: 'barbell', bar: 'smith' },
    ]);
    expect(() => buildPlanExercises(plans, [{ name: 'Nope', loadType: 'stack', why: '' }])).toThrow();
    expect(() => buildPlanExercises(plans, [{ name: 'Leg Curl', loadType: 'heavy' as never, why: '' }])).toThrow();
    expect(() => buildPlanExercises(plans, [{ name: 'Leg Curl', loadType: 'stack', bar: 'smith', why: '' }])).toThrow();
  });
  it('every override says why, and only a few plan exercises stay unknown', () => {
    for (const o of overrides as LoadTypeOverride[]) expect(o.why.length).toBeGreaterThan(5);
    const unknown = PLAN_EXERCISES.filter((e) => e.loadType === 'unknown').map((e) => e.name);
    expect(unknown).toEqual(['28 Method Squat', 'Forearm Finger Roll', 'Single Leg Romanian Deadlift', 'Wide Lunge', 'Wrist Twist']);
  });
});

describe('barForName (PLAN 1.10c fix 5: the bar by name)', () => {
  it.each([
    ['EZ Bar Curl', 'ez_curl'],
    ['EZ-Bar Skull Crusher', 'ez_curl'],
    ['ez bar preacher curl', 'ez_curl'],
    ['Trap Bar Deadlift', 'trap'],
    ['Hex Bar Deadlift', 'trap'],
    ['Smith Machine Squat', 'smith'],
    ['Smith Machine Upright Row', 'smith'],
    ['Barbell Back Squat', 'olympic'],
    ['Barbell Bicep Curl', 'olympic'],
    // Whole words only: these are not EZ or trap bars.
    ['Trapezius Shrug', 'olympic'],
    ['Breezy Row', 'olympic'],
  ] as const)('%s → %s', (name, bar) => {
    expect(barForName(name)).toBe(bar);
  });
});

describe('planItemLoadType (PLAN 1.10c fix 12: the plan unit wins)', () => {
  it('explicit reps are never turned into a timed hold: bodyweight reps', () => {
    expect(planItemLoadType('Plank', { reps: 10 })).toBe('bodyweight');
    expect(planItemLoadType('Spider Plank', { reps: { min: 8, max: 12 } })).toBe('bodyweight');
    expect(planItemLoadType('Hamstring Stretch', { reps: 10 })).toBe('bodyweight');
  });

  it('a hold in seconds or a finisher is timed, whatever the name says', () => {
    expect(planItemLoadType('Plank', { seconds: 45 })).toBe('timed');
    expect(planItemLoadType('Barbell Back Squat', { seconds: 30 })).toBe('timed');
    expect(planItemLoadType('Bike', { finisher: true })).toBe('timed');
  });

  it('ambiguous: asks once (unknown) instead of guessing', () => {
    expect(planItemLoadType('Weighted Plank', { reps: 10 })).toBe('unknown');
    expect(planItemLoadType('Plank', { reps: 10, seconds: 30 })).toBe('unknown');
  });

  it('otherwise the name rule, or a given list value', () => {
    expect(planItemLoadType('Barbell Back Squat', { reps: 8 })).toBe('barbell');
    expect(planItemLoadType('Leg Press', { reps: 8 })).toBe('unknown');
    expect(planItemLoadType('Plank', { reps: 10 }, 'timed')).toBe('bodyweight');
    expect(planItemLoadType('Mystery', { reps: 10 }, 'stack')).toBe('stack');
  });

  it('Six Week Volume Builder day 3: Plank and Spider Plank resolve to reps, not seconds', () => {
    const sixWeek = planById('six-week-volume')!;
    const day3 = dayWorkout(sixWeek, 2, 0);
    const planks = day3.filter((e) => /plank/i.test(e.name));
    expect(planks.map((e) => e.name).sort()).toEqual(['Plank', 'Spider Plank']);
    for (const e of planks) {
      expect(e.reps).toBe(10);
      expect(e.seconds).toBeUndefined();
      // The exercise list still says timed by name; the plan's reps win.
      expect(planExercise(e.exerciseId)!.loadType).toBe('timed');
      expect(planItemLoadType(e.name, e, planExercise(e.exerciseId)!.loadType)).toBe('bodyweight');
    }
  });
});
