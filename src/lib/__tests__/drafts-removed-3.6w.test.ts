// PLAN 3.6w (7), Codex bughunt 1112-1918 #5, one tab, no localStorage: logging a row never puts
// back a draft the user removed (the durable merge must not reinsert a clean cached row). Not
// reproduced in one tab (memory adopts every committed IndexedDB write, removals included); these
// guard it. The variant with a removal made in another tab stays with the deferred two tab work.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../drafts';
import type { Load } from '../../db/types';

const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
const removed: Draft = { id: 'removed', load: lb(73), reps: 19, rev: 1 };
const logged: Draft = { id: 'logged', load: lb(53), reps: 10, rev: 1, submitted: 1, type: 'normal' };

async function modules() {
  const { db } = await import('../../db/schema');
  const drafts = await import('../drafts');
  const rowLog = await import('../../screens/workout/rowLog');
  const { rowKey } = await import('../setTable');
  const { startWorkout } = await import('../../db/workouts');
  return { db, ...drafts, ...rowLog, rowKey, startWorkout };
}
const stored = async (m: Awaited<ReturnType<typeof modules>>, session: string) => JSON.parse((await m.db.kv.get(m.DRAFTS_KEY))?.value ?? '{}')[session] ?? {};

beforeEach(async () => {
  vi.resetModules();
  const { db } = await import('../../db/schema');
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('a removed draft stays removed when another row is logged (one tab, no localStorage)', () => {
  const orders = ['remove, then log', 'log, then remove at once', ...[1, 2, 3, 5, 8].map((n) => `log, then remove after ${n} microtasks`), 'log, then remove on the next task'] as const;
  for (const order of orders) {
    it(order, async () => {
      const m = await modules();
      expect(globalThis.localStorage).toBeUndefined();
      const s = await m.startWorkout('g', m.db, 1000);
      m.saveDraft(s.id, m.rowKey('a', 0), removed);
      m.saveDraft(s.id, m.rowKey('b', 0), logged);
      await vi.waitFor(async () => expect(Object.keys(await stored(m, s.id)).sort()).toEqual([m.rowKey('a', 0), m.rowKey('b', 0)]));
      await new Promise((r) => setTimeout(r, 20));
      let write: Promise<boolean>;
      if (order === 'remove, then log') {
        m.clearDraft(s.id, m.rowKey('a', 0));
        write = m.submitRow(s.id, 'b', logged);
      } else {
        write = m.submitRow(s.id, 'b', logged);
        const n = Number(/after (\d+)/.exec(order)?.[1] ?? 1);
        if (order.endsWith('next task')) await new Promise((r) => setTimeout(r, 0));
        else for (let i = 0; i < n; i++) await Promise.resolve();
        m.clearDraft(s.id, m.rowKey('a', 0));
      }
      expect(await write).toBe(true);
      await new Promise((r) => setTimeout(r, 50));
      expect(await stored(m, s.id)).not.toHaveProperty(m.rowKey('a', 0));
      expect(m.rowsOf(s.id, 'a')).toEqual([]);
    });
  }
});
