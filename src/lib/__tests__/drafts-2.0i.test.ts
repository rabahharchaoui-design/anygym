// PLAN 2.0i: two tabs reach the same draft revision on their own; a clean row adopts what storage holds.
import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from '../drafts';

describe('drafts of two tabs at the same revision', () => {
  it('editing another row never writes a stale value over the other tab\'s pending reps', () => {
    const data = new Map<string, string>();
    const tab = () => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    const a = tab();
    const b = tab();
    const row = (reps: number, rev: number) => ({ id: 'r', load: null, reps, rev });
    const other = (reps: number, rev: number) => ({ id: 'o', load: null, reps, rev });
    saveDraft('s', 'ex@0', row(7, 1), a);
    saveDraft('s', 'ex@1', other(7, 1), a);
    expect(loadDraft('s', 'ex@0', b)?.reps).toBe(7);
    // Both tabs make revision 2 of the same row on their own: A writes 17, then B writes 19.
    saveDraft('s', 'ex@0', row(17, 2), a);
    saveDraft('s', 'ex@0', row(19, 2), b);
    // A edits another row afterwards: its stale 17 must not replace B's 19.
    saveDraft('s', 'ex@1', other(8, 2), a);
    const stored = JSON.parse(data.get('anygym-drafts')!).s as Record<string, { reps: number }>;
    expect(stored['ex@0']!.reps).toBe(19);
    expect(stored['ex@1']!.reps).toBe(8);
    expect(loadDraft('s', 'ex@0', a)?.reps).toBe(19);
  });
});
