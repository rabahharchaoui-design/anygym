import { describe, expect, it } from 'vitest';
import { barbellLoad, copyLoad, plateMachineLoad, sleeveOf, type LoadSetup } from '../load';

const kg: LoadSetup = {
  unit: 'kg', base: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'none',
  dumbbellRange: null, stackStep: 2.5, sleeveLength: sleeveOf('womens', 'kg'),
};

describe('SPEC 0, 5.4, PLAN 1.7j and 2.0f: LAST TIME respects today’s physical equipment', () => {
  it('refuses an exact numerical copy beyond the shorter bar’s sleeve and never silently removes lb competition collars', () => {
    const heavy = barbellLoad(20, [25, 25, 25, 25, 25, 25], 'none', 'kg', 'olympic')!;
    const original = structuredClone(heavy);
    expect(heavy.total).toBe(320);
    expect(copyLoad(heavy, 'barbell', { ...kg, base: 15 }, 'womens')).toEqual({ load: null, why: 'inexact' });
    const olympic = copyLoad(heavy, 'barbell', { ...kg, sleeveLength: sleeveOf('olympic', 'kg') }, 'olympic');
    expect(olympic.load).toEqual(heavy);
    expect(heavy).toEqual(original);

    const lb = barbellLoad(45, [45], 'competition', 'lb', 'olympic')!;
    const setup: LoadSetup = { ...kg, unit: 'lb', base: 35, plates: [45, 35, 25, 10, 5, 2.5], sleeveLength: sleeveOf('womens', 'lb') };
    // 5 kg of collars is not a multiple of the pound inventory's 5 lb total increment.
    expect(copyLoad(lb, 'barbell', setup, 'womens')).toEqual({ load: null, why: 'inexact' });
    const copied = copyLoad(lb, 'barbell', { ...setup, collars: 'competition' }, 'womens');
    expect(copied.load).toMatchObject({ unit: 'lb', total: lb.total, barWeight: 35, barId: 'womens', collars: lb.collars });
    expect(copied.load!.perSide!.reduce((sum, w) => sum + w, 0)).toBe(50);
  });

  it('re-solves machine plates against starting resistance and capacity without adding the gym’s competition collars', () => {
    const previous = plateMachineLoad(20, [25, 25, 25, 25, 25, 25], 'kg')!;
    const original = structuredClone(previous);
    // At 70 kg start, 125 kg per horn makes 320 kg and exactly fills the 320 mm sleeve.
    const copied = copyLoad(previous, 'plate_machine', { ...kg, base: 70, collars: 'competition' });
    expect(copied.load).toMatchObject({ kind: 'plate_machine', unit: 'kg', total: 320, barWeight: 70, collars: 0, perSide: [25, 25, 25, 25, 25] });
    // Plates-only would need 160 kg per horn, which cannot fit this sleeve.
    expect(copyLoad(previous, 'plate_machine', { ...kg, base: 0 })).toEqual({ load: null, why: 'inexact' });
    expect(previous).toEqual(original);
  });
});
