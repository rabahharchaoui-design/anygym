// PLAN 1.7k independent verification (tester): hand computed expectations.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import type { Load, Session, WorkoutSet } from '../types';
import { exportBackup, readTables, restoreReplace } from '../backup';
import { lastSessionSets, getPastSessions } from '../history';
import { parseBackup, serializeBackup, TABLE_NAMES } from '../../lib/backup';
import { progress } from '../../lib/progression';
import { recordsFor } from '../../lib/records';
import { dumbbellLoad, stackLoad } from '../../lib/load';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`v17k-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const snap = async () => {
  const t = await readTables(db);
  return JSON.stringify(TABLE_NAMES.map((k) => [k, [...(t[k] as Array<{ id?: string }>)].sort((x, y) => String(x.id ?? JSON.stringify(x)).localeCompare(String(y.id ?? JSON.stringify(y))))]));
};

async function seed() {
  const club = makeGym({ name: 'Club', type: 'full', unit: 'lb', isActive: true }, 2000);
  const home = makeGym({ name: 'Home', type: 'home', unit: 'kg', isActive: false }, 1000);
  await db.gyms.bulkAdd([club, home]);
  const s: Session = { id: 's1', gymId: club.id, startedAt: 100, endedAt: 200, imported: false, exerciseIds: ['bench'] };
  await db.sessions.add(s);
  const load: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25], collars: 0 } as Load;
  await db.sets.add({ id: 'a', sessionId: 's1', exerciseId: 'bench', order: 0, kind: 'work', reps: 8, load, uncertain: false });
}

describe('(b) a backup with unknown plates is refused as damaged, nothing changed', () => {
  it('enabled and disabled 999 kg / 999 lb plates, 7 lb plate in a gym set breakdown', async () => {
    await seed();
    const obj = JSON.parse(serializeBackup(await exportBackup(db, 1)));
    const before = await snap();
    const gymKg = obj.tables.gyms.find((g: any) => g.unit === 'kg');
    const gymLb = obj.tables.gyms.find((g: any) => g.unit === 'lb');
    const cases: Array<[string, any]> = [];
    const mk = (f: (o: any) => void) => { const o = structuredClone(obj); f(o); return o; };
    cases.push(['enabled 999 kg', mk((o) => { o.tables.gyms.find((g: any) => g.id === gymKg.id).plateInventory.push({ weight: 999, enabled: true }); })]);
    cases.push(['disabled 999 kg', mk((o) => { o.tables.gyms.find((g: any) => g.id === gymKg.id).plateInventory.push({ weight: 999, enabled: false }); })]);
    cases.push(['enabled lb plate in kg gym (45 lb in kg)', mk((o) => { o.tables.gyms.find((g: any) => g.id === gymKg.id).plateInventory.push({ weight: 45, enabled: true }); })]);
    cases.push(['kg-only 20 in lb gym', mk((o) => { o.tables.gyms.find((g: any) => g.id === gymLb.id).plateInventory.push({ weight: 20, enabled: true }); })]);
    cases.push(['perSide 7 lb', mk((o) => { o.tables.sets[0].load.perSide = [45, 7]; })]);
    cases.push(['perSide 999', mk((o) => { o.tables.sets[0].load.perSide = [999]; })]);
    cases.push(['perSide NaN-ish string', mk((o) => { o.tables.sets[0].load.perSide = ['45']; })]);
    for (const [name, o] of cases) {
      const r = parseBackup(JSON.stringify(o));
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.error, name).toBe('This backup is damaged. Nothing was changed.');
    }
    // Control: the untouched file is fine and the database is byte for byte unchanged.
    expect(parseBackup(JSON.stringify(obj)).ok).toBe(true);
    expect(await snap()).toBe(before);
  });
});

describe('(g) progression across units', () => {
  it('20 kg then 44.09245 lb dumbbells at the top (12 of 8-12): next is 22 kg (20 kg step 2)', () => {
    const p = progress({
      exerciseId: 'x', loadKind: 'dumbbell_each', unit: 'kg',
      gym: { base: 20, plates: [], collars: 'none', dumbbellRange: { min: 2, max: 40, step: 2 }, stackStep: 2.5 },
      repRange: [8, 12],
      history: [{ date: 10, gymId: 'g', unit: 'kg', sets: [{ kind: 'work', reps: 12, load: dumbbellLoad(20, 'kg') }, { kind: 'work', reps: 12, load: dumbbellLoad(44.09245, 'lb') }] }],
    });
    expect(p.next.kind).toBe('increase');
    expect(p.next.load).toEqual(dumbbellLoad(22, 'kg'));
  });
});

describe('(h) rep records: 100 + 25 pin and 125 + 0 are the same load', () => {
  it('more reps at the same stack resistance is a record, whatever the breakdown', () => {
    const before = [{ kind: 'work' as const, reps: 8, load: stackLoad(100, 'lb', 25) }];
    const today = [{ kind: 'work' as const, reps: 10, load: stackLoad(125, 'lb') }];
    const out = recordsFor('row', 'Row', today, before);
    expect(out.map((r) => r.kind)).toContain('most_reps');
    expect(out.find((r) => r.kind === 'most_reps')!.text).toContain('10');
    // reverse direction too
    const out2 = recordsFor('row', 'Row', [{ kind: 'work' as const, reps: 10, load: stackLoad(100, 'lb', 25) }], [{ kind: 'work' as const, reps: 8, load: stackLoad(125, 'lb') }]);
    expect(out2.map((r) => r.kind)).toContain('most_reps');
  });
});

describe('(h) legacy Smith set without barId', () => {
  it('with the gym Smith answer present it is excluded from Olympic LAST TIME and kept for Smith', async () => {
    const club = makeGym({ name: 'Club', type: 'full', unit: 'lb', isActive: true }, 2000);
    club.bars.smith = 15;
    await db.gyms.add(club);
    await db.sessions.bulkAdd([
      { id: 'sm', gymId: club.id, startedAt: 500, endedAt: 600, imported: false, exerciseIds: ['bench'] },
      { id: 'ol', gymId: club.id, startedAt: 100, endedAt: 200, imported: false, exerciseIds: ['bench'] },
    ]);
    const L = (barWeight: number, total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight, perSide: [], collars: 0 } as Load);
    const sets: WorkoutSet[] = [
      { id: 'a', sessionId: 'sm', exerciseId: 'bench', order: 0, kind: 'work', reps: 8, load: L(15, 15), uncertain: false },
      { id: 'b', sessionId: 'ol', exerciseId: 'bench', order: 0, kind: 'work', reps: 5, load: L(45, 45), uncertain: false },
    ];
    await db.sets.bulkAdd(sets);
    const oly = await lastSessionSets('bench', club.id, 'barbell', { db, smith: false });
    expect(oly?.sets).toHaveLength(1);
    expect(oly!.sets[0]!.reps).toBe(5);
    const smith = await lastSessionSets('bench', club.id, 'barbell', { db, smith: true });
    expect(smith?.sets[0]?.reps).toBe(8);
    const past = await getPastSessions('bench', club.id, 'barbell', 6, { db, smith: false });
    expect(past).toHaveLength(1);
  });
});

describe('restoreReplace refusal path is not reached for damaged files', () => {
  it('restoreReplace is only given parsed backups: a damaged one never gets there', async () => {
    await seed();
    const before = await snap();
    const bad = JSON.parse(serializeBackup(await exportBackup(db, 1)));
    bad.tables.gyms[0].plateInventory.push({ weight: 999, enabled: true });
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    expect(await snap()).toBe(before);
    void restoreReplace;
  });
});
