import { describe, expect, it } from 'vitest';
import { carryRows, repsCarryRows } from '../carryDown';

const row = (index: number, reps = 8, type = 'normal') => ({ index, reps, type });
const rows = [row(0, 8, 'warmup'), row(1), row(2), row(3, 8, 'warmup'), row(4), row(5, 10)];

describe('carry down (SPEC 20.2; 3.6z A17)', () => {
  it('a weight change lands on the row and the working rows below, never a warm up', () => {
    expect(carryRows(rows, rows[1]!, false).map((r) => r.index)).toEqual([1, 2, 4, 5]);
    expect(carryRows(rows, rows[0]!, false).map((r) => r.index)).toEqual([0]);
    expect(carryRows(rows, rows[1]!, true).map((r) => r.index)).toEqual([1]);
  });
  it('a reps change 8 to 12 on set 1 carries to the rows below still at 8, not one at another number or set by hand', () => {
    expect(repsCarryRows(rows, rows[1]!, false, 8, () => false).map((r) => r.index)).toEqual([2, 4]);
    expect(repsCarryRows(rows, rows[1]!, false, 8, (r) => r.index === 4).map((r) => r.index)).toEqual([2]);
  });
  it('a warm up, the test set, or no old number: nothing below changes', () => {
    expect(repsCarryRows(rows, rows[0]!, false, 8, () => false)).toEqual([]);
    expect(repsCarryRows(rows, rows[1]!, true, 8, () => false)).toEqual([]);
    expect(repsCarryRows(rows, rows[1]!, false, undefined, () => false)).toEqual([]);
  });
});
