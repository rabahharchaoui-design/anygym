import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { compareDup, lowerDup } from '../dup-guard.mjs';

type Dup = { clones: number; percentage: number };
const compare = (now: Dup, base: Dup) => compareDup(now, base) as { failures: string[]; notes: string[] };
const lower = (now: Dup, base: Dup) => lowerDup(now, base) as { baseline: Dup; refused: string[] };
const base = { clones: 50, percentage: 0.8 };

describe('duplicate code guard (PLAN 3.6x)', () => {
  it('the same numbers pass quietly', () => {
    expect(compare({ clones: 50, percentage: 0.8 }, base)).toEqual({ failures: [], notes: [] });
  });

  it('one more clone fails', () => {
    const { failures } = compare({ clones: 51, percentage: 0.8 }, base);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('51');
    expect(failures[0]).toContain('50');
  });

  it('a higher percentage fails', () => {
    expect(compare({ clones: 50, percentage: 0.9 }, base).failures).toHaveLength(1);
  });

  it('anything over the 5 percent ceiling fails even if the baseline allowed it', () => {
    expect(compare({ clones: 10, percentage: 5.5 }, { clones: 10, percentage: 6 }).failures[0]).toContain('5%');
  });

  it('fewer clones or a lower percentage passes and says to lock it in', () => {
    const r = compare({ clones: 40, percentage: 0.5 }, base);
    expect(r.failures).toEqual([]);
    expect(r.notes[0]).toContain('--update');
  });

  it('update lowers each number on its own and never raises', () => {
    expect(lower({ clones: 40, percentage: 0.5 }, base)).toEqual({ baseline: { clones: 40, percentage: 0.5 }, refused: [] });
    const r = lower({ clones: 52, percentage: 0.4 }, base);
    expect(r.refused).toHaveLength(1);
    expect(r.baseline).toEqual({ clones: 50, percentage: 0.4 });
    expect(lower({ clones: 40, percentage: 0.95 }, base).refused).toHaveLength(1);
  });
});
