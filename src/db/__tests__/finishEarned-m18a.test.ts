// PLAN M18a: "what did this workout earn" through the real save path, and the badges awarded on save.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listBadges } from '../badges';
import { exportBackup, restoreReplace } from '../backup';
import { awardOnSave, workoutEarned } from '../finishEarned';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { finishWorkout, logSet, reopenWorkout, startWorkout } from '../workouts';
import { parseBackup } from '../../lib/backup';

const ORIGINAL_TZ = process.env.TZ;
let db: AnyGymDB;
let name = '';
let n = 0;
beforeEach(async () => {
  process.env.TZ = 'Europe/Paris';
  name = `anygym-earned-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  await db.delete();
});

const MIN = 60_000;
const SQUAT = 'barbell-back-squat';
const nameOf = (id: string) => (id === SQUAT ? 'Barbell Back Squat' : id);
const bar = (total: number): Load => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });
const local = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();
let k = 0;
async function workout(at: number, reps: number[], weight = 135, minutes = 45, gymId = 'g1') {
  const s = await startWorkout(gymId, db, at);
  for (const r of reps) await logSet({ id: `e${++k}`, sessionId: s.id, exerciseId: SQUAT, reps: r, load: bar(weight), kind: 'work' }, db);
  await finishWorkout(s.id, db, at + minutes * MIN);
  return s.id;
}
const earned = (id: string) => workoutEarned(id, nameOf, 'lb', db);

describe('workoutEarned', () => {
  it('the first workout: stats, week 1 of 3, no streak yet, no PR (no history), first-workout and lifted 1k badges', async () => {
    const id = await workout(local(11, 23, 6), [5, 5, 5], 135, 52);
    const e = (await earned(id))!;
    expect(e.time).toEqual({ minutes: 52, words: '52 min' });
    expect(e.sets).toBe(3);
    expect(e.lifted).toBe(2025);
    expect(e.week).toEqual({ count: 1, goal: 3, complete: false });
    expect(e.streakWeeks).toBe(0);
    expect(e.prs).toEqual([]);
    expect(e.badges.map((b) => b.id)).toEqual(['first-workout', 'early-bird', 'lifted-t1']);
    expect(e.badges.every((b) => b.earnedAt === local(11, 23, 6) + 52 * MIN && b.sessionId === id)).toBe(true);
  });
  it('a PR: one row per lift from the existing record rule, and the new-pr badge once', async () => {
    await workout(local(11, 23), [5, 5]);
    const id = await workout(local(11, 25), [5, 7, 6]);
    const e = (await earned(id))!;
    expect(e.prs).toHaveLength(1);
    expect(e.prs[0]).toMatchObject({ exerciseId: SQUAT, name: 'Barbell Back Squat' });
    expect(e.prs[0]!.record.setText).toBe('135 lb × 7');
    expect(e.badges.map((b) => b.id)).toContain('new-pr');
    const next = await workout(local(11, 26), [5, 9]);
    expect((await earned(next))!.badges.map((b) => b.id)).not.toContain('new-pr'); // already owned
  });
  it('the week fills to the goal (3 with no plan) and week-complete is earned on the third', async () => {
    await workout(local(11, 23), [5]);
    await workout(local(11, 25), [5]);
    const id = await workout(local(11, 27), [5]);
    const e = (await earned(id))!;
    expect(e.week).toEqual({ count: 3, goal: 3, complete: true });
    expect(e.streakWeeks).toBe(1);
    expect(e.badges.map((b) => b.id)).toContain('week-complete');
  });
  it('the comeback after 14 days off; new-city from the gym’s town', async () => {
    await db.gyms.put({ id: 'tokyo', name: 'Hotel', city: 'Tokyo' } as never);
    await workout(local(11, 1), [5]);
    const id = await workout(local(11, 16), [5], 135, 45, 'tokyo');
    expect((await earned(id))!.badges.map((b) => b.id)).toEqual(expect.arrayContaining(['new-city', 'comeback']));
  });
  it('never awarded twice: a double read, Finish then Undo then Finish, and awardOnSave all keep the first', async () => {
    const id = await workout(local(11, 23), [5]);
    const first = (await earned(id))!.badges;
    expect(await awardOnSave(id, db)).toEqual(first);
    expect((await earned(id))!.badges).toEqual(first);
    expect(await reopenWorkout(id, undefined, db)).toBe(true);
    await logSet({ id: 'again', sessionId: id, exerciseId: SQUAT, reps: 5, load: bar(135), kind: 'work' }, db);
    await finishWorkout(id, db, local(11, 23) + 80 * MIN);
    // What it already had keeps its first date; a badge the longer workout now reaches is added once.
    const after = (await earned(id))!.badges;
    for (const b of first) expect(after).toContainEqual(b);
    expect(after.map((b) => b.id)).toEqual(['first-workout', 'lifted-t1']);
    expect((await earned(id))!.badges).toEqual(after);
    expect((await listBadges(db)).length).toBe(after.length);
  });
  it('a reload during Finish (saved, never read): the next read awards it with the save’s date', async () => {
    const id = await workout(local(11, 23), [5]);
    db.close();
    db = new AnyGymDB(name);
    await db.open();
    expect((await earned(id))!.badges[0]).toEqual({ id: 'first-workout', earnedAt: local(11, 23) + 45 * MIN, sessionId: id });
  });
  it('after a restore from backup the badges are the same and not awarded again', async () => {
    await db.gyms.put({ id: 'g1', name: 'Club', type: 'full', unit: 'lb', equipment: ['barbell'], dumbbellRange: null, bars: { olympic: 45, womens: 35, ez_curl: null, trap: null, smith: null }, stackStep: 10, equipmentWeights: {}, plateInventory: [{ weight: 45, enabled: true }], collars: 'none', plateColors: 'black', isActive: true, createdAt: 1 } as never);
    const id = await workout(local(11, 23), [5]);
    const before = (await earned(id))!.badges;
    const parsed = parseBackup(JSON.stringify(await exportBackup(db, local(11, 24))));
    if (!parsed.ok) throw new Error(parsed.error);
    await db.badges.clear();
    await restoreReplace(parsed.backup, db);
    expect(await listBadges(db)).toEqual(before);
    expect((await earned(id))!.badges).toEqual(before);
  });
  it('earns nothing while going, for warm ups alone, or for an imported workout (and no Time for it)', async () => {
    const going = await startWorkout('g1', db, local(11, 23));
    await logSet({ id: 'g', sessionId: going.id, exerciseId: SQUAT, reps: 5, load: bar(135), kind: 'work' }, db);
    expect(await earned(going.id)).toBeUndefined();
    await finishWorkout(going.id, db, local(11, 23) + MIN);
    const warm = await startWorkout('g1', db, local(11, 24));
    await logSet({ id: 'w', sessionId: warm.id, exerciseId: SQUAT, reps: 5, load: bar(45), kind: 'warmup' }, db);
    await finishWorkout(warm.id, db, local(11, 24) + MIN);
    expect((await earned(warm.id))!.badges).toEqual([]);
    await db.sessions.put({ id: 'imp', gymId: 'g1', startedAt: 4, importSeq: 4, imported: true });
    await db.sets.put({ id: 'imp-1', sessionId: 'imp', exerciseId: SQUAT, order: 0, kind: 'work', reps: 5, uncertain: false, load: bar(500) });
    const imp = (await earned('imp'))!;
    expect(imp.time).toBeNull();
    expect(imp.badges).toEqual([]);
    expect(imp.week.count).toBe(0);
  });
  it('awardOnSave never throws', async () => {
    db.close();
    expect(await awardOnSave('missing', db)).toEqual([]);
  });
});
