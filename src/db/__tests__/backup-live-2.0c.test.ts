// bughunt 1030 1627 #3 (PLAN 2.0c): a backup made mid workout carries the running rest (its
// deadline as it is) and the "+ Add set" counts beside the drafts; restored into a separate
// database and storage (another phone), both come back exactly. Replace clears stale ones.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';
import { logSet, startWorkout } from '../workouts';
import { parseBackup, serializeBackup } from '../../lib/backup';
import { loadDraft, saveDraft } from '../../lib/drafts';
import { EXTRA_SETS_KEY, addExtraSet, extraSets, resetExtraSetsMemory } from '../../lib/extraSets';
import { REST_KEY, loadRest, saveRest } from '../../lib/rest';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};
const kb = { kind: 'single' as const, unit: 'lb' as const, total: 53 };

let a: AnyGymDB;
let b: AnyGymDB;
let n = 0;
beforeEach(async () => {
  a = new AnyGymDB(`anygym-live-a-${n}`);
  b = new AnyGymDB(`anygym-live-b-${n++}`);
  await Promise.all([a.open(), b.open()]);
  resetExtraSetsMemory();
});
afterEach(async () => {
  await Promise.all([a.delete(), b.delete()]);
  resetExtraSetsMemory();
});

async function midWorkout(phone: ReturnType<typeof fakeStorage>) {
  await a.gyms.add(makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1));
  const s = await startWorkout((await a.gyms.toArray())[0]!.id, a, 1000);
  await logSet({ id: 'l1', sessionId: s.id, exerciseId: 'goblet', reps: 10, load: kb }, a);
  saveDraft(s.id, 'goblet@0', { id: 'p1', load: kb, reps: 17 }, phone);
  addExtraSet(s.id, 'goblet', phone);
  const rest = { sessionId: s.id, endsAt: 1_000_090_000, totalSec: 90 };
  saveRest(rest, phone);
  return { s, rest };
}

describe('backup carries the running rest and added rows', () => {
  it('reproduction: Replace on another phone gives back the 17 rep draft, 1 added row and the same rest deadline', async () => {
    const phoneA = fakeStorage();
    const { s, rest } = await midWorkout(phoneA);
    const text = serializeBackup(await exportBackup(a, 5, phoneA));
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.rest).toEqual(rest);
    expect(parsed.backup.extraSets).toEqual({ sessionId: s.id, extra: { goblet: 1 } });

    resetExtraSetsMemory(); // another phone: nothing of phone A in memory
    const phoneB = fakeStorage();
    await restoreReplace(parsed.backup, b, phoneB);
    expect(loadDraft(s.id, 'goblet@0', phoneB)?.reps).toBe(17);
    expect(extraSets(s.id, 'goblet', phoneB)).toBe(1);
    expect(loadRest(s.id, phoneB)).toEqual(rest);
    // Durable rows written inside the restore.
    expect(JSON.parse((await b.kv.get(REST_KEY))!.value!)).toEqual(rest);
    expect(JSON.parse((await b.kv.get(EXTRA_SETS_KEY))!.value!)).toEqual({ sessionId: s.id, extra: { goblet: 1 } });
  });

  it('Merge brings them with the added workout', async () => {
    const phoneA = fakeStorage();
    const { s, rest } = await midWorkout(phoneA);
    const backup = await exportBackup(a, 5, phoneA);
    resetExtraSetsMemory();
    const phoneB = fakeStorage();
    await restoreMerge(backup, b, phoneB);
    expect(extraSets(s.id, 'goblet', phoneB)).toBe(1);
    expect(loadRest(s.id, phoneB)).toEqual(rest);
  });

  it('Replace with a backup without them clears stale ones; no workout in progress: none exported', async () => {
    const phone = fakeStorage();
    await a.gyms.add(makeGym({ name: 'G', type: 'full', unit: 'lb', isActive: true }, 1));
    const done = await exportBackup(a, 5, phone);
    expect(done.rest).toBeUndefined();
    expect(done.extraSets).toBeUndefined();
    saveRest({ sessionId: 'old', endsAt: 5, totalSec: 90 }, phone);
    addExtraSet('old', 'goblet', phone);
    await restoreReplace(done, b, phone);
    expect(loadRest('old', phone)).toBeNull();
    expect(extraSets('old', 'goblet', phone)).toBe(0);
    expect((await b.kv.get(REST_KEY))!.value).toBeNull();
    expect((await b.kv.get(EXTRA_SETS_KEY))!.value).toBeNull();
  });

  it('a rest or added rows for a workout not in progress in the file, or malformed, is refused', async () => {
    const phone = fakeStorage();
    const { s } = await midWorkout(phone);
    const good = JSON.parse(serializeBackup(await exportBackup(a, 5, phone)));
    expect(parseBackup(JSON.stringify(good)).ok).toBe(true);
    for (const bad of [
      { ...good, rest: { ...good.rest, sessionId: 'other' } },
      { ...good, rest: { sessionId: s.id, endsAt: 'soon', totalSec: 90 } },
      { ...good, extraSets: { sessionId: s.id, extra: { goblet: 0 } } },
      { ...good, extraSets: { sessionId: s.id, extra: { goblet: 1.5 } } },
    ]) {
      expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    }
    // Older backups without them still load.
    const { rest: _r, extraSets: _e, ...older } = good;
    expect(parseBackup(JSON.stringify(older)).ok).toBe(true);
  });
});
