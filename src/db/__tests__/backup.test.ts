import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_VERSION } from '../schema';
import { makeGym } from '../gyms';
import { ANY_GYM, type Load, type Session, type WorkoutSet } from '../types';
import { ActiveWorkoutError, exportBackup, readTables, recordBackup, restoreMerge, restoreReplace, snoozeBackupReminder } from '../backup';
import { getPastSessions } from '../history';
import { BACKUP_FORMAT, parseBackup, serializeBackup, TABLE_NAMES, type Backup } from '../../lib/backup';
import { progress } from '../../lib/progression';
import { exportDrafts, loadDraft, saveDraft, type Draft } from '../../lib/drafts';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};

// PLAN 1.8 (SPEC 9.1, 9.2): export → wipe → restore gives back every record exactly, and the
// progression engine says the same thing before and after.

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-backup-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar: Load = { kind: 'barbell', unit: 'lb', total: 187.5, barWeight: 45, barId: 'olympic', perSide: [45, 25, 1.25], collars: 0 };
const collared: Load = { kind: 'barbell', unit: 'kg', total: 105, barWeight: 20, barId: 'olympic', perSide: [25, 15], collars: 5 };
const smith: Load = { kind: 'barbell', unit: 'lb', total: 0.1 + 0.2, barWeight: 0, barId: 'smith', perSide: [0.1, 0.2].map((x) => x / 2) };

async function seed() {
  const home = makeGym({ name: 'Home', type: 'home', unit: 'kg', isActive: false }, 1000);
  const club = makeGym({ name: 'Life Time', type: 'full', unit: 'lb', isActive: true }, 2000);
  club.equipmentWeights = { leg_press: { kind: 'starting_resistance', value: 118 } };
  await db.gyms.bulkAdd([home, club]);
  await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 5, goal: 'strength', lastBackupAt: 77 });
  await db.planState.add({ id: 'active', planId: 'five-day-split', startedAt: 10, weekIndex: 0, nextDayIndex: 2, doneDays: [0, 1], partial: { 1: 0.5 } });
  const sessions: Session[] = [
    { id: 's1', gymId: club.id, planId: 'five-day-split', dayId: 'd1', startedAt: 100_000, endedAt: 110_000, imported: false, exerciseIds: ['bench', 'squat'] },
    { id: 's2', gymId: home.id, startedAt: 200_000, endedAt: 210_000, imported: false, exerciseIds: ['squat'], timeBudgetMin: 45 },
    { id: 's3', gymId: club.id, startedAt: 1, imported: true, importSeq: 1, importHash: 'abc', note: 'from paper', exerciseIds: ['bench'] },
  ];
  await db.sessions.bulkAdd(sessions);
  const sets: WorkoutSet[] = [
    { id: 'a', sessionId: 's1', exerciseId: 'bench', order: 0, kind: 'warmup', reps: 10, load: { kind: 'barbell', unit: 'lb', total: 45, barWeight: 45, perSide: [] }, uncertain: false },
    { id: 'b', sessionId: 's1', exerciseId: 'bench', order: 1, kind: 'work', reps: 8, load: bar, uncertain: false, failure: true, rpe: 9 },
    { id: 'c', sessionId: 's1', exerciseId: 'bench', order: 2, kind: 'drop', reps: 12, load: { ...bar, total: 135, perSide: [45] }, uncertain: false, note: 'drop it' },
    { id: 'd', sessionId: 's1', exerciseId: 'squat', order: 3, kind: 'work', reps: 5, load: smith, uncertain: false },
    { id: 'e', sessionId: 's2', exerciseId: 'squat', order: 0, kind: 'work', reps: 5, load: collared, uncertain: false },
    { id: 'f', sessionId: 's2', exerciseId: 'plank', order: 1, kind: 'work', seconds: 45, load: { kind: 'timed', unit: 'kg', total: 0 }, uncertain: false },
    { id: 'g', sessionId: 's3', exerciseId: 'bench', order: 0, kind: 'work', reps: 6, load: { ...bar, total: 175, perSide: [45, 20] }, uncertain: true, note: 'weight unclear' },
  ];
  await db.sets.bulkAdd(sets);
  await db.exerciseSettings.bulkAdd([
    { exerciseId: 'bench', gymId: club.id, barId: 'olympic' },
    { exerciseId: 'bench', gymId: ANY_GYM, loadType: 'barbell', restSec: 120, note: 'tuck elbows' },
    { exerciseId: 'leg-press', gymId: club.id, loadType: 'plate_machine' },
  ]);
  await db.orderCounters.bulkAdd([
    { sessionId: 's1', next: 5 },
    { sessionId: 's2', next: 2 },
  ]);
  await db.runs.add({ id: 'r1', startedAt: 300_000, type: 'easy', movingSec: 61, elapsedSec: 70, distanceM: 201.5, points: [[45.1, -122.3, 1, 5]], gaps: [], splits: [] });
  return { home, club };
}

