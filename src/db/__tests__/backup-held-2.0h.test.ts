// PLAN 2.0h (bughunt 1101 0259 #6, 0159 tests #6): a correction whose journal write failed lives
// only in memory and the localStorage fallback. A backup carries it (id, time, full values), and a
// restore into another database and storage (another phone) puts it back as pending before Try
// again or Finish, so Try again there saves it once.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';
import { logSet, startWorkout } from '../workouts';
import { MUTATION_FALLBACK_KEY, pendingMutations, retryMutations, saveMutation } from '../mutations';
import type { Load, MutationIntent } from '../types';
import { MAX_PENDING_CHANGES, parseBackup, serializeBackup, type Backup } from '../../lib/backup';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};
const kb: Load = { kind: 'single', unit: 'lb', total: 53 };
const edit = (reps: number): MutationIntent => ({ kind: 'edit', setId: 'a', change: { reps, load: kb } });

let a: AnyGymDB;
let b: AnyGymDB;
let n = 0;
beforeEach(async () => {
  a = new AnyGymDB(`anygym-held-a-${n}`);
  b = new AnyGymDB(`anygym-held-b-${n++}`);
  await Promise.all([a.open(), b.open()]);
});
afterEach(async () => {
  await Promise.all([a.delete(), b.delete()]);
});

const failJournal = (d: AnyGymDB) => {
  const put = d.journal.put.bind(d.journal);
  (d.journal as unknown as { put: unknown }).put = () => Promise.reject(new Error('synthetic journal failure'));
  return () => void ((d.journal as unknown as { put: unknown }).put = put);
};

/** Phone A: a workout with set 'a' logged at 10 reps, and a 19 rep correction whose journal write failed. */
async function heldCorrection(phone: ReturnType<typeof fakeStorage>) {
  await a.gyms.add(makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1));
  const s = await startWorkout((await a.gyms.toArray())[0]!.id, a, 1000);
  await logSet({ id: 'a', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, a);
  const fix = failJournal(a);
  await expect(saveMutation(s.id, 'goblet', edit(19), a, 2000, phone)).rejects.toThrow('journal');
  fix();
  const pending = await pendingMutations(s.id, a, phone);
  expect(pending.map((e) => e.mutation)).toEqual([edit(19)]);
  return { s, pending };
}

const parsed = (backup: Backup): Backup => {
  const p = parseBackup(serializeBackup(backup));
  expect(p.ok).toBe(true);
  return (p as { ok: true; backup: Backup }).backup;
};

