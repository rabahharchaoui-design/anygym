// PLAN 3.5e: G's decisions on candidate moves live on the phone (schema v11, additive), reach the
// gate at once (approve, undo, app start, restore) and travel in the backup.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_VERSION } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';
import { loadApprovals, readCandidateReviews, saveCandidateDecision, undoCandidateDecision } from '../candidateReviews';
import { approvedCandidate, loadCandidateFile, ownerCandidates, setApproved } from '../../data/candidateGate';
import { demoFor } from '../../data/exerciseInfo';
import { decisionRow } from '../../lib/candidates/review';
import { parseBackup, serializeBackup } from '../../lib/backup';

let db: AnyGymDB;
let name: string;
let ids: string[];
beforeEach(async () => {
  await loadCandidateFile();
  ids = ownerCandidates().map((c) => c.id);
  setApproved([]);
  name = `cand-35e-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
  await db.gyms.add(makeGym({ name: 'Hotel', type: 'hotel', unit: 'lb', isActive: true }, 1));
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
  setApproved([]);
});

describe('schema v10 → v11 (candidateReviews)', () => {
  it('keeps every record byte for byte and adds the decisions table empty, ready to write', async () => {
    const old = `cand-mig-${Math.random()}`;
    const v10 = new Dexie(old);
    [SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10].forEach((s, i) => v10.version(i + 1).stores(s));
    await v10.open();
    const g = makeGym({ name: 'Home', type: 'home', unit: 'kg', isActive: true }, 5);
    await v10.table('gyms').add(g);
    await v10.table('profile').add({ id: 'me', defaultUnit: 'kg', createdAt: 1 });
    await v10.table('sessions').add({ id: 'a', gymId: g.id, startedAt: 100, endedAt: 200, imported: false, exerciseIds: ['Pushups'] });
    await v10.table('sets').add({ id: 's1', sessionId: 'a', exerciseId: 'Pushups', order: 0, kind: 'work', reps: 12, uncertain: false });
    await v10.table('kv').put({ key: 'review:v1', value: '{"decisions":{}}', at: 7 });
    await v10.table('coachCards').put({ id: 'c1', state: 'dismissed', at: 3 });
    const before: Record<string, string> = {};
    for (const t of v10.tables) before[t.name] = JSON.stringify(await t.toArray());
    v10.close();

    const up = new AnyGymDB(old);
    await up.open();
    expect(SCHEMA_VERSION).toBe(11);
    expect(up.verno).toBe(11);
    for (const t of Object.keys(before)) expect(JSON.stringify(await up.table(t).toArray()), t).toBe(before[t]);
    expect(await up.candidateReviews.count()).toBe(0);
    await saveCandidateDecision(decisionRow(ids[0]!, 'approve', 9), up);
    expect(await readCandidateReviews(up)).toEqual([{ id: ids[0], decision: 'approve', at: 9 }]);
    up.close();
    await Dexie.delete(old);
  });
});

describe('decisions reach the gate', () => {
  it('approve makes it sure at once, wrong and fix never, undo puts it back', async () => {
    const [a, b, c] = ids;
    expect(demoFor(a!)).toBeNull();
    const first = await saveCandidateDecision(decisionRow(a!, 'approve', 1), db);
    expect(first.previous).toBeUndefined();
    expect(approvedCandidate(a!)?.id).toBe(a);
    expect(demoFor(a!)).not.toBeNull();
    await saveCandidateDecision(decisionRow(b!, 'wrong', 2), db);
    await saveCandidateDecision(decisionRow(c!, 'fix', 3, { reason: 'photo', note: 'grip' }), db);
    expect(approvedCandidate(b!)).toBeUndefined();
    expect(approvedCandidate(c!)).toBeUndefined();
    expect((await db.candidateReviews.get(c!))).toEqual({ id: c, decision: 'fix', reason: 'photo', note: 'grip', at: 3 });

    // Changing a decision keeps what it replaced, so Undo restores exactly that.
    const changed = await saveCandidateDecision(decisionRow(a!, 'wrong', 4), db);
    expect(changed.previous).toEqual({ id: a, decision: 'approve', at: 1 });
    expect(approvedCandidate(a!)).toBeUndefined();
    await undoCandidateDecision(a!, changed.previous, db);
    expect(approvedCandidate(a!)?.id).toBe(a);
    await undoCandidateDecision(a!, undefined, db);
    expect(await db.candidateReviews.get(a!)).toBeUndefined();
    expect(approvedCandidate(a!)).toBeUndefined();
  });

  it('app start reads the approvals; a stored row that is not one is ignored', async () => {
    await db.candidateReviews.bulkPut([decisionRow(ids[0]!, 'approve', 1), { id: ids[1]!, decision: 'maybe', at: 1 } as never]);
    expect(await loadApprovals(db)).toBe(1);
    expect(approvedCandidate(ids[0]!)).toBeTruthy();
    expect(approvedCandidate(ids[1]!)).toBeUndefined();
  });

  it('refuses to write a row that is not one', async () => {
    await expect(saveCandidateDecision({ id: '', decision: 'approve', at: 1 }, db)).rejects.toThrow();
  });
});

describe('backup and restore', () => {
  it('round trips the decisions through the file; a replace brings them back and the gate sees them', async () => {
    await saveCandidateDecision(decisionRow(ids[0]!, 'approve', 1), db);
    await saveCandidateDecision(decisionRow(ids[1]!, 'fix', 2, { reason: 'gear', note: 'needs a box' }), db);
    const parsed = parseBackup(serializeBackup(await exportBackup(db, 5)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.backup.schemaVersion).toBe(11);
    expect(parsed.backup.tables.candidateReviews).toEqual(await readCandidateReviews(db));

    await db.candidateReviews.clear();
    setApproved([]);
    await restoreReplace(parsed.backup, db);
    expect(await readCandidateReviews(db)).toEqual(parsed.backup.tables.candidateReviews);
    expect(approvedCandidate(ids[0]!)?.id).toBe(ids[0]);
  });

  it('a merge keeps the phone own decision and adds the rest', async () => {
    await saveCandidateDecision(decisionRow(ids[0]!, 'approve', 1), db);
    await saveCandidateDecision(decisionRow(ids[1]!, 'approve', 1), db);
    const parsed = parseBackup(serializeBackup(await exportBackup(db, 5)));
    if (!parsed.ok) throw new Error(parsed.error);
    await db.candidateReviews.clear();
    await saveCandidateDecision(decisionRow(ids[0]!, 'wrong', 9), db);
    await restoreMerge(parsed.backup, db);
    expect(await db.candidateReviews.get(ids[0]!)).toEqual({ id: ids[0], decision: 'wrong', at: 9 });
    expect(await db.candidateReviews.get(ids[1]!)).toEqual({ id: ids[1], decision: 'approve', at: 1 });
    expect(approvedCandidate(ids[1]!)).toBeTruthy();
    expect(approvedCandidate(ids[0]!)).toBeUndefined();
  });

  it('a backup from schema 10 (no decisions table) still restores, with no decisions', async () => {
    const parsed = parseBackup(serializeBackup(await exportBackup(db, 5)));
    if (!parsed.ok) throw new Error(parsed.error);
    const { candidateReviews: _gone, ...tables } = parsed.backup.tables;
    const old = parseBackup(JSON.stringify({ ...parsed.backup, schemaVersion: 10, tables }));
    if (!old.ok) throw new Error(old.error);
    expect(old.backup.tables.candidateReviews).toEqual([]);
    // A schema 11 file without the table is damaged: a Replace would wipe the decisions.
    expect(parseBackup(JSON.stringify({ ...parsed.backup, tables })).ok).toBe(false);
    // A bad row is refused before anything changes.
    expect(parseBackup(JSON.stringify({ ...parsed.backup, tables: { ...parsed.backup.tables, candidateReviews: [{ id: 'x', decision: 'yes', at: 1 }] } })).ok).toBe(false);
  });
});
