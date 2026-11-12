import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../planExercises';
import { CATALOG_NAMES } from '../importMatch';
import { isMainLift } from '../mainLifts';

const allIds = (): string[] => {
  const ids = new Set(PLAN_EXERCISES.map((e) => e.id));
  const cn = CATALOG_NAMES as unknown as Record<string, string> | Array<{ id: string }>;
  for (const k of Array.isArray(cn) ? cn.map((c) => c.id) : Object.keys(cn)) ids.add(k);
  return [...ids];
};

describe('main lifts for the celebrations (3.6b)', () => {
  it('counts the loaded barbell squat, deadlift, bench, overhead press and row', () => {
    for (const id of ['barbell-back-squat', 'Barbell_Squat', 'front-squat', 'deadlift', 'Barbell_Deadlift', 'Sumo_Deadlift', 'Trap_Bar_Deadlift', 'Barbell_Bench_Press_-_Medium_Grip', 'overhead-press', 'Standing_Military_Press', 'Seated_Barbell_Military_Press', 'Bent_Over_Barbell_Row', 'barbell-bent-over-row']) {
      expect(isMainLift(id), id).toBe(true);
    }
  });
  it('never counts bodyweight, machine, goblet, dumbbell or assistance lifts', () => {
    for (const id of ['Bodyweight_Squat', 'Inverted_Row', 'Hyperextensions_Back_Extensions', 'Goblet_Squat', 'kettlebell-goblet-squat', 'sumo-squat', 'leg-press', 'Leg_Press', 'Smith_Machine_Squat', 'Dumbbell_Squat', 'Dumbbell_Bench_Press', 'Romanian_Deadlift', 'Good_Morning', 'Close-Grip_Barbell_Bench_Press', 'Barbell_Curl', 'Machine_Shoulder_Military_Press', 'not-an-exercise']) {
      expect(isMainLift(id), id).toBe(false);
    }
  });
  it('lists every main lift, so a catalog change shows here', () => {
    expect(allIds().filter(isMainLift).sort()).toMatchInlineSnapshot(`
      [
        "Barbell_Bench_Press_-_Medium_Grip",
        "Barbell_Deadlift",
        "Barbell_Incline_Bench_Press_-_Medium_Grip",
        "Barbell_Squat",
        "Bent_Over_Barbell_Row",
        "Front_Barbell_Squat",
        "Seated_Barbell_Military_Press",
        "Standing_Military_Press",
        "Sumo_Deadlift",
        "Trap_Bar_Deadlift",
        "barbell-back-squat",
        "barbell-bent-over-row",
        "barbell-incline-bench-press",
        "bent-over-barbell-row",
        "deadlift",
        "front-squat",
        "overhead-press",
      ]
    `);
  });
});
