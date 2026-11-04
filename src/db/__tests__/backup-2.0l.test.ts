// PLAN 2.0l (5), Codex bughunt 1811 #5: a backup never omits a lift committed during the export.
// The Log commits and clears its pending row between the export's reads; restored on another
// phone, the lift is there exactly once (saved, or a pending row that Retry logs once).
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreReplace } from '../backup';
import { logSet, setsOf, startWorkout } from '../workouts';
import { parseBackup, serializeBackup } from '../../lib/backup';
import { clearDraft, saveDraft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { resetExtraSetsMemory } from '../../lib/extraSets';
import { reconcileSession, retryFailed, rowsOf } from '../../screens/workout/rowLog';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const kb = { kind: 'single' as const, unit: 'lb' as const, total: 53 };

let a: AnyGymDB;
let b: AnyGymDB;
let n = 0;
beforeEach(async () => {
  a = new AnyGymDB(`anygym-2.0l-bk-a-${n}`);
  b = new AnyGymDB(`anygym-2.0l-bk-b-${n++}`);
  await Promise.all([a.open(), b.open()]);
  resetExtraSetsMemory();
});
afterEach(async () => {
  await Promise.all([a.delete(), b.delete()]);
  resetExtraSetsMemory();
});

/** Holds the export's table read (the transaction over every table) until `release`. */
function gateTables(db: AnyGymDB) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let reached!: () => void;
  const atGate = new Promise<void>((r) => (reached = r));
  const orig = db.transaction.bind(db) as (...a: unknown[]) => Promise<unknown>;
  (db as unknown as { transaction: unknown }).transaction = (...args: unknown[]) => {
    const p = orig(...args);
    const tables = args[1];
    if (!Array.isArray(tables) || tables.length < 10) return p;
    return p.then(async (r) => {
      reached();
      await gate;
      return r;
    });
  };
  return { release, atGate };
}

describe('2.0l (5): export never loses a lift that commits during it', () => {
  it('the Log lands and clears its row while the export reads: the restored phone has the lift exactly once', async () => {
    const phoneA = fakeStorage();
    await a.gyms.add(makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1));
    const s = await startWorkout((await a.gyms.toArray())[0]!.id, a, 1000);
    await logSet({ id: 'l1', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, a);
    // The ✓ on the next row: stored with its submitted mark before the write (rowLog.ts).
    saveDraft(s.id, 'goblet@0', { id: 'p1', load: kb, reps: 12, rev: 1, submitted: 1 }, phoneA);
    const { release, atGate } = gateTables(a);
    const exporting = exportBackup(a, 5, phoneA);
    await atGate;
    // Meanwhile the write commits and the row is used up.
    await logSet({ id: 'p1', sessionId: s.id, exerciseId: 'goblet', reps: 12, load: kb, rev: 1 }, a);
    clearDraft(s.id, 'goblet@0', phoneA);
    release();
    const parsed = parseBackup(serializeBackup(await exporting));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const phoneB = fakeStorage();
    await restoreReplace(parsed.backup, b, phoneB);
    const deps = { db: b, storage: phoneB, queue: createLogQueue() };
    await reconcileSession(s.id, deps);
    const saved = (await setsOf(s.id, b)).map((x) => x.id);
    const pending = rowsOf(s.id, 'goblet', deps).map((d) => d?.id);
    // Saved, or pending: never neither, never both.
    expect([...saved, ...pending].filter((id) => id === 'p1')).toHaveLength(1);
    expect(await retryFailed(s.id, deps)).toBe(true);
    expect((await setsOf(s.id, b)).map((x) => [x.id, x.reps])).toEqual([
      ['l1', 10],
      ['p1', 12],
    ]);
  });
});
