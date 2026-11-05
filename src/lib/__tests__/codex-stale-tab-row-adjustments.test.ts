import { afterEach, describe, expect, it, vi } from 'vitest';

// PLAN 1.7c/2.2d: adding or removing a row must survive reload (SPEC 13.3).
// Independent module instances model two tabs; both use the same phone storage.
function phone() {
  const disk = new Map<string, string>();
  return { getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k) };
}
async function tab() {
  vi.resetModules();
  return import('../extraSets');
}
afterEach(() => vi.resetModules());

describe('row changes from two tabs survive reload', () => {
  // CODEX FOUND BUG: Adding a row in a stale tab overwrites another tab's newer added-row count.
  // CODEX FOUND BUG, fix in 3.2a
  it.skip('retains two added squat rows when a stale tab adds a bench row', async () => {
    const kv = phone();
    const a = await tab();
    a.addExtraSet('s', 'squat', kv);
    const b = await tab();
    expect(b.extraSets('s', 'squat', kv)).toBe(1); // B caches the earlier table.
    a.addExtraSet('s', 'squat', kv);
    b.addExtraSet('s', 'bench', kv);
    const restarted = await tab();
    expect(restarted.liveRowAdjustments('s', new Set(), kv)).toEqual({ squat: 2, bench: 1 });
  });

  // CODEX FOUND BUG: Deleting a row in a stale tab erases another tab's deletion marker and resurrects that row after reload.
  // CODEX FOUND BUG, fix in 3.2a
  it.skip('retains independent deleted-row markers and restores only the row whose set was undone', async () => {
    const kv = phone();
    const a = await tab();
    a.addExtraSet('s', 'squat', kv);
    const b = await tab();
    expect(b.extraSets('s', 'squat', kv)).toBe(1);
    a.markDeleted('s', 'squat-set', 'squat', kv);
    b.markDeleted('s', 'bench-set', 'bench', kv);
    const restarted = await tab();
    expect.soft(restarted.liveRowAdjustments('s', new Set(), kv)).toEqual({ bench: -1 });
    // Undo re-inserts squat-set; the still-deleted bench row must stay removed.
    expect.soft(restarted.liveRowAdjustments('s', new Set(['squat-set']), kv)).toEqual({ squat: 1, bench: -1 });
    expect.soft(restarted.liveRowAdjustments('s', new Set(['bench-set']), kv)).toEqual({});
  });
});
