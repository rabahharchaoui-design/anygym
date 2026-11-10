// PLAN 3.8: the coach's storage (schema v10) and its read of the logged workouts.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_VERSION } from '../schema';
import { makeGym } from '../gyms';
import { applyChanges, closeCard, coachRows, coachTargets, effortOf, reopenCard, resolveOutcomes, saveEffort, setAutoLevelUp, undoApplied, undoChange } from '../coach';
import { exportBackup, restoreMerge, restoreReplace } from '../backup';
import { coachData, primaryRegions, rangeFor, regionWord, weekdaysOf } from '../coachData';
import { rebuildWeek, undoRebuildWeek } from '../planState';
import { setAlwaysUse } from '../swaps';
import { coachToday, type PlannedChange } from '../../lib/coach';
import { loadAt, type LoadSetup } from '../../lib/load';
import type { Gym, Load, Session, WorkoutSet } from '../types';

const LB: LoadSetup = { unit: 'lb', base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: { min: 5, max: 50, step: 5 }, stackStep: 5 };
const bar = (t: number): Load => loadAt('barbell', t, LB)!;
const NOW = new Date(2026, 10, 11, 12).getTime();
const nov = (d: number, h = 18) => new Date(2026, 10, d, h).getTime();

let db: AnyGymDB;
let name: string;
let gym: Gym;
beforeEach(async () => {
  name = `coach-38-${Math.random()}`;
  db = new AnyGymDB(name);
  await db.open();
  gym = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  await db.gyms.add(gym);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});

let n = 0;
async function workout(date: number, sets: Array<[exerciseId: string, reps: number, load: Load, kind?: WorkoutSet['kind']]>, over: Partial<Session> = {}): Promise<Session> {
  const s: Session = { id: `w${n++}`, gymId: gym.id, startedAt: date, endedAt: date + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((x) => x[0]))], ...over };
  await db.sessions.add(s);
  await db.sets.bulkAdd(sets.map(([exerciseId, reps, load, kind], i) => ({ id: `${s.id}-${i}`, sessionId: s.id, exerciseId, order: i, kind: kind ?? 'work', reps, load, uncertain: false })));
  return s;
}

