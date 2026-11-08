import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { finishWorkout, getActiveSession, logSet, setsOf, startWorkout, UnsavedWritesError } from '../workouts';
import { saveDraft, type Draft } from '../../lib/drafts';
import { durableRow } from '../../lib/durable';
import { createLogQueue } from '../../lib/logQueue';
import { rowKey } from '../../lib/setTable';
import { reconcileSession, rowsOf, submitRow } from '../../screens/workout/rowLog';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-submission-evidence-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
function phone(disk = new Map<string, string>()) {
  return { getItem: (k: string) => disk.get(k) ?? null,
    setItem: (k: string, v: string) => void disk.set(k, v),
    removeItem: (k: string) => void disk.delete(k) };
}

// SPEC 0/5.5/13.3; completed PLAN 1.7i/2.0l: revision counters are tab-local.
// Existing equal-revision conflict tests do not exercise a lower-revision input.
describe('submission evidence across independent tab revisions', () => {
  const cases: Array<{ name: string; saved: Load; pending: Load }> = [
    { name: 'a different lb single weight',
      saved: { kind: 'single', unit: 'lb', total: 53 },
      pending: { kind: 'single', unit: 'lb', total: 73 } },
    { name: 'a kg machine with the same total but a different start and plates',
      saved: { kind: 'plate_machine', unit: 'kg', total: 65, barWeight: 25, perSide: [20], collars: 0 },
      pending: { kind: 'plate_machine', unit: 'kg', total: 65, barWeight: 15, perSide: [25], collars: 0 } },
    { name: 'a different bar and collars at the same kg total',
      saved: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, barId: 'olympic', perSide: [20], collars: 0 },
      pending: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 15, barId: 'womens', perSide: [20], collars: 5 } },
  ];
  // CODEX FOUND BUG: Reconciliation erases different loading evidence when another tab committed a higher revision of the same row.
  // Deferred by the orchestrator (Nov 8): two tab variant, see reports/session-3.md; flips to a plain test when fixed.
  it.fails.each(cases)('retains $name after reload instead of treating a higher revision as proof it saved', async (c) => {
    const session = await startWorkout('g', db, 1000);
    const saved = await logSet({ id: 'shared', sessionId: session.id, exerciseId: 'lift', reps: 10, load: c.saved, rev: 5 }, db);
    const disk = new Map<string, string>();
    const draft: Draft = { id: 'shared', load: c.pending, reps: 10, type: 'normal', rev: 1, submitted: 1 };
    saveDraft(session.id, rowKey('lift', 0), draft, phone(disk));
    await reopen();
    const deps = { db, storage: phone(disk), queue: createLogQueue() };
    await reconcileSession(session.id, deps);
    const remaining = rowsOf(session.id, 'lift', deps);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ load: c.pending, reps: 10 });
    expect(remaining[0]!.id).not.toBe(saved.id);
    expect(remaining[0]!.submitted).toBeUndefined();
    expect(await setsOf(session.id, db)).toEqual([saved]);
    const retry = { ...remaining[0]!, submitted: remaining[0]!.rev ?? 0 };
    saveDraft(session.id, rowKey('lift', 0), retry, deps.storage);
    expect(await submitRow(session.id, 'lift', retry, deps)).toBe(true);
    await reopen();
    expect((await setsOf(session.id, db)).map((s) => s.load)).toEqual([c.saved, c.pending]);
  });

  it('consumes matching lower-revision input after reload without replaying an already saved lift', async () => {
    const session = await startWorkout('g', db, 1000);
    const load: Load = { kind: 'stack', unit: 'kg', total: 52.5, stackValue: 50, added: 2.5 };
    const saved = await logSet({ id: 'shared', sessionId: session.id, exerciseId: 'lift', reps: 10, load, rev: 5 }, db);
    const disk = new Map<string, string>();
    saveDraft(session.id, rowKey('lift', 0), { id: 'shared', load, reps: 10, rev: 1, submitted: 1 }, phone(disk));
    await reopen();
    const deps = { db, storage: phone(disk), queue: createLogQueue() };
    await reconcileSession(session.id, deps);
    await reconcileSession(session.id, deps);
    expect(rowsOf(session.id, 'lift', deps)).toEqual([]);
    expect(await setsOf(session.id, db)).toEqual([saved]);
  });

  // CODEX FOUND BUG: Finish succeeds while an unresolved submitted lift exists only in the durable IndexedDB draft mirror.
  // Deferred by the orchestrator (Nov 8): two tab variant, see reports/session-3.md; flips to a plain test when fixed.
  it.fails('refuses Finish when another tab retained a submitted Log only in the durable draft mirror', async () => {
    const session = await startWorkout('g', db, 1000);
    const saved = await logSet({ id: 'saved', sessionId: session.id, exerciseId: 'lift', reps: 10,
      load: { kind: 'single', unit: 'lb', total: 53 } }, db);
    const pending: Draft = { id: 'not-saved', load: { kind: 'single', unit: 'lb', total: 73 }, reps: 19,
      type: 'normal', rev: 1, submitted: 1, op: 'other-tab-log' };
    // State after a journal write failed and localStorage refused the submitted mark.
    // The durable mirror is the surviving evidence; this tab has an older empty cache.
    const value = JSON.stringify({ [session.id]: { [rowKey('lift', 0)]: pending } });
    await db.kv.put(durableRow('anygym-drafts', value));
    await reopen();
    expect(await db.journal.count()).toBe(0);
    const mirror = await db.kv.get('anygym-drafts');
    await expect(finishWorkout(session.id, db, 2000, undefined, undefined, phone())).rejects.toBeInstanceOf(UnsavedWritesError);
    await reopen();
    expect(await getActiveSession(db)).toMatchObject({ id: session.id });
    expect(await setsOf(session.id, db)).toEqual([saved]);
    expect(await db.kv.get('anygym-drafts')).toEqual(mirror);
  });
});
