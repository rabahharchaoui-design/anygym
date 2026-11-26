// PLAN H2 (2): a chest part ("upper chest" on an incline) reads the same on the tap line, the
// exercises sheet's title and its list, through the one H1 path (tappedRegionLabel).
import { describe, expect, it } from 'vitest';
import overrides from '../../../data/muscle-overrides.json';
import { CATALOG } from '../../data/muscles';
import { pickLine } from '../../components/muscles/MuscleMap';
import { exercisesForRegion } from '../muscleExercises';
import { resolveMuscles, tappedRegionLabel, type MuscleOverrides } from '../muscles';

const O = overrides as MuscleOverrides;
const INCLINE = 'Barbell_Incline_Bench_Press_-_Medium_Grip';
const data = (id: string) => resolveMuscles(CATALOG.find((e) => e.id === id), O)!;
const ids = (label: string | null) => exercisesForRegion('chest', CATALOG, O, new Set(), label).map((e) => e.id);

describe('H2: the chest parts', () => {
  it('an incline press names the chest shape "upper chest", as its tap line says', () => {
    expect(pickLine('chest', data(INCLINE))).toBe('Upper chest · primary');
    expect(tappedRegionLabel('chest', data(INCLINE))).toBe('upper chest');
  });

  it('the upper chest list holds only exercises whose main chest work is named upper chest', () => {
    const list = ids('upper chest');
    expect(list).toContain(INCLINE);
    for (const id of list) expect(data(id).primary.filter((t) => t.regions.includes('chest')).map((t) => t.label), id).toContain('upper chest');
    expect(list.length).toBeLessThan(ids(null).length);
  });

  it('a flat bench keeps the plain chest: no label, the whole chest list', () => {
    expect(tappedRegionLabel('chest', data('Barbell_Bench_Press_-_Medium_Grip'))).toBeNull();
    expect(ids(null)).toContain(INCLINE);
  });
});