describe('schema v9 → v10 (PLAN 3.8: the coach tables)', () => {
  it('keeps every record byte for byte and adds the four coach tables empty', async () => {
    const old = `coach-mig-${Math.random()}`;
    const v9 = new Dexie(old);
    v9.version(1).stores(SCHEMA_V1);
    v9.version(2).stores(SCHEMA_V2);
    v9.version(3).stores(SCHEMA_V3);
    v9.version(4).stores(SCHEMA_V4);
    v9.version(5).stores(SCHEMA_V5);
    v9.version(6).stores(SCHEMA_V6);
    v9.version(7).stores(SCHEMA_V7);
    v9.version(8).stores(SCHEMA_V8);
    v9.version(9).stores(SCHEMA_V9);
    await v9.open();
    const g = makeGym({ name: 'Hotel', type: 'hotel', unit: 'kg', isActive: true, city: 'Tokyo' }, 5);
    await v9.table('gyms').add({ ...g, lastUsedAt: 9, timeBudgetMin: 45 });
    await v9.table('profile').add({ id: 'me', defaultUnit: 'kg', createdAt: 1, intakeDoneAt: 2, intake: { goal: 'muscle', goals: ['muscle'], experience: '3y', weekdays: ['mon', 'thu'] }, dislikes: { soft: { x: 1 } } });
    await v9.table('sessions').bulkAdd([
      { id: 'a', gymId: g.id, startedAt: 100, endedAt: 200, imported: false, planId: 'five-day-split', dayId: '1', exerciseIds: ['barbell-back-squat'], rowAdjust: { 'barbell-back-squat': 1 }, swaps: [{ slot: 'x', current: 'y', auto: true }] },
      { id: 'b', gymId: g.id, startedAt: 300, imported: false, targets: { 'bicep-curl': { sets: 3, reps: [10, 12], restSec: 60 } } },
      { id: 'c', gymId: g.id, startedAt: 2, importSeq: 2, imported: true, importHash: 'h' },
    ]);
    await v9.table('sets').bulkAdd([
      { id: 's1', sessionId: 'a', exerciseId: 'barbell-back-squat', order: 0, kind: 'warmup', reps: 10, load: { kind: 'barbell', unit: 'kg', total: 20, barWeight: 20, perSide: [] }, uncertain: false },
      { id: 's2', sessionId: 'a', exerciseId: 'barbell-back-squat', order: 1, kind: 'work', reps: 5, load: { kind: 'barbell', unit: 'kg', total: 100, barWeight: 20, perSide: [25, 15], barId: 'olympic' }, uncertain: false, failure: true },
      { id: 's3', sessionId: 'c', exerciseId: 'deadlift', order: 0, kind: 'work', reps: 3, load: { kind: 'barbell', unit: 'kg', total: 140, barWeight: 20, perSide: [25, 20, 10, 5] }, uncertain: true, importMap: { fileName: 'DL', catalogId: null, match: 'none', by: 'name' } },
    ]);
    await v9.table('exerciseSettings').put({ exerciseId: 'barbell-back-squat', gymId: '', restSec: 120, alwaysUse: { 'five-day-split': 'front-squat' } });
    await v9.table('planState').put({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 2, doneDays: [0, 1], partial: { 1: 0.5 } });
    await v9.table('kv').put({ key: 'anygym-drafts', value: '{}', at: 7 });
    await v9.table('journal').put({ id: 'j1', sessionId: 'b', exerciseId: 'bicep-curl', key: 'bicep-curl@0', rev: 1, draft: { id: 'j1', load: null }, at: 1 });
    await v9.table('reportQueue').put({ id: 'r1', createdAt: 3, kind: 'crash', body: {} });
    await v9.table('crashSignatures').put({ signature: 'sig', day: '2026-11-01' });
    await v9.table('reportPreferences').put({ id: 'privacy', sendCrashReports: false });
    const before: Record<string, string> = {};
    for (const t of v9.tables) before[t.name] = JSON.stringify(await t.toArray());
    expect(Object.keys(before)).toHaveLength(17);
    v9.close();

    const up = new AnyGymDB(old);
    await up.open();
    expect(up.verno).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(10); // 11 since PLAN 3.5e (candidateReviews)
    for (const t of Object.keys(before)) expect(JSON.stringify(await up.table(t).toArray()), t).toBe(before[t]);
    for (const t of ['coachLifts', 'coachChanges', 'coachCards', 'efforts']) expect(await up.table(t).count(), t).toBe(0);
    // The new tables work at once.
    await saveEffort('a', 'barbell-back-squat', 'hard', up, 5);
    expect(await effortOf('b', 'barbell-back-squat', up)).toEqual({ effort: null, last: 'hard' });
    up.close();
    await Dexie.delete(old);
  });
});

describe('effort taps', () => {
  it('one per exercise per workout, the last one elsewhere is the default, a second tap can clear it', async () => {
    expect(await effortOf('w1', 'squat', db)).toEqual({ effort: null, last: null });
    await saveEffort('w1', 'squat', 'easy', db, 1);
    await saveEffort('w2', 'squat', 'hard', db, 2);
    await saveEffort('w2', 'bench', 'good', db, 3);
    expect(await effortOf('w3', 'squat', db)).toEqual({ effort: null, last: 'hard' });
    expect(await effortOf('w1', 'squat', db)).toEqual({ effort: 'easy', last: 'hard' });
    await saveEffort('w1', 'squat', 'good', db, 4);
    expect(await effortOf('w1', 'squat', db)).toEqual({ effort: 'good', last: 'hard' });
    await saveEffort('w1', 'squat', null, db);
    expect(await effortOf('w1', 'squat', db)).toEqual({ effort: null, last: 'hard' });
  });
});

const change = (over: Partial<PlannedChange> = {}): PlannedChange => ({ key: 'barbell-back-squat||barbell', exerciseId: 'barbell-back-squat', name: 'Squat', loadKind: 'barbell', unit: 'lb', from: 200, to: 210, reason: '+10 lb: you hit 3 × 12 last week', source: 'level_up', reps: 'low', ...over });

