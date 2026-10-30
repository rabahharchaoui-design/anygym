// PLAN 2.0c: the weight picker's confirmation (group 1), failed edits blocking Finish, and Log set
// making every pending row durable (Codex 1025 1945 #6 #8).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeGym } from '../../../db/gyms';
import { AnyGymDB } from '../../../db/schema';
import type { Gym, Load } from '../../../db/types';
import { logSet, setsOf, startWorkout } from '../../../db/workouts';
import { dropMutations, pendingMutations, retryMutations, saveMutation } from '../../../db/mutations';
import { RECORD_CHECKS } from '../../../lib/backup';
import { DRAFTS_KEY, writeDrafts, type Draft } from '../../../lib/drafts';
import { createLogQueue } from '../../../lib/logQueue';
import { rowKey } from '../../../lib/setTable';
import { confirmablePick } from '../exerciseLoad';
import { journalOf, submitRow } from '../rowLog';

const isJournalEntry = (v: unknown) => RECORD_CHECKS.journal(v);

const lbGym = (): Gym => makeGym({ name: 'G', type: 'full', unit: 'lb' }, 1);
const kgOf = (g: Gym): Gym => {
  const k = makeGym({ name: 'G', type: 'full', unit: 'kg' }, 1);
  return { ...g, unit: 'kg', bars: k.bars, plateInventory: k.plateInventory, stackStep: k.stackStep, equipmentWeights: {} };
};
const b65: Load = { kind: 'barbell', unit: 'lb', total: 65, barWeight: 45, barId: 'olympic', perSide: [10], collars: 0 };

describe('acceptance A: an open 65 lb picker never confirms 40 kg after a unit change elsewhere', () => {
  it('reproduction: the lb pick (load or plates only) is refused on the kg gym', () => {
    const g = lbGym();
    const kg = kgOf(g);
    expect(confirmablePick({ load: b65, plates: [10], unit: 'lb' }, 'barbell', g, 'barbell-back-squat', 'Barbell Back Squat')?.load?.total).toBe(65);
    expect(confirmablePick({ load: b65, plates: [10], unit: 'lb' }, 'barbell', kg, 'barbell-back-squat', 'Barbell Back Squat')).toBeNull();
    // The unitless path the bug used: null load with plates.
    expect(confirmablePick({ load: null, plates: [10], unit: 'lb' }, 'barbell', kg, 'barbell-back-squat', 'Barbell Back Squat')).toBeNull();
  });

  it('a fresh kg selection is confirmed exactly; a plate turned off is not', () => {
    const kg = kgOf(lbGym());
    const r = confirmablePick({ load: null, plates: [10], unit: 'kg' }, 'barbell', kg, 'barbell-back-squat', 'Barbell Back Squat');
    expect(r?.load).toMatchObject({ unit: 'kg', total: 40, perSide: [10] });
    expect(r?.unit).toBe('kg');
    const off = { ...kg, plateInventory: kg.plateInventory.map((p) => (p.weight === 10 ? { ...p, enabled: false } : p)) };
    expect(confirmablePick({ load: null, plates: [10], unit: 'kg' }, 'barbell', off, 'barbell-back-squat', 'Barbell Back Squat')).toBeNull();
  });

  it('null base with plates only when the base is genuinely unknown; Smith plates only (0) is known', () => {
    const g = lbGym();
    // An unknown Smith bar is answered first: never confirmed with plates on a guessed bar.
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'barbell', g, 'smith-machine-squat', 'Smith Machine Squat')).toBeNull();
    const smith0 = { ...g, bars: { ...g.bars, smith: 0 } };
    expect(confirmablePick({ load: null, plates: [45, 10], unit: 'lb' }, 'barbell', smith0, 'smith-machine-squat', 'Smith Machine Squat')?.load?.total).toBe(110);
    // Olympic bar weight cleared (truly unknown, no prompt): plates kept, no total made up.
    const noBar = { ...g, bars: { ...g.bars, olympic: null } };
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'barbell', noBar, 'barbell-back-squat', 'Barbell Back Squat')).toEqual({ load: null, plates: [45], unit: 'lb' });
    // Plate machine without a starting weight: plates kept; in the other unit: refused.
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'plate_machine', g, 'leg-press', 'Leg Press')).toEqual({ load: null, plates: [45], unit: 'lb' });
    expect(confirmablePick({ load: null, plates: [45], unit: 'lb' }, 'plate_machine', kgOf(g), 'leg-press', 'Leg Press')).toBeNull();
    // Nothing picked: nothing to confirm.
    expect(confirmablePick({ load: null, plates: [], unit: 'lb' }, 'barbell', noBar, 'barbell-back-squat', 'Barbell Back Squat')).toBeNull();
  });

  it('a 53 lb kettlebell picked in lb is refused once the gym is kg', () => {
    const g = lbGym();
    const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
    expect(confirmablePick({ load: kb, plates: [], unit: 'lb' }, 'single', g, 'kettlebell-goblet-squat', 'Kettlebell Goblet Squat')?.load).toEqual(kb);
    expect(confirmablePick({ load: kb, plates: [], unit: 'lb' }, 'single', kgOf(g), 'kettlebell-goblet-squat', 'Kettlebell Goblet Squat')).toBeNull();
  });
});

