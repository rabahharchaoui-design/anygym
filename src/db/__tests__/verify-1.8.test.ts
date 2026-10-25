import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_VERSION } from '../schema';
import { makeGym } from '../gyms';
import { ANY_GYM, type Load, type Session, type WorkoutSet } from '../types';
import { exportBackup, readTables, restoreMerge, restoreReplace } from '../backup';
import { getPastSessions } from '../history';
import { parseBackup, serializeBackup, TABLE_NAMES } from '../../lib/backup';
import { progress } from '../../lib/progression';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`v18-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const L = (o: Partial<Load> & { total: number }): Load => ({ kind: 'barbell', unit: 'lb', barWeight: 45, perSide: [], ...o }) as Load;
async function seed() {
  const home = makeGym({ name: 'Home', type: 'home', unit: 'kg', isActive: false }, 1000);
  home.collars = 'competition';
  home.bars.smith = 7.5;
  home.equipmentWeights = { smith_machine: { kind: 'bar_weight', value: 7.5 } };
  const club = makeGym({ name: 'Club', type: 'full', unit: 'lb', isActive: true }, 2000);
  await db.gyms.bulkAdd([home, club]);
  await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 5, lastBackupAt: 9 });
  await db.planState.add({ id: 'active', planId: 'five-day-split', startedAt: 10, weekIndex: 1, nextDayIndex: 3, doneDays: [0, 1, 2] });
  const ss: Session[] = [
    { id: 's1', gymId: club.id, planId: 'five-day-split', dayId: 'd1', startedAt: 100, endedAt: 200, imported: false, exerciseIds: ['bench'] },
    { id: 's2', gymId: home.id, startedAt: 300, endedAt: 400, imported: false, exerciseIds: ['squat'] },
    { id: 's3', gymId: club.id, startedAt: 50, imported: true, importSeq: 2, importHash: 'h', note: 'n', exerciseIds: ['bench'] },
    { id: 's4', gymId: home.id, startedAt: 500, endedAt: 600, imported: false, exerciseIds: ['plank'] },
  ];
  await db.sessions.bulkAdd(ss);
  const sets: WorkoutSet[] = [
    { id: 'a', sessionId: 's1', exerciseId: 'bench', order: 0, kind: 'warmup', reps: 10, load: L({ total: 65, perSide: [10] }), uncertain: false },
    { id: 'b', sessionId: 's1', exerciseId: 'bench', order: 1, kind: 'work', reps: 8, load: L({ total: 185, perSide: [45, 25] }), uncertain: false, failure: true },
    { id: 'c', sessionId: 's1', exerciseId: 'bench', order: 2, kind: 'drop', reps: 12, load: L({ total: 135, perSide: [45] }), uncertain: false },
    { id: 'd', sessionId: 's2', exerciseId: 'squat', order: 0, kind: 'work', reps: 5, load: L({ unit: 'kg', total: 102.5, barWeight: 20, perSide: [20, 20], collars: 2.5, barId: 'smith' } as never), uncertain: false },
    { id: 'e', sessionId: 's3', exerciseId: 'bench', order: 0, kind: 'work', reps: 6, load: L({ total: 175, perSide: [45, 10, 5, 5] }), uncertain: true, note: 'unclear' },
    { id: 'f', sessionId: 's4', exerciseId: 'plank', order: 0, kind: 'work', seconds: 60, load: { kind: 'timed', unit: 'kg', total: 0 }, uncertain: false },
  ];
  await db.sets.bulkAdd(sets);
  await db.exerciseSettings.bulkAdd([
    { exerciseId: 'bench', gymId: club.id, barId: 'olympic', restSec: 90 },
    { exerciseId: 'squat', gymId: ANY_GYM, restSec: 150 },
  ]);
  await db.orderCounters.bulkAdd([{ sessionId: 's1', next: 3 }]);
  return { home, club };
}
const snap = async () => {
  const t = await readTables(db);
  const o: Record<string, string> = {};
  for (const k of TABLE_NAMES) o[k] = JSON.stringify([...(t[k] as Array<{ id?: string }>)].sort((x, y) => String(x.id ?? JSON.stringify(x)).localeCompare(String(y.id ?? JSON.stringify(y)))));
  return o;
};
const counts = async () => Object.fromEntries(await Promise.all(TABLE_NAMES.map(async (t) => [t, await db.table(t).count()])));
const prog = async (ex: string, gymId: string, kind: Load['kind']) =>
  progress({ exerciseId: ex, loadKind: kind, unit: 'lb', gym: { base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: null, stackStep: 5 }, repRange: [6, 10], history: await getPastSessions(ex, gymId, kind, 6, { db }) });

describe('verify 1.8', () => {
  it('round trip exact, merge idempotent, merge adds only new', async () => {
    const { club, home } = await seed();
    const before = await snap();
    const pb = [await prog('bench', club.id, 'barbell'), await prog('squat', home.id, 'barbell'), await prog('plank', home.id, 'timed')];
    const text = serializeBackup(await exportBackup(db, 1));
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    for (const t of TABLE_NAMES) expect(JSON.stringify([...parsed.backup.tables[t]].sort((x: any, y: any) => String(x.id ?? JSON.stringify(x)).localeCompare(String(y.id ?? JSON.stringify(y)))), null, 0)).toBe(before[t]);
    for (const t of db.tables) await t.clear();
    await restoreReplace(parsed.backup, db);
    expect(await snap()).toEqual(before);
    expect([await prog('bench', club.id, 'barbell'), await prog('squat', home.id, 'barbell'), await prog('plank', home.id, 'timed')]).toEqual(pb);
    const c0 = await counts();
    expect(await restoreMerge(parsed.backup, db)).toEqual({ workouts: 0, sets: 0 });
    expect(await counts()).toEqual(c0);
    // merge a file with 1 new session + 2 new sets
    const more = JSON.parse(text);
    more.tables.sessions.push({ id: 's9', gymId: club.id, startedAt: 900, endedAt: 950, imported: false, exerciseIds: ['row'] });
    more.tables.sets.push(
      { id: 'n1', sessionId: 's9', exerciseId: 'row', order: 0, kind: 'work', reps: 8, load: { kind: 'stack', unit: 'lb', total: 100 }, uncertain: false },
      { id: 'n2', sessionId: 's9', exerciseId: 'row', order: 1, kind: 'work', reps: 8, load: { kind: 'stack', unit: 'lb', total: 100 }, uncertain: false },
    );
    const p2 = parseBackup(JSON.stringify(more));
    if (!p2.ok) throw new Error(p2.error);
    expect(await restoreMerge(p2.backup, db)).toEqual({ workouts: 1, sets: 2 });
    const c1 = await counts();
    expect(c1.sessions).toBe(c0.sessions + 1);
    expect(c1.sets).toBe(c0.sets + 2);
  });

  it('older schema restores; tampered files refused, nothing changes', async () => {
    await seed();
    const obj = JSON.parse(serializeBackup(await exportBackup(db, 1)));
    const c0 = await counts();
    const s0 = await snap();
    const old = structuredClone(obj);
    old.schemaVersion = 3;
    // Only tables added after v3 may be missing (planState is a v3 table, so it stays).
    delete old.tables.orderCounters; delete old.tables.submissions; delete old.tables.tombstones;
    const po = parseBackup(JSON.stringify(old));
    expect(po.ok).toBe(true);
    if (po.ok) { await restoreReplace(po.backup, db); expect((await counts()).sets).toBe(c0.sets); }
    // restore the seed state for tamper checks
    const full = parseBackup(JSON.stringify(obj)); if (!full.ok) throw new Error('x'); await restoreReplace(full.backup, db);
    const bad: Array<[string, any]> = [];
    const t1 = structuredClone(obj); t1.tables.sets[0].load.total = '65'; bad.push(['string total', t1]);
    const t2 = structuredClone(obj); delete t2.format; bad.push(['no format', t2]);
    const t3 = structuredClone(obj); t3.schemaVersion = SCHEMA_VERSION + 1; bad.push(['newer', t3]);
    const t4 = structuredClone(obj); t4.tables.sets[0].sessionId = 'ghost'; bad.push(['orphan', t4]);
    for (const [name, o] of bad) {
      const r = parseBackup(JSON.stringify(o));
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
    expect(parseBackup('{not json').ok).toBe(false);
    expect(await counts()).toEqual(c0);
    expect(await snap()).toEqual(s0);
  });
});
