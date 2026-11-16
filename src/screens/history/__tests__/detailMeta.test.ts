import { describe, expect, it } from 'vitest';
import type { Session, WorkoutSet } from '../../../db/types';
import { detailMeta, isSureWorkSet } from '../detailMeta';

const start = new Date(2026, 10, 10, 18).getTime();
const live: Session = { id: 's', gymId: 'g', startedAt: start, endedAt: start + 45 * 60_000, imported: false };
const set = (id: string, total: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ id, sessionId: 's', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 10, load: { kind: 'barbell', unit: 'lb', total }, uncertain: false, ...extra });

describe('History detail line (3.6z A12)', () => {
  it('a set the import was not sure of stays out of the total lifted; it still counts as a set', () => {
    const sets = [set('a', 100), set('b', 100), set('c', 500, { uncertain: true })];
    expect(detailMeta(live, sets, 'lb', start)).toBe('Tue, Nov 10 · 3 sets · 45 min · 2,000 lb lifted');
    expect(isSureWorkSet(sets[2]!)).toBe(false);
    expect(isSureWorkSet(sets[0]!)).toBe(true);
    expect(isSureWorkSet(set('w', 45, { kind: 'warmup' }))).toBe(false);
  });
  it('only unsure sets: no total at all, never a number from them', () => {
    expect(detailMeta(live, [set('c', 500, { uncertain: true })], 'lb', start)).toBe('Tue, Nov 10 · 1 set · 45 min');
  });
});

describe('History detail time (3.6z A11)', () => {
  it('a workout left open overnight reads "Over 4 h", never 780 min', () => {
    const overnight: Session = { ...live, endedAt: start + 780 * 60_000 };
    expect(detailMeta(overnight, [set('a', 100)], 'lb', start)).toBe('Tue, Nov 10 · 1 set · Over 4 h · 1,000 lb lifted');
  });
});
