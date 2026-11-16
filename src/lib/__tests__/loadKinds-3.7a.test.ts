// PLAN 3.7a (3): an exercise from the app's own catalog only offers the load kinds its equipment
// allows ("Machine Bench Press" never offers "Plates on a bar" or "Timed"); custom keeps all.
import { describe, expect, it } from 'vitest';
import catalog from '../../../data/catalog.json';
import patterns from '../../../data/patterns.json';
import planExercises from '../../../data/plan-exercises.json';
import { ALL_LOAD_KINDS, allowedLoadKinds } from '../loadKinds';
import { equipmentOf, loadKindsOf } from '../../data/loadKinds';

type CatalogRow = { id: string; name: string; equipment: string | null };
const CATALOG = (catalog as { exercises: CatalogRow[] }).exercises;

describe('allowedLoadKinds (the rule)', () => {
  it('a machine is a weight stack or plates on the machine, stack first; never bar, dumbbell, bodyweight or timed', () => {
    expect(allowedLoadKinds('machine', 'Machine Bench Press')).toEqual(['stack', 'plate_machine']);
  });
  it('a Smith machine is plates on a bar', () => {
    expect(allowedLoadKinds('machine', 'Smith Machine Bench Press')).toEqual(['barbell']);
  });
  it('one kind where the equipment makes it certain', () => {
    expect(allowedLoadKinds('cable')).toEqual(['stack']);
    expect(allowedLoadKinds('barbell')).toEqual(['barbell']);
    expect(allowedLoadKinds('e-z curl bar')).toEqual(['barbell']);
  });
  it('dumbbells, kettlebells and body only keep their two true answers', () => {
    expect(allowedLoadKinds('dumbbell')).toEqual(['dumbbell_each', 'single']);
    expect(allowedLoadKinds('kettlebells')).toEqual(['single', 'dumbbell_each']);
    expect(allowedLoadKinds('body only')).toEqual(['bodyweight', 'timed']);
  });
  it('unknown, other, bands and custom exercises keep every choice', () => {
    for (const e of [undefined, null, '', 'other', 'bands', 'foam roll']) expect(allowedLoadKinds(e)).toEqual(ALL_LOAD_KINDS);
  });
});

describe('over the whole catalog', () => {
  it('no catalog exercise ends with zero kinds, and every kind is a real one', () => {
    for (const c of CATALOG) {
      const kinds = loadKindsOf(c.id);
      expect(kinds.length, c.name).toBeGreaterThan(0);
      for (const k of kinds) expect(ALL_LOAD_KINDS).toContain(k);
    }
  });
  it('every machine in the catalog offers only the machine answers (or the bar, on a Smith)', () => {
    for (const c of CATALOG.filter((x) => x.equipment === 'machine')) {
      const kinds = loadKindsOf(c.id);
      for (const k of kinds) expect(/smith/i.test(c.name) ? ['barbell'] : ['stack', 'plate_machine'], c.name).toContain(k);
    }
  });
  it('the second exercise of the beginner Day 1: Machine Bench Press offers the stack, then plates on the machine', () => {
    expect(loadKindsOf('Machine_Bench_Press')).toEqual(['stack', 'plate_machine']);
  });
  it('never rules out a load kind the data already knows (plan exercises with an exact catalog match)', () => {
    for (const e of planExercises as Array<{ id: string; name: string; loadType: string }>) {
      if (e.loadType === 'unknown' || !equipmentOf(e.id)) continue;
      expect(loadKindsOf(e.id), e.name).toContain(e.loadType);
    }
  });
  it('never rules out a load kind a swap ladder candidate already knows', () => {
    const ladders = (patterns as unknown as { patterns: Record<string, { candidates: Array<{ id: string; load?: string }> }> }).patterns;
    for (const ladder of Object.values(ladders)) {
      for (const c of ladder.candidates) {
        if (!c.load || c.load === 'unknown') continue;
        expect(loadKindsOf(c.id), c.id).toContain(c.load);
      }
    }
  });
  it('an id the catalog does not know (custom, imported) keeps every choice', () => {
    expect(loadKindsOf('import:my-own-move')).toEqual(ALL_LOAD_KINDS);
    expect(loadKindsOf('custom-xyz')).toEqual(ALL_LOAD_KINDS);
  });
});
