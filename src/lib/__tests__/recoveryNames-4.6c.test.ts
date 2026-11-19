// PLAN 4.6c (3): the coach's recovery line names muscles the way the exercises that worked them do,
// and only a muscle both yesterday's log and the next plan day prove. A shared drawn shape ("front
// and side delts", the glute shape that is the outer hips too) is never named on its own.
import { describe, expect, it } from 'vitest';
import { primaryWords } from '../../db/coachData';
import { recoveryLine } from '../coach';
import { ownRegionLabel } from '../muscles';

const PRESS = 'Seated_Barbell_Military_Press';
const RAISE = 'Side_Lateral_Raise';
const ROW = 'Seated_Cable_Rows';
const PULLDOWN = 'Close-Grip_Front_Lat_Pulldown';

const line = (yesterday: string[], next: string[]) => recoveryLine({ activeWorkout: false, recovery: { yesterday, next } });

describe("the recovery line's muscle words (PLAN 4.6c 3)", () => {
  it("an exercise's words: its own part for a shared shape, never the shape's double name", () => {
    expect(primaryWords(PRESS)).toContain('front delts');
    expect(primaryWords(RAISE)).toContain('side delts');
    expect(primaryWords(ROW)).toContain('mid back');
    expect(primaryWords(PULLDOWN)).toContain('lats');
    for (const id of [PRESS, RAISE, ROW, PULLDOWN]) {
      expect(primaryWords(id)).not.toContain('front and side delts');
      expect(primaryWords(id)).not.toContain('upper back');
    }
    expect(primaryWords('no-such-exercise')).toEqual([]);
  });

  it('the glute shape is named by what lit it: outer hips are not glutes', () => {
    const abductors = { primary: [{ muscle: 'abductors', label: 'outer hips', regions: ['gluteal' as const] }] };
    const both = { primary: [...abductors.primary, { muscle: 'glutes', label: 'glutes', regions: ['gluteal' as const] }] };
    expect(ownRegionLabel('gluteal', { ...abductors, secondary: [] })).toBe('outer hips');
    expect(ownRegionLabel('gluteal', { ...both, secondary: [] })).toBe('outer hips and glutes');
    expect(ownRegionLabel('chest', { primary: [{ muscle: 'chest', label: 'chest', regions: ['chest'] }], secondary: [] })).toBeNull();
  });

  it('a lateral raise yesterday and an overhead press today share a shape, not a muscle: no line', () => {
    expect(line(primaryWords(RAISE), primaryWords(PRESS))).toBeNull();
    expect(line(primaryWords(ROW), primaryWords(PULLDOWN))).toBeNull();
  });

  it('the same muscle on both days is named by its own word', () => {
    const l = line(primaryWords(PRESS), primaryWords(PRESS));
    expect(l).toMatch(/^You trained front delts/);
    expect(l).not.toMatch(/side/);
  });
});