describe('failed Edit and set type writes are journaled and survive a restart (Codex 2.0c #3)', () => {
  const name = 'anygym-2.0c-mutations';
  let db: AnyGymDB;
  beforeEach(async () => {
    db = new AnyGymDB(name);
    await db.open();
  });
  afterEach(async () => {
    db.close();
    await new AnyGymDB(name).delete();
  });
  const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
  const kb35: Load = { kind: 'single', unit: 'lb', total: 35 };
  /** Every set write fails (synthetic) until the returned function puts it back. */
  const breakSets = (d: AnyGymDB) => {
    const put = d.sets.put.bind(d.sets);
    (d.sets as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic set write failure'));
    return () => void ((d.sets as unknown as { put: unknown }).put = put);
  };

  it('reproduction: a failed edit and set type change are still pending after a restart; Try again writes their values once', async () => {
    const s = await startWorkout('g', db, 1000);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    const fix = breakSets(db);
    await expect(saveMutation(s.id, 'goblet', { kind: 'edit', setId: 'a', change: { reps: 17, load: kb35 } }, db)).rejects.toThrow('synthetic');
    await expect(saveMutation(s.id, 'goblet', { kind: 'type', setId: 'a', setKind: 'warmup', failure: false }, db)).rejects.toThrow('synthetic');
    fix();
    // Restart: a new connection, nothing in memory.
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    const pending = await pendingMutations(s.id, db);
    expect(pending.map((j) => j.mutation)).toEqual([
      { kind: 'edit', setId: 'a', change: { reps: 17, load: kb35 } },
      { kind: 'type', setId: 'a', setKind: 'warmup', failure: false },
    ]);
    // They are not Log set rows (never adopted as drafts).
    expect(await journalOf(s.id, db)).toEqual([]);
    expect(await retryMutations(s.id, db)).toBe(true);
    expect(await pendingMutations(s.id, db)).toEqual([]);
    const [set] = await setsOf(s.id, db);
    expect([set!.reps, set!.load!.total, set!.kind]).toEqual([17, 35, 'warmup']);
  });

  it('removed only on success or an explicit discard; a retry that fails again keeps it', async () => {
    const s = await startWorkout('g', db, 1000);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    const fix = breakSets(db);
    await saveMutation(s.id, 'goblet', { kind: 'edit', setId: 'a', change: { reps: 17, load: kb } }, db).catch(() => undefined);
    expect(await retryMutations(s.id, db)).toBe(false);
    expect(await pendingMutations(s.id, db)).toHaveLength(1);
    fix();
    await dropMutations(s.id, db);
    expect(await pendingMutations(s.id, db)).toEqual([]);
    expect((await setsOf(s.id, db))[0]!.reps).toBe(10);
    // A change that lands leaves nothing behind; a newer change of the same set replaces the older.
    await saveMutation(s.id, 'goblet', { kind: 'edit', setId: 'a', change: { reps: 12, load: kb } }, db);
    expect(await db.journal.count()).toBe(0);
  });

  it('nothing is written when the journal write itself fails; a deleted set needs nothing any more', async () => {
    const s = await startWorkout('g', db, 1000);
    await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, db);
    const put = db.journal.put.bind(db.journal);
    (db.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic journal failure'));
    await expect(saveMutation(s.id, 'goblet', { kind: 'edit', setId: 'a', change: { reps: 17, load: kb } }, db)).rejects.toThrow('journal');
    (db.journal as unknown as { put: unknown }).put = put;
    expect((await setsOf(s.id, db))[0]!.reps).toBe(10);
    await db.journal.put({ id: 'mut:edit:gone', sessionId: s.id, exerciseId: 'goblet', key: 'edit:gone', rev: 0, draft: { id: 'mut:edit:gone', load: null }, at: 1, mutation: { kind: 'edit', setId: 'gone', change: { reps: 1, load: kb } } });
    expect(await retryMutations(s.id, db)).toBe(true);
  });

  it('backup: a pending change validates; a mismatched id does not', () => {
    const j = { id: 'mut:type:a', sessionId: 's', exerciseId: 'goblet', key: 'type:a', rev: 0, draft: { id: 'mut:type:a', load: null }, at: 1, mutation: { kind: 'type', setId: 'a', setKind: 'drop', failure: false } };
    expect(isJournalEntry(j)).toBe(true);
    expect(isJournalEntry({ ...j, id: 'mut:type:b', draft: { id: 'mut:type:b', load: null } })).toBe(false);
    expect(isJournalEntry({ ...j, mutation: { kind: 'edit', setId: 'a', change: { reps: 1 } } })).toBe(false);
  });
});

describe('logging a later row makes every pending row durable first (Codex 1025 1945 #8)', () => {
  let db: AnyGymDB;
  let n = 0;
  beforeEach(async () => {
    db = new AnyGymDB(`anygym-2.0c-rows-${n++}`);
    await db.open();
  });
  afterEach(async () => {
    await db.delete();
  });

  const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
  const drafts = (): Map<string, Draft> =>
    new Map<string, Draft>([
      [rowKey('squat', 0), { id: 'r7', load: kb, reps: 7 }],
      [rowKey('squat', 1), { id: 'r8', load: kb, reps: 8 }],
      [rowKey('squat', 2), { id: 'r19', load: kb, reps: 19, submitted: 0, rev: 0 }],
    ]);

  it('reproduction: rows 7 and 8 are in IndexedDB with the journal before row 19 is written', async () => {
    const s = await startWorkout('g', db, 1000);
    const d = drafts();
    writeDrafts(s.id, d, null);
    const ok = await submitRow(s.id, 'squat', d.get(rowKey('squat', 2))!, { db, storage: null, queue: createLogQueue() });
    expect(ok).toBe(true);
    const row = (await db.kv.get(DRAFTS_KEY))!;
    const blob = JSON.parse(row.value!) as Record<string, Record<string, Draft>>;
    expect(Object.values(blob[s.id]!).map((x) => x.reps).sort((a, b) => a! - b!)).toEqual([7, 8, 19]);
    expect((await setsOf(s.id, db)).map((x) => x.reps)).toEqual([19]);
  });

  it('when that durable write fails, Log is not accepted: no journal, no set', async () => {
    const s = await startWorkout('g', db, 1000);
    const d = drafts();
    writeDrafts(s.id, d, null);
    const put = db.kv.put.bind(db.kv);
    (db.kv as unknown as { put: typeof put }).put = (() => Promise.reject(new Error('synthetic kv failure'))) as never;
    const ok = await submitRow(s.id, 'squat', d.get(rowKey('squat', 2))!, { db, storage: null, queue: createLogQueue() });
    (db.kv as unknown as { put: typeof put }).put = put;
    expect(ok).toBe(false);
    expect(await db.journal.count()).toBe(0);
    expect(await setsOf(s.id, db)).toEqual([]);
  });
});
