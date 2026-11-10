import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { emptyBarWeight, loadAt, warmUpLadder, type LoadSetup } from '../load';

// Independent tester check 6 for PLAN 3.8b: the empty bar warm up uses the gym's real bar plus collars.
const kg15: LoadSetup = { unit: 'kg', base: 15, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'competition', sleeveLength: 320, dumbbellRange: null, stackStep: 2.5 };
const lb45: LoadSetup = { unit: 'lb', base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none', sleeveLength: 320, dumbbellRange: null, stackStep: 5 };

describe('verify 3.8b empty bar warm up', () => {
  it("women's 15 kg bar with 5 kg competition collars: 20 kg, every step loadable", () => {
    expect(emptyBarWeight(kg15)).toBe(20);
    for (const work of [40, 60, 100, 140]) {
      const ladder = warmUpLadder('barbell', work, kg15);
      expect(ladder.length).toBeGreaterThan(0);
      expect(ladder[0]).toEqual({ value: 20, reps: 10 });
      for (const s of ladder) expect(loadAt('barbell', s.value, kg15), `${work}: ${s.value}`).not.toBeNull();
    }
  });
  it('45 lb bar without collars: 45 lb, every step loadable', () => {
    expect(emptyBarWeight(lb45)).toBe(45);
    const ladder = warmUpLadder('barbell', 225, lb45);
    expect(ladder[0]).toEqual({ value: 45, reps: 10 });
    for (const s of ladder) expect(loadAt('barbell', s.value, lb45)).not.toBeNull();
    // 3.5b round 4: 20 s so it never times out under a full parallel run.
  }, 20_000);
  it('unknown bar gives no empty bar weight and no ladder', () => {
    expect(emptyBarWeight({ ...lb45, base: null })).toBeNull();
    expect(warmUpLadder('barbell', 225, { ...lb45, base: null })).toEqual([]);
  });
});

describe('verify 3.8b drafts: startup hydrate after a failed IndexedDB commit', () => {
  it('a cold start after a failed IndexedDB commit shows the newer typed 19, not the older stored 10', async () => {
    const disk = new Map<string, string>();
    const ls = { getItem: (k: string) => disk.get(k) ?? null, setItem: (k: string, v: string) => void disk.set(k, v), removeItem: (k: string) => void disk.delete(k) };
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.stubGlobal('localStorage', ls);
    try {
      const drafts = await import('../drafts');
      const { db } = await import('../../db/schema');
      await db.kv.clear();
      const row = (reps: number, rev: number) => ({ id: 'x', load: { kind: 'single', unit: 'lb', total: 53 }, reps, rev }) as import('../drafts').Draft;
      drafts.saveDraft('s', 'ex@0', row(10, 1));
      await vi.waitFor(async () => expect(JSON.parse((await db.kv.get('anygym-drafts'))!.value!).s['ex@0'].reps).toBe(10));
      await new Promise((r) => setTimeout(r, 20));
      const fail = () => { throw new Error('synthetic kv failure'); };
      db.kv.hook('updating', fail);
      drafts.saveDraft('s', 'ex@0', row(19, 2));
      await new Promise((r) => setTimeout(r, 50));
      db.kv.hook('updating').unsubscribe(fail);
      const stale = (await db.kv.get('anygym-drafts'))!.value!;
      expect(JSON.parse(stale).s['ex@0'].reps).toBe(10);
      // Cold start of the app: a fresh module reads localStorage (19), not the older IndexedDB copy.
      vi.resetModules();
      const cold = await import('../drafts');
      expect(cold.loadDraft('s', 'ex@0')?.reps).toBe(19);
      expect(stale).toContain('"reps":10');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
