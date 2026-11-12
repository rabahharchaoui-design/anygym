import { describe, expect, it } from 'vitest';
import { BADGE_FAMILIES, FAMILY_SHAPE, badgeForMoment, badgeLabel, milestoneStuds, numberSize, shapeOf } from '../families';
import { MEDALS, circlePath, ringPoints, roundedPolygon } from '../shapes';

describe('badge families (PLAN 3.6h)', () => {
  it('every family has its own shape, and every shape is drawn', () => {
    const shapes = BADGE_FAMILIES.map(shapeOf);
    expect(new Set(shapes).size).toBe(BADGE_FAMILIES.length);
    expect(FAMILY_SHAPE).toMatchObject({ first_workout: 'round', streak: 'flame', pr: 'hex', milestone: 'seal', first_run: 'diamond', new_city: 'pin', level: 'shield' });
    for (const s of shapes) {
      expect(MEDALS[s].body).toMatch(/^M[\d.\- ]/);
      expect(MEDALS[s].body.endsWith('Z')).toBe(true);
      expect(MEDALS[s].inlay.endsWith('Z')).toBe(true);
    }
  });

  it('milestones carry one stud per step reached', () => {
    expect([9, 10, 24, 25, 50, 99, 100, 250].map(milestoneStuds)).toEqual([0, 1, 1, 2, 3, 3, 4, 4]);
  });

  it('a longer number is drawn smaller, never larger', () => {
    const sizes = ['7', '25', '100', '1000', '12345'].map(numberSize);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('the accessible name says the name, the number and locked', () => {
    expect(badgeLabel({ name: 'First workout' })).toBe('First workout');
    expect(badgeLabel({ name: 'Day streak', value: 7 })).toBe('Day streak, 7');
    expect(badgeLabel({ name: '50 workouts', value: '50', locked: true })).toBe('50 workouts, 50, locked');
  });

  it('a moment wears the right medal', () => {
    expect(badgeForMoment('first_workout')).toBe('first_workout');
    expect(badgeForMoment('lift_record')).toBe('pr');
    expect(badgeForMoment('run_record')).toBe('pr');
    expect(badgeForMoment('level_up')).toBe('level');
    expect(badgeForMoment('city_stamp')).toBe('new_city');
  });
});

describe('medal geometry', () => {
  it('a rounded polygon stays inside its corners and closes', () => {
    const d = roundedPolygon([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
    expect(d).toBe('M0 2Q0 0 2 0L8 0Q10 0 10 2L10 8Q10 10 8 10L2 10Q0 10 0 8Z');
  });

  it('ring points start straight up and alternate radius', () => {
    const p = ringPoints(50, 50, 40, 4, 20);
    expect(p[0]![0]).toBeCloseTo(50);
    expect(p[0]![1]).toBeCloseTo(10);
    expect(p[1]![0]).toBeCloseTo(70);
    expect(circlePath(50, 50, 10)).toBe('M50 40a10 10 0 1 0 0 20a10 10 0 1 0 0 -20Z');
  });
});
