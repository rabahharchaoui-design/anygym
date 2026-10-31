// PLAN 2.0e (7): changing reps or the type on a first time row showing "Pick" never invents a weight.
// The rebuild here is the real shape of a barbell's: nothing picked rebuilds as the bare bar.
import { describe, expect, it } from 'vitest';
import type { Load } from '../../db/types';
import { blockedReason, pendingRows, rowDraft, type BuildInput } from '../setTable';

const bare: Load = { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [], barId: 'olympic', collars: 0 };
const input = (draft: BuildInput['draftOf'], certain: Load | null = null): BuildInput => ({
  count: 3,
  logged: [],
  progression: undefined,
  draftOf: draft,
  rebuild: (picked, plates) => (plates.length ? { ...bare, total: 45 + 2 * plates.reduce((a, b) => a + b, 0), perSide: [...plates] } : picked ? { ...picked } : bare),
  carry: () => null,
  certain,
  defaultReps: 8,
  defaultType: 'normal',
});

describe('a row showing "Pick" stays empty until a weight is picked (PLAN 2.0e)', () => {
  it('reproduction: reps changed on it (a draft with no weight) is never the bare bar; ✓ stays blocked', () => {
    const [first] = pendingRows(input(() => null));
    expect(first!.load).toBeNull();
    const draft = { ...rowDraft(first!, 'r1'), reps: 12, own: { reps: true as const } };
    const [row] = pendingRows(input((i) => (i === 0 ? draft : null)));
    expect(row!.load).toBeNull();
    expect(row!.reps).toBe(12);
    expect(blockedReason('barbell', row!)).toBe('Pick a weight');
  });

  it('a type changed back to normal on it (no noTarget mark left) is still no weight', () => {
    const draft = { id: 'r1', load: null, plates: [], type: 'drop' as const, reps: 9 };
    const [row] = pendingRows(input((i) => (i === 0 ? draft : null)));
    expect(row!.load).toBeNull();
    expect(row!.type).toBe('drop');
  });

  it('a pick (plates, or a load) still rebuilds; just you or a hold stays certain', () => {
    const [plated] = pendingRows(input((i) => (i === 0 ? { id: 'r1', load: null, plates: [45], own: { load: true } } : null)));
    expect(plated!.load?.total).toBe(135);
    const me: Load = { kind: 'bodyweight', unit: 'lb', total: 0, added: 0 };
    const [bw] = pendingRows(input((i) => (i === 0 ? { id: 'r1', load: null, reps: 12 } : null), me));
    expect(bw!.load).toEqual(me);
  });
});
