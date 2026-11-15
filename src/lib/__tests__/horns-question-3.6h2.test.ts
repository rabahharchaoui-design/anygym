// PLAN 3.6h2 (1): the answer to "Does this machine load on one side or both?" reaches every number
// made for that machine, and a set counted the other way is never taken for the same lift.
import { describe, expect, it } from 'vitest';
import { copyLoad, plateMachineLoad, sameHorns, type LoadSetup } from '../load';
import { HORNS_CHANGED, progress, FIRST_TIME, type PastSession } from '../progression';

const lb: LoadSetup = { unit: 'lb', base: 50, plates: [45, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: null, stackStep: 5 };
const kg: LoadSetup = { ...lb, unit: 'kg', base: 20, plates: [20, 10, 5, 2.5, 1.25] };
const both = plateMachineLoad(50, [45], 'lb')!; // 140 lb, counted on both sides (every load before)
const one = plateMachineLoad(50, [45], 'lb', undefined, 1)!; // 95 lb on one side

describe('sameHorns', () => {
  it('a plate machine load matches the setup only when counted on the same number of sides', () => {
    expect(sameHorns(both, lb)).toBe(true);
    expect(sameHorns(both, { horns: 1 })).toBe(false);
    expect(sameHorns(one, { horns: 1 })).toBe(true);
    expect(sameHorns(one, lb)).toBe(false);
    expect(sameHorns({ kind: 'stack' }, { horns: 1 })).toBe(true);
  });
});

describe('copyLoad across an answer change', () => {
  it('refuses to copy a total counted on both sides onto a one side machine, and the other way', () => {
    expect(copyLoad(both, 'plate_machine', { ...lb, horns: 1 })).toEqual({ load: null, why: 'horns' });
    expect(copyLoad(one, 'plate_machine', lb)).toEqual({ load: null, why: 'horns' });
  });
  it('the same counting copies as before: 95 lb one side, 140 lb both, 60 kg one side', () => {
    expect(copyLoad(one, 'plate_machine', { ...lb, horns: 1 }).load).toEqual(one);
    expect(copyLoad(both, 'plate_machine', lb).load).toEqual(both);
    const k = plateMachineLoad(20, [20, 10, 10], 'kg', undefined, 1)!;
    expect(k.total).toBe(60);
    expect(copyLoad(k, 'plate_machine', { ...kg, horns: 1 }).load).toEqual(k);
  });
});

describe('progress across an answer change', () => {
  const history = (load: typeof both): PastSession[] => [{ date: 1, gymId: 'g', unit: 'lb', sets: [10, 10, 10].map((reps) => ({ kind: 'work' as const, reps, load })) }];
  const input = (load: typeof both, horns?: 1) => ({ exerciseId: 'machine-seated-calf-raise', loadKind: 'plate_machine' as const, unit: 'lb' as const, gym: { ...lb, ...(horns ? { horns } : {}) }, repRange: [8, 12] as [number, number], history: history(load) });

  it('Last time shows the 140 lb as logged; the next weight starts over like a first time', () => {
    const p = progress(input(both, 1));
    expect(p.lastTime?.sets.map((s) => s.load.total)).toEqual([140, 140, 140]);
    expect(p.next).toMatchObject({ load: null, kind: 'first_time', reason: HORNS_CHANGED });
    expect(p.perSet.every((r) => r.target?.load == null)).toBe(true);
  });

  it('the same counting goes on as before (both sides, and one side once answered)', () => {
    expect(progress(input(both)).next.kind).not.toBe('first_time');
    const p = progress(input(one, 1));
    expect(p.next.kind).not.toBe('first_time');
    expect(p.next.load).toMatchObject({ horns: 1 });
    expect(FIRST_TIME).not.toBe(HORNS_CHANGED);
  });
});