const snapshot = async () => {
  const t = await readTables(db);
  const out: Record<string, string> = {};
  for (const name of TABLE_NAMES) out[name] = JSON.stringify(t[name]);
  return out;
};

const benchNext = async (gymId: string) =>
  progress({
    exerciseId: 'bench',
    loadKind: 'barbell',
    unit: 'lb',
    gym: { base: 45, plates: [45, 35, 25, 10, 5, 2.5, 1.25], collars: 'none', dumbbellRange: null, stackStep: 5 },
    repRange: [6, 10],
    history: await getPastSessions('bench', gymId, 'barbell', 6, { db }),
  });

describe('export', () => {
  it('writes the format, versions, every table, and leaves transient tables out with no workout in progress', async () => {
    await seed();
    await db.submissions.add({ id: 'b', sessionId: 's1', exerciseId: 'bench', rev: 1 });
    const b = await exportBackup(db, 123);
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.schemaVersion).toBe(SCHEMA_VERSION);
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(b.exportedAt).toBe(123);
    expect(typeof b.appVersion).toBe('string');
    expect(Object.keys(b.tables).sort()).toEqual([...TABLE_NAMES].sort());
    expect(b.tables.sessions).toHaveLength(3);
    expect(b.tables.sets).toHaveLength(7);
    expect(b.tables.submissions).toEqual([]);
    expect(b.tables.tombstones).toEqual([]);
  });

  it('keeps submissions and tombstones when a workout is in progress', async () => {
    const { club } = await seed();
    await db.sessions.add({ id: 'live', gymId: club.id, startedAt: 400_000, imported: false });
    await db.submissions.add({ id: 'x', sessionId: 'live', exerciseId: 'bench', rev: 2 });
    const set: WorkoutSet = { id: 'y', sessionId: 'live', exerciseId: 'bench', order: 0, kind: 'work', reps: 5, load: bar, uncertain: false };
    await db.tombstones.add({ id: 'y', sessionId: 'live', set, expiresAt: 999 });
    const b = await exportBackup(db, 1);
    expect(b.tables.submissions).toHaveLength(1);
    expect(b.tables.tombstones).toEqual([{ id: 'y', sessionId: 'live', set, expiresAt: 999 }]);
  });
});

