import { describe, expect, it } from 'vitest';
import type { Load } from '../../db/types';
import { barbellLoad, collarsOf, collarsSettingOf, formatMathLine, kgToLb, otherOf, plateMachineLoad, sumLoad } from '../load';

// PLAN 1.7f: a set keeps the collars it was lifted with, whatever the gym setting is today.

const set65: Load = { kind: 'barbell', unit: 'kg', total: 65, barWeight: 20, perSide: [20], collars: 5 };
const legacy65: Load = { kind: 'barbell', unit: 'kg', total: 65, barWeight: 20, perSide: [20] };

/** What EditSetSheet does: the diagram and every rebuild use the set's own collars. */
const editTotal = (load: Load, perSide: readonly number[]) => sumLoad({ bar: load.barWeight!, perSide, collars: collarsSettingOf(load), unit: load.unit }).total;
const editRebuild = (load: Load, perSide: readonly number[]) => barbellLoad(load.barWeight!, perSide, collarsSettingOf(load), load.unit);

describe('collars on stored loads', () => {
  it('new loads store their collar weight', () => {
    expect(barbellLoad(20, [20], 'competition', 'kg')).toEqual(set65);
    expect(barbellLoad(20, [20], 'none', 'kg')!.collars).toBe(0);
    expect(barbellLoad(45, [45], 'competition', 'lb')!.collars).toBe(kgToLb(5));
    expect(plateMachineLoad(0, [45], 'lb')!.collars).toBe(0);
  });

  it('legacy loads recover it from total − bar − 2 × plates when it is a real collar value', () => {
    expect(collarsOf(legacy65)).toBe(5);
    expect(collarsOf({ ...legacy65, total: 60 })).toBe(0);
    expect(collarsOf({ ...legacy65, total: 62 })).toBe(0); // 2 kg is no collar: counts as 0 collars, 2 other
    expect(collarsOf({ ...legacy65, total: 70 })).toBe(0);
    const lb = barbellLoad(45, [45, 25], 'competition', 'lb')!;
    expect(collarsOf({ ...lb, collars: undefined })).toBeCloseTo(kgToLb(5), 9);
    expect(collarsOf({ kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45] })).toBe(0);
    expect(collarsOf({ kind: 'barbell', unit: 'lb', total: 135 })).toBe(0); // no breakdown
    expect(collarsOf({ kind: 'dumbbell_each', unit: 'lb', total: 60 })).toBe(0);
    expect(collarsSettingOf(legacy65)).toBe('competition');
    expect(collarsSettingOf({ ...legacy65, total: 60 })).toBe('none');
  });

  it('the 65 kg set (20 bar, 20 per side, 5 collars) shows 65, stored or legacy, in a gym with no collars', () => {
    for (const load of [set65, legacy65]) {
      expect(editTotal(load, load.perSide!)).toBe(65);
      expect(formatMathLine(load.barWeight!, load.perSide!, collarsSettingOf(load), 'kg')).toBe('20 bar + 2 × 20 + 5 collars = 65 kg');
    }
  });

  it('a reps only Save keeps the load as it was', () => {
    // EditSetSheet saves the set's own load untouched when the plates were not changed.
    for (const load of [set65, legacy65]) expect(editRebuild(load, load.perSide!)!.total).toBe(65);
  });

  it('a plate add and remove round trip comes back to 65', () => {
    for (const load of [set65, legacy65]) {
      const added = editRebuild(load, [20, 2.5])!;
      expect(added.total).toBe(70);
      const back = editRebuild(added, [20])!;
      expect(back).toEqual(set65);
    }
  });
});

describe('a stored total with a gap that is no collar value (PLAN 1.7f)', () => {
  const legacy63: Load = { kind: 'barbell', unit: 'kg', total: 63, barWeight: 20, perSide: [20] };
  const other = (load: Load, perSide: readonly number[]) =>
    sumLoad({ bar: load.barWeight!, perSide, collars: collarsSettingOf(load), unit: load.unit, other: otherOf(load) }).total;

  it('keeps the stored 63 and is honest about the gap', () => {
    expect(collarsOf(legacy63)).toBe(0);
    expect(otherOf(legacy63)).toBe(3);
    expect(other(legacy63, [20])).toBe(63);
    expect(formatMathLine(20, [20], 'none', 'kg', 'bar', 3)).toBe('20 bar + 2 × 20 + 3 other = 63 kg');
    expect(formatMathLine(20, [20], 'none', 'kg', 'bar', -2)).toBe('20 bar + 2 × 20 − 2 other = 58 kg');
    expect(formatMathLine(0, [], 'none', 'kg', 'bar', 1.5)).toBe('0 bar + 1.5 other = 1.5 kg');
    expect(otherOf({ ...legacy63, total: 58 })).toBe(-2);
  });

  it('is 0 for every load the app builds and for loads without a breakdown', () => {
    expect(otherOf(set65)).toBe(0);
    expect(otherOf(legacy65)).toBe(0);
    expect(otherOf(barbellLoad(45, [45, 25], 'competition', 'lb')!)).toBe(0);
    expect(otherOf({ ...barbellLoad(45, [45, 25], 'competition', 'lb')!, collars: undefined })).toBe(0);
    expect(otherOf({ kind: 'stack', unit: 'lb', total: 100, stackValue: 100 })).toBe(0);
  });

  it('a reps only Save keeps 63; changing plates rebuilds from the diagram', () => {
    // EditSetSheet saves the stored load untouched until the plates change.
    expect(legacy63.total).toBe(63);
    expect(barbellLoad(20, [20, 2.5], collarsSettingOf(legacy63), 'kg')!.total).toBe(65);
  });
});