describe('applying, undoing', () => {
  it('a card applies its changes as targets, records old → new, and is marked used', async () => {
    const applied = await applyChanges('levelup:2026-11-02', '2026-11-02', [change(), change({ key: 'b', exerciseId: 'b', from: 135, to: 140 })], db, 10, { b: { estimate: 150, rate: 0.01, scale: 1, at: 10 } });
    expect(applied.records).toHaveLength(2);
    const rows = await coachRows(db);
    expect(rows.cards).toEqual([{ id: 'levelup:2026-11-02', state: 'used', at: 10 }]);
    expect(rows.changes.map((c) => [c.key, c.from, c.to, c.prevTarget])).toEqual(expect.arrayContaining([['barbell-back-squat||barbell', 200, 210, null], ['b', 135, 140, null]]));
    const targets = await coachTargets(db);
    expect(targets.get('barbell-back-squat||barbell')).toEqual({ value: 210, unit: 'lb', loadKind: 'barbell', reason: '+10 lb: you hit 3 × 12 last week', source: 'level_up', setAt: 10, reps: 'low' });
    expect((await db.coachLifts.get('b'))!.learned).toEqual({ estimate: 150, rate: 0.01, scale: 1, at: 10 });
    // Undo of the whole card: targets gone, records gone, the card can show again.
    await undoApplied(applied, db, 11);
    expect((await coachTargets(db)).size).toBe(0);
    expect(await db.coachChanges.count()).toBe(0);
    expect(await db.coachCards.count()).toBe(0);
    expect((await db.coachLifts.get('b'))!.learned).toEqual({ estimate: 150, rate: 0.01, scale: 1, at: 10 });
  });
  it('undo one lift puts back the target it replaced; a newer target is never overwritten', async () => {
    const first = await applyChanges('deload:x', 'x', [change({ to: 180, source: 'deload', until: 99 })], db, 5);
    const second = await applyChanges('levelup:y', 'y', [change({ from: 180, to: 190, source: 'auto' })], db, 6);
    expect(second.records[0]!.prevTarget).toMatchObject({ value: 180, source: 'deload' });
    const undone = await undoChange(second.records[0]!.id, db, 7);
    expect(undone?.undoneAt).toBe(7);
    expect((await coachTargets(db)).get(change().key)).toMatchObject({ value: 180, source: 'deload' });
    // Twice is harmless.
    expect((await undoChange(second.records[0]!.id, db, 8))?.undoneAt).toBe(7);
    expect(await undoChange('nope', db)).toBeUndefined();
    // Undo the older one while a newer target is in place: the newer stays.
    await applyChanges('levelup:z', 'z', [change({ from: 180, to: 195, source: 'level_up' })], db, 9);
    await undoChange(first.records[0]!.id, db, 10);
    expect((await coachTargets(db)).get(change().key)).toMatchObject({ value: 195 });
  });
  it('cards: dismiss and reopen', async () => {
    await closeCard('missed:1', 'dismissed', db, 3);
    expect((await coachRows(db)).cards).toEqual([{ id: 'missed:1', state: 'dismissed', at: 3 }]);
    await reopenCard('missed:1', db);
    expect((await coachRows(db)).cards).toEqual([]);
  });
});

describe('Settings → Coach → Auto level up', () => {
  it('off by default; on keeps the rest of the profile and remembers the first time sheet', async () => {
    await db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1, name: 'Sam', intakeDoneAt: 2 });
    const on = await setAutoLevelUp(true, db, 50);
    expect(on).toMatchObject({ name: 'Sam', intakeDoneAt: 2, coach: { autoLevelUp: true, autoIntroAt: 50 } });
    const off = await setAutoLevelUp(false, db, 60);
    expect(off.coach).toEqual({ autoLevelUp: false, autoIntroAt: 50 });
    expect(await db.profile.count()).toBe(1);
  });
  it('without a profile yet: one is made in the active gym unit', async () => {
    const p = await setAutoLevelUp(true, db, 7);
    expect(p).toEqual({ id: 'me', createdAt: 7, defaultUnit: 'lb', coach: { autoLevelUp: true, autoIntroAt: 7 } });
    await db.gyms.clear();
    await db.profile.clear();
    expect((await setAutoLevelUp(false, db, 8)).defaultUnit).toBe('lb');
  });
});

