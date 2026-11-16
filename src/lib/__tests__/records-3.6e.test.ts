// PLAN 3.6e (audit A10): a plate machine whose "one side or both" answer changed never earns a
// record from the same plates counted another way; like is compared with like, or nothing is said.
import { describe, expect, it } from 'vitest';
import { plateMachineLoad } from '../load';
import { recordSets, recordsFor } from '../records';

const machine = (perSide: number[], horns: 1 | 2) => plateMachineLoad(0, perSide, 'lb', undefined, horns)!;
const before = (reps: number, perSide: number[], horns: 1 | 2) => ({ kind: 'work' as const, reps, load: machine(perSide, horns), date: 1 });
const today = (id: string, reps: number, perSide: number[], horns: 1 | 2) => ({ id, kind: 'work' as const, reps, load: machine(perSide, horns) });

describe('A10: one side or both changed', () => {
  it('the same plates, now counted on both sides, are not a record', () => {
    // Earlier "one side": a 45 on the horn × 10, stored 45 lb. Now "both sides": stored 90 lb.
    expect(recordSets([today('a', 10, [45], 2)], [before(10, [45], 1)])).toEqual([]); // was "90 lb × 10, your best yet", "+45 lb"
    expect(recordsFor('m', 'Chest Press', [today('a', 10, [45], 2)], [before(10, [45], 1)])).toEqual([]); // was "heaviest ever, 90 lb"
  });
  it('the other way round says nothing either (nothing alike to compare with)', () => {
    expect(recordSets([today('a', 10, [45, 25], 1)], [before(10, [45], 2)])).toEqual([]);
  });
  it('earlier sets counted the same way still compare, the others are left out', () => {
    const past = [before(10, [45], 1), before(10, [45], 2), before(8, [45, 25], 2)];
    // Both sides today: 2 × 70 = 140 × 10 beats 140 × 8 on reps; the one side 45 is not in it.
    const r = recordSets([today('a', 10, [45, 25], 2)], past);
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toBe('140 lb × 10, your best yet');
    expect(r[0]!.plus).toBe('+2 reps');
    // Not better than the like sets: nothing, even though it beats the one side total.
    expect(recordSets([today('b', 8, [45, 25], 2)], past)).toEqual([]);
  });
  it('the answer changed mid workout: each set compares only with sets counted its way', () => {
    const r = recordSets([today('a', 10, [45], 1), today('b', 10, [45], 2)], [before(10, [45], 1)]);
    expect(r).toEqual([]);
  });
  it('a real record on an unchanged machine is still one', () => {
    const r = recordSets([today('a', 10, [45, 25], 2)], [before(10, [45], 2)]);
    expect(r[0]!.text).toBe('140 lb × 10, your best yet');
    expect(r[0]!.heaviest?.plus).toBe('+50 lb');
  });
});
