// PLAN H1 (3): the exercises sheet for a tapped shape lists only exercises whose main muscle there
// carries the exercise's own word; a joined word ("lats and mid back") matches any one of its parts.
import { describe, expect, it } from 'vitest';
import overrides from '../../../data/muscle-overrides.json';
import { CATALOG } from '../../data/muscles';
import { exercisesForRegion } from '../muscleExercises';
import { resolveMuscles, tappedRegionLabel, type MuscleOverrides } from '../muscles';
import type { Region } from '../bodyArt';

const O = overrides as MuscleOverrides;
const data = (id: string) => resolveMuscles(CATALOG.find((e) => e.id === id), O)!;
const ids = (region: Region, label: string | null) => exercisesForRegion(region, CATALOG, O, new Set(), label).map((e) => e.id);
const primaryHere = (id: string, region: Region) => data(id).primary.filter((t) => t.regions.includes(region)).map((t) => t.label);

describe('tappedRegionLabel', () => {
  it("uses the exercise's own word for a shared shape, from the side it works it on", () => {
    expect(tappedRegionLabel('gluteal', data('Thigh_Abductor'))).toBe('outer hips');
    expect(tappedRegionLabel('upper-back', data('Pullups'))).toBe('lats');
    expect(tappedRegionLabel('upper-back', data('Bent_Over_Barbell_Row'))).toBe('mid back');
    // Secondary on the shape: the secondary words, never a primary word from another shape.
    expect(tappedRegionLabel('upper-back', data('Barbell_Deadlift'))).toBe('lats and mid back');
  });

  it('is null for a shape that stands for one muscle', () => {
    expect(tappedRegionLabel('quadriceps', data('Barbell_Squat'))).toBeNull();
  });
});

describe('exercisesForRegion with a label', () => {
  it('outer hips on the glute shape lists only outer hip exercises', () => {
    const list = ids('gluteal', 'outer hips');
    expect(list).toContain('Thigh_Abductor');
    for (const id of list) expect(primaryHere(id, 'gluteal'), id).toContain('outer hips');
    expect(list.length).toBeLessThan(ids('gluteal', null).length);
  });

  it('lats lists pull ups and pulldowns, not rows whose main work there is the mid back', () => {
    const list = ids('upper-back', 'lats');
    expect(list).toContain('Pullups');
    expect(list).not.toContain('Bent_Over_Barbell_Row');
    for (const id of list) expect(primaryHere(id, 'upper-back'), id).toContain('lats');
  });

  it('a joined label matches any one of its words', () => {
    const both = ids('upper-back', 'lats and mid back');
    expect(both).toContain('Pullups');
    expect(both).toContain('Bent_Over_Barbell_Row');
    expect(new Set(both)).toEqual(new Set([...ids('upper-back', 'lats'), ...ids('upper-back', 'mid back')]));
  });
});
