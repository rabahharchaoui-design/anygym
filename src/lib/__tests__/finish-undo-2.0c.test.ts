// PLAN 2.0c group 7 (Codex 1025 1814 #4, 1915 #7, 1945 #9): Finish → Undo on Today puts back the
// pending edits and the added rows exactly (kept with the plan state in Finish's transaction).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { FINISH_PENDING_PREFIX, finishWorkout, logSet, reopenWorkout, reopenWorkoutWithPending, startWorkout } from '../../db/workouts';
import { DRAFTS_KEY, clearSessionDrafts, loadDraft, saveDraft, sessionDrafts, type Draft } from '../drafts';
import { EXTRA_SETS_KEY, addExtraSet, clearExtraSets, extraSets, resetExtraSetsMemory } from '../extraSets';
import { restorePending, snapshotPending } from '../finishPending';
import { REST_KEY, loadRest, saveRest } from '../rest';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-2.0c-undo-${n++}`);
  await db.open();
  resetExtraSetsMemory();
});
afterEach(async () => {
  await db.delete();
});

const kb = { kind: 'single' as const, unit: 'lb' as const, total: 53 };

describe('Finish → Undo restores pending edits and added rows exactly', () => {
  it('reproduction: a 17 rep pending draft and one added row come back after Undo', async () => {
    const s = await startWorkout('g', db, 1000);
    await logSet({ id: 'l1', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    const pending: Draft = { id: 'p1', load: kb, reps: 17, own: { reps: true }, rev: 2 };
    saveDraft(s.id, 'goblet@0', pending);
    addExtraSet(s.id, 'goblet');
    // Finish exactly as the workout screen does it.
    const snap = snapshotPending(s.id);
    expect(snap.drafts).not.toBeNull();
    expect(snap.extra).not.toBeNull();
    expect((await finishWorkout(s.id, db, 2000, snap)).saved).toBe(true);
    clearSessionDrafts(s.id);
    clearExtraSets();
    expect(loadDraft(s.id, 'goblet@0')).toBeNull();
    expect(extraSets(s.id, 'goblet')).toBe(0);
    // Undo on Today.
    const { ok, pending: back } = await reopenWorkoutWithPending(s.id, undefined, db);
    expect(ok).toBe(true);
    restorePending(back!);
    expect(loadDraft(s.id, 'goblet@0')).toEqual(pending);
    expect(sessionDrafts(s.id).size).toBe(1);
    expect(extraSets(s.id, 'goblet')).toBe(1);
    // Durable copies written in the same transaction; the kept snapshot is used up.
    expect(JSON.parse((await db.kv.get(DRAFTS_KEY))!.value!)[s.id]['goblet@0'].reps).toBe(17);
    expect(JSON.parse((await db.kv.get(EXTRA_SETS_KEY))!.value!)).toEqual({ sessionId: s.id, extra: { goblet: 1 } });
    expect(await db.kv.get(FINISH_PENDING_PREFIX + s.id)).toBeUndefined();
  });

  it('nothing pending: nothing kept, Undo still works; only the latest Finish keeps a snapshot', async () => {
    const a = await startWorkout('g', db, 1000);
    await logSet({ id: 'a1', sessionId: a.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    await finishWorkout(a.id, db, 1500, { drafts: '{"x":{}}', extra: null });
    const b = await startWorkout('g', db, 2000);
    await logSet({ id: 'b1', sessionId: b.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    await finishWorkout(b.id, db, 2500, { drafts: null, extra: null });
    expect(await db.kv.where('key').startsWith(FINISH_PENDING_PREFIX).count()).toBe(0);
    expect(await reopenWorkout(b.id, undefined, db)).toBe(true);
  });

  it('a corrupt or empty kept snapshot gives nothing back; Undo still reopens', async () => {
    for (const value of ['{not json', JSON.stringify({ drafts: 5, extra: null })]) {
      const s = await startWorkout('g', db, 1000);
      await logSet({ id: `x-${value.length}`, sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
      await finishWorkout(s.id, db, 1500);
      await db.kv.put({ key: FINISH_PENDING_PREFIX + s.id, value, at: 1 });
      expect(await reopenWorkoutWithPending(s.id, undefined, db)).toEqual({ ok: true, pending: null });
      await db.sessions.update(s.id, { endedAt: 1600 });
    }
    expect(await reopenWorkoutWithPending('missing', undefined, db)).toEqual({ ok: false, pending: null });
  });

  it('reproduction (bughunt 1030 1627 #7): an active rest comes back with its original deadline, never a fresh countdown', async () => {
    const s = await startWorkout('g', db, 1000);
    await logSet({ id: 'r1', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    const rest = { sessionId: s.id, endsAt: 1_000_090_000, totalSec: 90 };
    saveRest(rest);
    const snap = snapshotPending(s.id);
    expect(JSON.parse(snap.rest!)).toEqual(rest);
    await finishWorkout(s.id, db, 2000, snap);
    saveRest(null);
    expect(loadRest(s.id)).toBeNull();
    const { ok, pending } = await reopenWorkoutWithPending(s.id, undefined, db);
    expect(ok).toBe(true);
    // Durable in the Undo's own transaction, then live again.
    expect(JSON.parse((await db.kv.get(REST_KEY))!.value!)).toEqual(rest);
    restorePending(pending!);
    expect(loadRest(s.id)).toEqual(rest);
    saveRest(null);
  });
});