describe('rebuild the week (ask before changing the plan)', () => {
  it('starts this pass again from day 1; Undo puts it back while nothing moved', async () => {
    expect(await rebuildWeek(db)).toBeUndefined();
    await db.planState.put({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [0, 1, 2], partial: { 2: 0.5 } });
    const r = (await rebuildWeek(db))!;
    expect(r.after).toEqual({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
    expect(await db.planState.get('active')).toEqual(r.after);
    expect(await undoRebuildWeek(r, db)).toBe(true);
    expect(await db.planState.get('active')).toEqual(r.before);
    // Something moved since: Undo changes nothing.
    const again = (await rebuildWeek(db))!;
    await db.planState.put({ ...again.after, nextDayIndex: 1 });
    expect(await undoRebuildWeek(again, db)).toBe(false);
    await db.planState.clear();
    expect(await undoRebuildWeek(again, db)).toBe(false);
    await db.planState.put({ id: 'active', planId: 'no-such-plan', startedAt: 1, weekIndex: 0, nextDayIndex: 1, doneDays: [0] });
    expect(await rebuildWeek(db)).toBeUndefined();
  });
  it('a plateau variation is the plan pick from now on, and can be put back', async () => {
    expect(await setAlwaysUse('barbell-back-squat', 'five-day-split', 'front-squat', db)).toBeUndefined();
    expect((await db.exerciseSettings.get(['barbell-back-squat', '']))!.alwaysUse).toEqual({ 'five-day-split': 'front-squat' });
    expect(await setAlwaysUse('barbell-back-squat', 'five-day-split', undefined, db)).toBe('front-squat');
    expect((await db.exerciseSettings.get(['barbell-back-squat', '']))!.alwaysUse).toBeUndefined();
  });
});

describe('coachData: the coach reads only real, dated, working sets', () => {
  it('builds each lift with its workouts, ranges, taps and setup; imported, warm ups and unfinished are left out', async () => {
    const a = await workout(nov(5), [
      ['barbell-back-squat', 10, bar(45), 'warmup'],
      ['barbell-back-squat', 12, bar(200)],
      ['barbell-back-squat', 12, bar(200)],
      ['barbell-back-squat', 12, bar(200)],
    ]);
    await saveEffort(a.id, 'barbell-back-squat', 'good', db);
    await workout(nov(2), [['barbell-back-squat', 10, bar(195)]]);
    await db.sessions.add({ id: 'imp', gymId: gym.id, startedAt: 3, importSeq: 3, imported: true });
    await db.sets.add({ id: 'imp-0', sessionId: 'imp', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 5, load: bar(300), uncertain: false });
    await db.sessions.add({ id: 'open', gymId: gym.id, startedAt: nov(10), imported: false });
    await db.sets.add({ id: 'open-0', sessionId: 'open', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 5, load: bar(400), uncertain: false });
    const d = await coachData(NOW, db);
    expect(d.active).toBe(true);
    expect(d.dates).toEqual([nov(5), nov(2)]);
    expect(d.lifts).toHaveLength(1);
    const l = d.lifts[0]!;
    expect(l).toMatchObject({ key: 'barbell-back-squat||barbell', exerciseId: 'barbell-back-squat', name: 'Barbell Back Squat', loadKind: 'barbell', pattern: 'squat' });
    expect(l.setup).toMatchObject({ unit: 'lb', base: 45 });
    expect(l.sessions.map((s) => [s.date, s.sets.map((x) => x.reps), s.range, s.effort])).toEqual([
      [nov(5), [12, 12, 12], [8, 12], 'good'],
      [nov(2), [10], [8, 12], undefined],
    ]);
  });
  it('end to end: last week earned → Level up card → applied → a target for the lift', async () => {
    await workout(nov(5), [
      ['barbell-back-squat', 12, bar(200)],
      ['barbell-back-squat', 12, bar(200)],
    ]);
    const d = await coachData(NOW, db);
    const t = coachToday({ now: NOW, lifts: d.lifts, dates: d.dates, changes: d.changes, closed: d.closed, autoLevelUp: false, activeWorkout: d.active });
    expect(t.card?.kind).toBe('level_up');
    if (t.card?.kind !== 'level_up') return;
    await applyChanges(t.card.id, t.card.decision.weekKey, t.card.decision.earned, db, NOW);
    const after = await coachData(NOW + 1, db);
    expect(after.lifts[0]!.target).toMatchObject({ value: 210, source: 'level_up' });
    expect(coachToday({ now: NOW, lifts: after.lifts, dates: after.dates, changes: after.changes, closed: after.closed, autoLevelUp: false, activeWorkout: false }).card).toBeNull();
  });
  it('ranges: built targets, the plan day (a swapped slot too), else the quick default', () => {
    const s = (over: Partial<Session>): Session => ({ id: 'x', gymId: 'g', startedAt: 1, imported: false, ...over });
    expect(rangeFor(s({ targets: { a: { sets: 3, reps: [6, 8], restSec: 90 } } }), 'a')).toEqual([6, 8]);
    expect(rangeFor(s({ targets: { a: { sets: 3, reps: 10, restSec: 90 } } }), 'a')).toEqual([10, 10]);
    expect(rangeFor(s({ targets: { a: { sets: 3, seconds: 30, restSec: 90 } } }), 'a')).toBeNull();
    expect(rangeFor(s({}), 'anything')).toEqual([8, 12]);
    const plan = s({ planId: 'five-day-split', dayId: '1' });
    expect(rangeFor(plan, 'not-in-the-day')).toEqual([8, 12]);
  });
  it('fresh muscles from the last 3 days of working sets with sure muscles; the recovery note needs a plan', async () => {
    await workout(NOW - 5 * 60 * 60 * 1000, [['barbell-back-squat', 5, bar(200)], ['barbell-back-squat', 10, bar(45), 'warmup']]);
    await workout(NOW - 5 * 24 * 60 * 60 * 1000, [['dumbbell-bench-press', 10, { kind: 'dumbbell_each', unit: 'lb', total: 100 }]]);
    const d = await coachData(NOW, db);
    expect(d.fresh).toHaveLength(1);
    expect(d.fresh[0]!.regions).toEqual(primaryRegions('barbell-back-squat'));
    expect(d.fresh[0]!.regions.length).toBeGreaterThan(0);
    expect(d.recovery).toBeUndefined();
    expect(regionWord('quadriceps')).toBe('quads');
    expect(primaryRegions('no-such-exercise')).toEqual([]);
    await db.planState.put({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
    expect((await coachData(NOW, db)).recovery).toMatchObject({ yesterday: [] });
  });
  it('the training days come from the intake', () => {
    expect(weekdaysOf(undefined)).toBeUndefined();
    expect(weekdaysOf({ id: 'me', defaultUnit: 'lb', createdAt: 1, intake: { weekdays: ['mon', 'wed'] } })).toEqual(['mon', 'wed']);
    expect(weekdaysOf({ id: 'me', defaultUnit: 'lb', createdAt: 1, intake: { weekdays: [] } })).toBeUndefined();
  });
});

describe('round 2 (Codex 3.8)', () => {
  it('#3 outcomes are stored once and fold into the lift row scale durably', async () => {
    const [rec] = (await applyChanges('levelup:a', 'a', [change({ source: 'auto' })], db, 10)).records;
    expect(await resolveOutcomes([], db)).toBe(0);
    expect(await resolveOutcomes([{ id: rec!.id, key: rec!.key, outcome: 'miss' }], db, 20)).toBe(1);
    // Judged once: a second resolve changes nothing.
    expect(await resolveOutcomes([{ id: rec!.id, key: rec!.key, outcome: 'miss' }, { id: 'nope', key: 'x', outcome: 'easy' }], db, 21)).toBe(0);
    expect((await db.coachChanges.get(rec!.id))!.outcome).toBe('miss');
    expect((await db.coachLifts.get(rec!.key))!.learned).toMatchObject({ scale: 0.5, at: 20 });
    // A new raise keeps the learned scale (its snapshot never resets it).
    await applyChanges('levelup:b', 'b', [change({ source: 'auto', from: 210, to: 215 })], db, 30, { [rec!.key]: { estimate: 250, rate: 0.01, scale: 1, at: 30 } });
    expect((await db.coachLifts.get(rec!.key))!.learned).toEqual({ estimate: 250, rate: 0.01, scale: 0.5, at: 30 });
    // And the read hands it to the engine.
    await workout(nov(5), [['barbell-back-squat', 12, bar(200)]]);
    expect((await coachData(NOW, db)).lifts[0]!.scale).toBe(0.5);
    // A lift without a row yet gets one.
    await db.coachChanges.put({ ...rec!, id: 'z', key: 'k2', exerciseId: 'deadlift', outcome: undefined });
    await resolveOutcomes([{ id: 'z', key: 'k2', outcome: 'easy' }], db, 40);
    expect((await db.coachLifts.get('k2'))!.learned).toEqual({ estimate: null, rate: null, scale: 1.25, at: 40 });
  });
  it('#2 a replace restore clears the coach tables (they belong to the replaced history); a merge keeps them', async () => {
    await workout(nov(5), [['barbell-back-squat', 12, bar(200)]]);
    const backup = await exportBackup(db, 1);
    await applyChanges('levelup:a', 'a', [change()], db, 10);
    await closeCard('missed:1', 'dismissed', db);
    await saveEffort('w0', 'barbell-back-squat', 'hard', db);
    await restoreMerge(backup, db);
    for (const t of ['coachLifts', 'coachChanges', 'coachCards', 'efforts']) expect(await db.table(t).count(), t).toBeGreaterThan(0);
    await restoreReplace(backup, db);
    for (const t of ['coachLifts', 'coachChanges', 'coachCards', 'efforts']) expect(await db.table(t).count(), t).toBe(0);
    expect(await db.sessions.count()).toBe(1);
  });
});