describe('round trip', () => {
  it('export → clear → restore replace: every table byte identical, progression unchanged', async () => {
    const { club, home } = await seed();
    const before = await snapshot();
    const nextBefore = [await benchNext(club.id), await benchNext(home.id)];
    const text = serializeBackup(await exportBackup(db, 42));

    for (const t of db.tables) await t.clear();
    expect(await db.sets.count()).toBe(0);

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await restoreReplace(parsed.backup, db)).toEqual({ workouts: 3, sets: 7 });
    expect(await snapshot()).toEqual(before);
    expect([await benchNext(club.id), await benchNext(home.id)]).toEqual(nextBefore);
    // Numbers came back exactly, including 0.1 + 0.2.
    expect((await db.sets.get('d'))!.load!.total).toBe(0.1 + 0.2);
  });

  it('replace over different data removes it', async () => {
    await seed();
    const backup = await exportBackup(db, 1);
    await db.sessions.add({ id: 'other', gymId: 'x', startedAt: 5, endedAt: 6, imported: false });
    await db.gyms.add(makeGym({ name: 'Hotel', type: 'hotel', unit: 'lb' }, 9));
    await restoreReplace(backup, db);
    expect(await db.sessions.get('other')).toBeUndefined();
    expect(await db.gyms.count()).toBe(2);
  });

  it('a write that fails changes nothing', async () => {
    await seed();
    const before = await snapshot();
    const good = await exportBackup(db, 1);
    // A set with no id cannot be stored: the whole restore rolls back.
    const bad: Backup = { ...good, tables: { ...good.tables, sessions: [], sets: [{ ...good.tables.sets[0]!, id: undefined as unknown as string }] } };
    await expect(restoreReplace(bad, db)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it('is refused while a workout is in progress, and nothing changes', async () => {
    const { club } = await seed();
    const backup = await exportBackup(db, 1);
    await db.sessions.add({ id: 'live', gymId: club.id, startedAt: 500_000, imported: false });
    const before = await snapshot();
    await expect(restoreReplace(backup, db)).rejects.toBeInstanceOf(ActiveWorkoutError);
    await expect(restoreMerge(backup, db)).rejects.toBeInstanceOf(ActiveWorkoutError);
    expect(await snapshot()).toEqual(before);
  });
});

describe('drafts (SPEC 9.1: export everything)', () => {
  const pending: Draft = { id: 'next-set', load: { kind: 'barbell', unit: 'lb', total: 187.5, barWeight: 45, perSide: [45, 25, 1.25] }, plates: [45, 25, 1.25], reps: 8, rev: 4, submitted: 3, type: 'failure' };
  const hold: Draft = { id: 'hold-1', load: { kind: 'timed', unit: 'lb', total: 0 }, watch: { startedAt: 1_700_000_000_000, accumulated: 12_345 }, rev: 1 };

  it('a mid workout backup restores the workout, its submissions, tombstones and drafts exactly', async () => {
    const { club } = await seed();
    await db.sessions.add({ id: 'live', gymId: club.id, startedAt: 400_000, imported: false, exerciseIds: ['bench', 'plank'] });
    await db.sets.add({ id: 'l1', sessionId: 'live', exerciseId: 'bench', order: 0, kind: 'work', reps: 8, load: bar, uncertain: false });
    await db.submissions.add({ id: 'l1', sessionId: 'live', exerciseId: 'bench', rev: 2 });
    const gone: WorkoutSet = { id: 'l0', sessionId: 'live', exerciseId: 'bench', order: 1, kind: 'work', reps: 3, load: bar, uncertain: false };
    await db.tombstones.add({ id: 'l0', sessionId: 'live', set: gone, expiresAt: 999, undo: true });
    await db.orderCounters.add({ sessionId: 'live', next: 2 });
    const phoneA = fakeStorage();
    saveDraft('live', 'bench', pending, phoneA);
    saveDraft('live', 'plank', hold, phoneA);

    const before = await snapshot();
    const text = serializeBackup(await exportBackup(db, 1, phoneA));
    for (const t of db.tables) await t.clear();
    const phoneB = fakeStorage();
    phoneB.setItem('anygym-drafts', JSON.stringify({ old: { bench: { id: 'stale', load: null } } }));

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await restoreReplace(parsed.backup, db, phoneB);
    expect(await snapshot()).toEqual(before);
    expect(exportDrafts(phoneB)).toEqual({ live: { bench: pending, plank: hold } });
    expect(JSON.parse(phoneB.raw.get('anygym-drafts')!)).toEqual({ live: { bench: pending, plank: hold } });
    expect(loadDraft('live', 'bench', phoneB)).toEqual(pending);
    expect(loadDraft('live', 'plank', phoneB)).toEqual(hold);
  });

  it('a backup with no workout in progress clears old drafts on Replace', async () => {
    await seed();
    const phone = fakeStorage();
    const backup = await exportBackup(db, 1, phone);
    expect(backup.drafts).toEqual({});
    phone.setItem('anygym-drafts', JSON.stringify({ old: { bench: { id: 'stale', load: null } } }));
    await restoreReplace(backup, db, phone);
    expect(phone.raw.has('anygym-drafts')).toBe(false);
  });

  it('merge brings the drafts of a workout it adds', async () => {
    const { club } = await seed();
    const backup = await exportBackup(db, 1, fakeStorage());
    backup.tables.sessions.push({ id: 'live', gymId: club.id, startedAt: 400_000, imported: false });
    backup.drafts = { live: { bench: pending } };
    const phone = fakeStorage();
    expect(await restoreMerge(backup, db, phone)).toEqual({ workouts: 1, sets: 0 });
    expect(loadDraft('live', 'bench', phone)).toEqual(pending);
  });
});

describe('merge', () => {
  it('with the same ids adds nothing', async () => {
    await seed();
    const backup = await exportBackup(db, 1);
    const before = await snapshot();
    expect(await restoreMerge(backup, db)).toEqual({ workouts: 0, sets: 0 });
    expect(await snapshot()).toEqual(before);
  });

  it('with new ids adds exactly them, keeps the phone profile, plan and active gym', async () => {
    const { club } = await seed();
    const extraGym = { ...makeGym({ name: 'Hotel', type: 'hotel', unit: 'lb', isActive: true }, 3000), id: 'hotel' };
    const backup = await exportBackup(db, 1);
    const newSession: Session = { id: 's9', gymId: club.id, startedAt: 900_000, endedAt: 901_000, imported: false };
    const newSets: WorkoutSet[] = [
      { id: 'n1', sessionId: 's9', exerciseId: 'bench', order: 0, kind: 'work', reps: 9, load: bar, uncertain: false },
      { id: 'n2', sessionId: 's9', exerciseId: 'bench', order: 1, kind: 'work', reps: 8, load: bar, uncertain: false },
    ];
    backup.tables.sessions.push(newSession);
    backup.tables.sets.push(...newSets);
    // A set with a new id inside a workout the phone already has is not brought back.
    backup.tables.sets.push({ id: 'old-deleted', sessionId: 's1', exerciseId: 'bench', order: 9, kind: 'work', reps: 1, load: bar, uncertain: false });
    backup.tables.orderCounters.push({ sessionId: 's9', next: 2 });
    backup.tables.gyms.push(extraGym);
    backup.tables.profile = [{ id: 'other', defaultUnit: 'kg', createdAt: 1 }];
    backup.tables.planState = [{ id: 'active', planId: 'x', startedAt: 1, weekIndex: 0, nextDayIndex: 0, doneDays: [] }];

    const before = await snapshot();
    expect(await restoreMerge(backup, db)).toEqual({ workouts: 1, sets: 2 });
    const after = await snapshot();
    for (const t of ['profile', 'planState', 'runs', 'exerciseSettings'] as const) expect(after[t]).toBe(before[t]);
    expect(await db.sessions.get('s9')).toEqual(newSession);
    expect(await db.sets.where('sessionId').equals('s9').toArray()).toEqual(newSets);
    expect(await db.sets.get('old-deleted')).toBeUndefined();
    expect(await db.orderCounters.get('s9')).toEqual({ sessionId: 's9', next: 2 });
    expect(await db.gyms.get('hotel')).toEqual({ ...extraGym, isActive: false });
    expect(await db.sets.count()).toBe(9);
  });

  it('fills the profile and plan position when the phone has none', async () => {
    await seed();
    const backup = await exportBackup(db, 1);
    await db.profile.clear();
    await db.planState.clear();
    await restoreMerge(backup, db);
    expect(await db.profile.toArray()).toEqual(backup.tables.profile);
    expect(await db.planState.toArray()).toEqual(backup.tables.planState);
  });
});

describe('profile: last backup and snooze', () => {
  it('creates the profile when missing, then updates it', async () => {
    await db.gyms.add(makeGym({ name: 'Home', type: 'home', unit: 'kg', isActive: true }, 1));
    await recordBackup(db, 1000);
    expect(await db.profile.toArray()).toEqual([{ id: 'me', defaultUnit: 'kg', createdAt: 1000, lastBackupAt: 1000 }]);
    await snoozeBackupReminder(5000, db, 2000);
    await recordBackup(db, 3000);
    expect(await db.profile.toArray()).toEqual([{ id: 'me', defaultUnit: 'kg', createdAt: 1000, lastBackupAt: 3000, backupSnoozeUntil: 5000 }]);
  });
});
