// PLAN 3.6w (6), Codex bughunt 1112-1918 #1 and #2, one tab: a Log whose journal write failed (an
// injected IndexedDB failure), with no localStorage, so after a restart the submitted draft lives
// only in the durable mirror. Finish (the screen's path: prepareFinish first) must see it; Discard
// then Undo must bring it back.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '../../lib/drafts';
import type { Load } from '../types';

const lb = (total: number): Load => ({ kind: 'single', unit: 'lb', total });
const pending: Draft = { id: 'not-saved', load: lb(73), reps: 19, type: 'normal', rev: 1, submitted: 1, op: 'op-1' };

async function modules() {
  const schema = await import('../schema');
  const workouts = await import('../workouts');
  const drafts = await import('../../lib/drafts');
  const rowLog = await import('../../screens/workout/rowLog');
  const setTable = await import('../../lib/setTable');
  const durable = await import('../../lib/durable');
  const discard = await import('../../hooks/discardWorkout');
  return { db: schema.db, ...workouts, ...drafts, ...rowLog, ...setTable, ...durable, ...discard };
}

/** The app started again: module state (memory copies) gone; the mirrors put back from IndexedDB. */
async function restart() {
  vi.resetModules();
  const m = await modules();
  await m.restoreMirrors(null, m.db, { [m.DRAFTS_KEY]: (v: string | null) => m.hydrateDrafts(v) });
  return m;
}

/** Logs `draft` (stored submitted first) with the journal write failing; resolves once the mirror holds it. */
async function failedLog(m: Awaited<ReturnType<typeof modules>>, sessionId: string, draft: Draft) {
  m.saveDraft(sessionId, m.rowKey('lift', 0), draft);
  await vi.waitFor(async () => expect(JSON.parse((await m.db.kv.get(m.DRAFTS_KEY))?.value ?? '{}')[sessionId]?.[m.rowKey('lift', 0)]?.id).toBe(draft.id));
  const fail = () => {
    throw new Error('synthetic journal failure');
  };
  m.db.journal.hook('creating', fail);
  try {
    expect(await m.submitRow(sessionId, 'lift', draft)).toBe(false);
  } finally {
    m.db.journal.hook('creating').unsubscribe(fail);
  }
  expect(await m.db.journal.count()).toBe(0);
}

beforeEach(async () => {
  vi.resetModules();
  const { db } = await import('../schema');
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('a failed Log kept only in the durable draft mirror (one tab, no localStorage)', () => {
  it('Finish: the screen path finds it after a restart and refuses (it is a failed row)', async () => {
    let m = await modules();
    expect(globalThis.localStorage).toBeUndefined();
    const s = await m.startWorkout('g', m.db, 1000);
    const saved = await m.logSet({ id: 'saved', sessionId: s.id, exerciseId: 'lift', reps: 10, load: lb(53) }, m.db);
    await failedLog(m, s.id, pending);
    m = await restart();
    const failed = await m.prepareFinish(s.id);
    expect(failed.map((f) => f.draft)).toEqual([pending]);
    expect(await m.setsOf(s.id, m.db)).toEqual([saved]);
  });

  it('Discard then Undo brings the submitted draft and an ordinary pick back', async () => {
    let m = await modules();
    const s = await m.startWorkout('g', m.db, 1000);
    const pick: Draft = { id: 'pick', load: lb(40), reps: 8, rev: 1 };
    m.saveDraft(s.id, m.rowKey('other', 0), pick);
    await failedLog(m, s.id, pending);
    m = await restart();
    const done = await m.discardWorkout(s.id);
    expect(done).not.toBeNull();
    expect(await m.db.sessions.get(s.id)).toBeUndefined();
    expect(await done!.undo()).toBe(true);
    expect(await m.db.sessions.get(s.id)).toMatchObject({ id: s.id });
    expect(m.rowsOf(s.id, 'lift')).toEqual([pending]);
    expect(m.rowsOf(s.id, 'other')).toEqual([pick]);
    expect((await m.failedRows(s.id)).map((f) => f.draft.id)).toEqual(['not-saved']);
    // Durable again: a restart shows them too.
    await vi.waitFor(async () => {
      const r = await restart();
      expect(r.rowsOf(s.id, 'lift')).toEqual([pending]);
    });
  });
});
