import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlanExercises, loadTypeFromName, slugify } from '../loadTypeRule';
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
