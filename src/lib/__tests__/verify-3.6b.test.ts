import { describe, expect, it } from 'vitest';
import { recordSets } from '../records';
import { comparableWeight, sameResistance } from '../load';
const bar = (total: number, unit: 'lb' | 'kg') => ({ kind: 'barbell', unit, total, barWeight: unit === 'kg' ? 20 : 45, perSide: [] }) as never;
describe('verify mixed units', () => {
  it('lb today over kg history', () => {
    const r = recordSets([{ kind: 'work', reps: 5, load: bar(225, 'lb'), id: 'a' } as never], [{ kind: 'work', reps: 5, load: bar(100, 'kg'), date: 1 } as never]);
    console.log('LB>KG', JSON.stringify(r), comparableWeight(bar(100, 'kg'), 'lb'), sameResistance(bar(225, 'lb'), bar(100, 'kg')));
    expect(r.length).toBe(1);
  });
  it('kg today over lb history', () => {
    const r = recordSets([{ kind: 'work', reps: 5, load: bar(105, 'kg'), id: 'a' } as never], [{ kind: 'work', reps: 5, load: bar(225, 'lb'), date: 1 } as never]);
    console.log('KG>LB', JSON.stringify(r));
    expect(r.length).toBe(1);
  });
});
