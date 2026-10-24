import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { bodyPartOf, gymSupports, pickerSections } from '../picker';

const full = { equipment: ['barbell_rack', 'cable_station', 'leg_press'] as const, dumbbellRange: { min: 5, max: 100, step: 5 } };
const hotel = { equipment: [] as const, dumbbellRange: { min: 5, max: 50, step: 5 } };

describe('bodyPartOf (names only, never a guess)', () => {
  it.each([
    ['Barbell Back Squat', 'Legs'],
    ['Romanian Deadlift', 'Legs'],
    ['Leg Curl', 'Legs'],
    ['Machine Seated Calf Raise', 'Legs'],
    ['Barbell Bent Over Row', 'Back'],
    ['Lat Machine Wide Grip Pulldown', 'Back'],
    ['Pull Up', 'Back'],
    ['Upright Row', 'Shoulders'],
    ['Rear Delt Fly', 'Shoulders'],
    ['Machine Seated Reverse Fly', 'Shoulders'],
    ['Barbell Incline Bench Press', 'Chest'],
    ['Chest Fly', 'Chest'],
    ['Incline Plate Press', 'Chest'],
    ['Bicep Curl', 'Arms'],
    ['Cable Triceps Pushdown', 'Arms'],
    ['Forearm Finger Roll', 'Arms'],
    ['Crunch', 'Core'],
    ['Plank', 'Core'],
    ['Lying Straight Leg Raise', 'Core'],
    ['Deadlift', 'More'],
    ['Static Quadricep Stretch', 'More'],
    ['30 Second Interval Sprint', 'More'],
  ])('%s → %s', (name, part) => {
    expect(bodyPartOf(name)).toBe(part);
  });
  it('every plan exercise gets a part or More', () => {
    for (const e of PLAN_EXERCISES) expect(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'More']).toContain(bodyPartOf(e.name));
  });
});

describe('gymSupports', () => {
  it('maps load types to equipment', () => {
    expect(gymSupports('barbell', full)).toBe(true);
    expect(gymSupports('barbell', hotel)).toBe(false);
    expect(gymSupports('dumbbell_each', hotel)).toBe(true);
    expect(gymSupports('single', { equipment: [], dumbbellRange: null })).toBe(false);
    expect(gymSupports('stack', hotel)).toBe(false);
    expect(gymSupports('plate_machine', full)).toBe(true);
    expect(gymSupports('bodyweight', hotel)).toBe(true);
    expect(gymSupports('timed', hotel)).toBe(true);
    expect(gymSupports('unknown', full)).toBeUndefined();
  });
});

describe('pickerSections', () => {
  const recent = ['barbell-back-squat', 'not-an-exercise'];
  it('Recent, For your gym, Everything else: each exercise once', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: null, recent, gym: hotel });
    expect(s.map((x) => x.title)).toEqual(['Recent', 'For your gym', 'Everything else']);
    expect(s[0]!.items.map((e) => e.id)).toEqual(['barbell-back-squat']);
    const ids = s.flatMap((x) => x.items.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(PLAN_EXERCISES.length);
    expect(s[1]!.items.every((e) => e.loadType !== 'barbell' && e.loadType !== 'unknown')).toBe(true);
  });
  it('search: one flat list of matches', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: ' back squat ', part: null, recent, gym: hotel });
    expect(s).toEqual([{ title: 'Results', items: [expect.objectContaining({ id: 'barbell-back-squat' })] }]);
    expect(pickerSections(PLAN_EXERCISES, { query: 'zzz', part: null, recent, gym: hotel })).toEqual([]);
  });
  it('a body part narrows every section', () => {
    const s = pickerSections(PLAN_EXERCISES, { query: '', part: 'Core', recent, gym: full });
    for (const x of s) for (const e of x.items) expect(bodyPartOf(e.name)).toBe('Core');
    expect(s.find((x) => x.title === 'Recent')).toBeUndefined();
  });
});