describe('a backup carries changes held in the mutation fallback (PLAN 2.0h)', () => {
  it('reproduction: export on phone A, Replace on phone B: the same 19 rep correction is pending and Try again saves it once', async () => {
    const phoneA = fakeStorage();
    const { s, pending } = await heldCorrection(phoneA);
    const backup = parsed(await exportBackup(a, 5, phoneA));
    expect(backup.pendingChanges).toEqual(pending);
    expect(backup.tables.sets.find((x) => x.id === 'a')!.reps).toBe(10);

    const phoneB = fakeStorage();
    await restoreReplace(backup, b, phoneB);
    const there = await pendingMutations(s.id, b, phoneB);
    expect(there).toEqual(pending);
    expect(JSON.parse(phoneB.raw.get(MUTATION_FALLBACK_KEY)!)).toEqual(pending);

    let puts = 0;
    const put = b.sets.put.bind(b.sets);
    (b.sets as unknown as { put: unknown }).put = (...x: Parameters<typeof put>) => (puts++, put(...x));
    expect(await retryMutations(s.id, b, phoneB)).toBe(true);
    expect((await b.sets.get('a'))!.reps).toBe(19);
    expect(await pendingMutations(s.id, b, phoneB)).toEqual([]);
    expect(await retryMutations(s.id, b, phoneB)).toBe(true);
    expect(puts).toBe(1);
  });

  it('Merge brings the held change of the workout it adds', async () => {
    const phoneA = fakeStorage();
    const { s, pending } = await heldCorrection(phoneA);
    const backup = parsed(await exportBackup(a, 5, phoneA));
    const phoneB = fakeStorage();
    await restoreMerge(backup, b, phoneB);
    expect(await pendingMutations(s.id, b, phoneB)).toEqual(pending);
    expect(await retryMutations(s.id, b, phoneB)).toBe(true);
    expect((await b.sets.get('a'))!.reps).toBe(19);
  });

  it('a superseded held copy (a later change landed, its own removal failed) is never exported or restored', async () => {
    const phoneA = fakeStorage();
    const { s } = await heldCorrection(phoneA);
    // The later 21 lands, but the fallback refuses the write that would remove the old 19.
    const stuck = { ...phoneA, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
    await saveMutation(s.id, 'goblet', edit(21), a, 3000, stuck);
    expect(JSON.parse(phoneA.raw.get(MUTATION_FALLBACK_KEY)!)).toHaveLength(1);
    const backup = parsed(await exportBackup(a, 5, phoneA));
    expect(backup.pendingChanges).toBeUndefined();
    const phoneB = fakeStorage();
    await restoreReplace(backup, b, phoneB);
    expect(await pendingMutations(s.id, b, phoneB)).toEqual([]);
    expect((await b.sets.get('a'))!.reps).toBe(21);
  });

  it('an old backup without the field restores as before, and Replace clears stale held copies', async () => {
    const phoneA = fakeStorage();
    const { s } = await heldCorrection(phoneA);
    const full = await exportBackup(a, 5, phoneA);
    const { pendingChanges: _drop, ...old } = full;
    const backup = parsed(old as Backup);
    expect(backup.pendingChanges).toBeUndefined();
    const phoneB = fakeStorage();
    phoneB.setItem(MUTATION_FALLBACK_KEY, phoneA.getItem(MUTATION_FALLBACK_KEY)!); // stale copy on B
    expect(await restoreReplace(backup, b, phoneB)).toEqual({ workouts: 1, sets: 1 });
    expect(await pendingMutations(s.id, b, phoneB)).toEqual([]);
    expect(phoneB.raw.has(MUTATION_FALLBACK_KEY)).toBe(false);
    expect((await b.sets.get('a'))!.reps).toBe(10);
  });

  it('malformed held changes are refused', async () => {
    const phoneA = fakeStorage();
    await heldCorrection(phoneA);
    const good = JSON.parse(serializeBackup(await exportBackup(a, 5, phoneA))) as Backup & Record<string, unknown>;
    const e = good.pendingChanges![0]!;
    const bad: unknown[] = [
      'x',
      [{ ...e, id: 'mut:edit:a:1' }],
      [{ ...e, id: `mem:edit:a:${e.at + 1}:1` }],
      [{ ...e, id: `${e.id}x` }],
      [{ ...e, rev: 1 }],
      [{ ...e, key: 'type:a' }],
      [{ ...e, draft: { id: e.id, load: kb } }],
      [{ ...e, draft: { id: 'other', load: null } }],
      [{ ...e, at: 'soon' }],
      [{ ...e, sessionId: 'nope' }],
      [{ ...e, mutation: { kind: 'edit', setId: 'a', change: { reps: 19 } } }],
      [{ ...e, mutation: { ...e.mutation, change: { reps: 19, load: { kind: 'barbell', unit: 'kg', total: 1, perSide: [999] } } } }],
      [{ ...e, id: e.id.replace(':a:', ':zz:'), key: 'edit:zz', draft: { id: e.id.replace(':a:', ':zz:'), load: null }, mutation: { ...e.mutation, setId: 'zz' } }],
      [e, e],
      Array.from({ length: MAX_PENDING_CHANGES + 1 }, (_, i) => ({ ...e, id: `${e.id.slice(0, e.id.lastIndexOf(':'))}:${i + 1}`, draft: { id: `${e.id.slice(0, e.id.lastIndexOf(':'))}:${i + 1}`, load: null } })),
    ];
    for (const pendingChanges of bad) expect(parseBackup(JSON.stringify({ ...good, pendingChanges })).ok, JSON.stringify(pendingChanges).slice(0, 80)).toBe(false);
    // A finished workout's held change is refused too.
    const ended = { ...good, sessions: undefined, tables: { ...good.tables, sessions: good.tables.sessions.map((x) => ({ ...x, endedAt: 9999 })) } };
    expect(parseBackup(JSON.stringify(ended)).ok).toBe(false);
    expect(parseBackup(JSON.stringify(good)).ok).toBe(true);
  });
});
