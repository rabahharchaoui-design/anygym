import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGIONS, type Region } from '../bodyArt';
import type { MapEntry } from '../catalog';
import { exercisesForRegion, exercisesLinkText, planCatalogIds, type NamedCatalogMuscles } from '../muscleExercises';
import { resolveMuscles, type MuscleOverrides } from '../muscles';
import type { Plan } from '../plans';

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')) as T;
const catalog = read<{ exercises: NamedCatalogMuscles[] }>('data/catalog.json').exercises;
const overrides = read<MuscleOverrides>('data/muscle-overrides.json');
const map = read<MapEntry[]>('data/exercise-map.json');
const byId = new Map(catalog.map((e) => [e.id, e]));
const ids = (r: Region, plan?: Set<string>) => exercisesForRegion(r, catalog, overrides, plan).map((e) => e.id);

describe('PLAN 2.2c: catalog exercises for a tapped muscle', () => {
  it.each(REGIONS.map((r) => [r]))('%s: every listed exercise lights it as primary, and every one that does is listed', (region) => {
    const listed = new Set(ids(region));
    for (const e of catalog) {
      const data = resolveMuscles(e, overrides);
      const primaryHere = !!data && data.shading[region] === 'primary' && data.primary.some((t) => t.regions.includes(region));
      expect(listed.has(e.id), `${e.id} on ${region}`).toBe(primaryHere);
    }
  });

  it('chest: the presses, never a row or a squat', () => {
    const chest = ids('chest');
    expect(chest).toContain('Barbell_Bench_Press_-_Medium_Grip');
    expect(chest).toContain('Barbell_Incline_Bench_Press_-_Medium_Grip');
    for (const id of chest) expect(byId.get(id)!.primaryMuscles).toContain('chest');
    expect(chest).not.toContain('Barbell_Squat');
  });

  it('shoulder overrides: front presses and side raises under front delts, rear work under rear delts', () => {
    const front = ids('front-deltoids');
    const rear = ids('back-deltoids');
    for (const id of ['Dumbbell_Shoulder_Press', 'Standing_Military_Press', 'Front_Two-Dumbbell_Raise', 'Side_Lateral_Raise', 'Cable_Seated_Lateral_Raise']) {
      expect(front).toContain(id);
      expect(rear).not.toContain(id);
    }
    for (const id of ['Face_Pull', 'Reverse_Flyes', 'Cable_Rear_Delt_Fly']) {
      expect(rear).toContain(id);
      expect(front).not.toContain(id);
    }
    // Rotator cuff has no shape on the drawing: it is never listed under a delt.
    expect([...front, ...rear]).not.toContain('Internal_Rotation_with_Band');
    // Every listed delt exercise names shoulders as primary in the source.
    for (const id of [...front, ...rear]) expect(byId.get(id)!.primaryMuscles).toContain('shoulders');
  });

  it('a shoulder exercise with no override (or left out) is never listed', () => {
    const lone: NamedCatalogMuscles = { id: 'X', name: 'Mystery press', primaryMuscles: ['shoulders'], secondaryMuscles: [] };
    expect(exercisesForRegion('front-deltoids', [lone], { exercises: {} })).toEqual([]);
    expect(exercisesForRegion('back-deltoids', [lone], { exercises: { X: { shoulders: 'leave out', why: 't' } } })).toEqual([]);
    expect(exercisesForRegion('back-deltoids', [lone], { exercises: { X: { shoulders: 'rear', why: 't' } } }).map((e) => e.id)).toEqual(['X']);
  });

  it('empty: muscles with no catalog exercise give an empty list (no invented data)', () => {
    for (const r of ['neck', 'obliques', 'forearm', 'head', 'knees'] as const) expect(ids(r)).toEqual([]);
    expect(exercisesForRegion('chest', [], overrides)).toEqual([]);
  });

  it('secondary only is not enough: triceps on a bench press is not listed under triceps', () => {
    expect(byId.get('Barbell_Bench_Press_-_Medium_Grip')!.secondaryMuscles).toContain('triceps');
    expect(ids('triceps')).not.toContain('Barbell_Bench_Press_-_Medium_Grip');
  });

  it('"also works" is the secondary line in the map words; none when there are none', () => {
    const incline = exercisesForRegion('chest', catalog, overrides).find((e) => e.id === 'Barbell_Incline_Bench_Press_-_Medium_Grip')!;
    expect(incline.also).toBe('Also works front delts +1');
    const crunch = exercisesForRegion('abs', catalog, overrides).find((e) => e.id === 'Ab_Crunch_Machine')!;
    expect(crunch.also).toBeNull();
  });

  it('sort: the plan first, then A to Z (case blind)', () => {
    const plain = exercisesForRegion('quadriceps', catalog, overrides);
    const names = plain.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    const last = plain[plain.length - 1]!.id;
    const planned = exercisesForRegion('quadriceps', catalog, overrides, new Set([last, 'Not_A_Quad_Exercise']));
    expect(planned[0]!.id).toBe(last);
    expect(planned[0]!.inPlan).toBe(true);
    expect(planned.slice(1).every((e) => !e.inPlan)).toBe(true);
    expect(planned.map((e) => e.id).sort()).toEqual(plain.map((e) => e.id).sort());
  });

  it('plan catalog ids: exact and variant matches count, match none never does', () => {
    const exact = map.find((m) => m.match === 'exact')!;
    const variant = map.find((m) => m.match === 'variant')!;
    const none = map.find((m) => m.match === 'none')!;
    const item = (exerciseId: string) => ({ exerciseId, name: exerciseId });
    const plan = { days: [{ n: 1, name: 'D', blocks: [{ kind: 'single', items: [item(exact.planId), item(variant.planId), item(none.planId), item('unknown')] }] }] } as Pick<Plan, 'days'>;
    expect([...planCatalogIds(plan, map)].sort()).toEqual([exact.catalogId, variant.catalogId].sort());
    expect(planCatalogIds(undefined, map).size).toBe(0);
  });

  it('link words', () => {
    expect(exercisesLinkText(0)).toBe('Exercises');
    expect(exercisesLinkText(1)).toBe('1 exercise');
    expect(exercisesLinkText(12)).toBe('12 exercises');
  });
});
