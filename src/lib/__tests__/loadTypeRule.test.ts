import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barForName, buildPlanExercises, loadTypeFromName, planItemLoadType, slugify } from '../loadTypeRule';
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

  it('never calls anything a machine', () => {
    for (const e of PLAN_EXERCISES) {
      expect(e.loadType).not.toBe('plate_machine');
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
    expect(PLAN_EXERCISES).toEqual(buildPlanExercises(plans));
    expect(new Set(PLAN_EXERCISES.map((e) => e.id)).size).toBe(PLAN_EXERCISES.length);
    expect(planExercise('barbell-back-squat')).toEqual({ id: 'barbell-back-squat', name: 'Barbell Back Squat', loadType: 'barbell' });
    expect(planExercise('nope')).toBeUndefined();
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
