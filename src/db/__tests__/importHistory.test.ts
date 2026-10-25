import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ANY_GYM } from '../types';
import { makeGym, machineStartFor } from '../gyms';
import { importedHashes, undoImport, writeImport } from '../importHistory';
import { getPastSessions, lastSessionSets, listFinished } from '../history';
import { finishWorkout, getActiveSession, logSet, startWorkout } from '../workouts';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { parseImportText, type ParsedImport } from '../../lib/import/anygymImportV1';
import { planImport, type LoadContext, type ReviewChoices } from '../../lib/import/importPlan';
import { loadSetupFor, machineIdFor } from '../../screens/workout/exerciseLoad';
import { progress } from '../../lib/progression';

const FIXTURE = readFileSync(join(__dirname, '../../lib/import/__tests__/fixtures/synthetic-import-v1.json'), 'utf8');

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-import-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const gym = makeGym({ name: 'Test gym', type: 'full', unit: 'lb' }, 1);
const contextFor = (id: string, name: string): LoadContext => ({
  gymUnit: gym.unit,
  olympic: gym.bars.olympic,
  smith: gym.bars.smith,
  machineStart: machineStartFor(gym, machineIdFor(id, name)),
  setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, id, name) }),
});
const parsed = (): ParsedImport => {
  const p = parseImportText(FIXTURE);
  if (!p.ok) throw new Error(p.error);
  return p;
};
const answers: ReviewChoices = { picks: { 3: 'dumbbell-bench-press' }, kinds: { 2: 'dumbbell_each' }, edits: {} };
const planFor = async (existing?: Set<string>) =>
  planImport(parsed(), answers, { planExercises: PLAN_EXERCISES, contextFor, existing: existing ?? (await importedHashes(db)) });

describe('writeImport', () => {
  it('writes imported sessions in file order, sets exactly as planned, no dates', async () => {
    const plan = await planFor();
    const r = await writeImport(plan.sessions, gym.id, plan.fills, db);
    expect(r.sets).toBe(16);
    expect(r.sessionIds).toHaveLength(5);
    const sessions = await db.sessions.bulkGet(r.sessionIds);
    expect(sessions.map((s) => [s!.imported, s!.importSeq, s!.startedAt, s!.gymId])).toEqual([
      [true, 1, 1, gym.id],
      [true, 2, 2, gym.id],
      [true, 3, 3, gym.id],
      [true, 4, 4, gym.id],
      [true, 5, 5, gym.id],
    ]);
    expect(sessions.every((s) => s!.endedAt === undefined && !!s!.importHash)).toBe(true);
    expect(sessions[1]!.note).toBe('Felt strong');
    const sets = await db.sets.where('sessionId').equals(r.sessionIds[2]!).sortBy('order');
    expect(sets.map((s) => [s.order, s.kind, s.reps, s.load?.total, s.load?.unit])).toEqual([
      [0, 'work', 12, 50, 'lb'],
      [1, 'work', 12, 50, 'lb'],
      [2, 'work', 10, 55, 'lb'],
      [3, 'drop', 6, 30, 'lb'],
      [4, 'work', 10, 20, 'kg'],
    ]);
    expect(sets[1]!.note).toBe('slow');
    // The reps only set is kept, unsure, with no load.
    const lunge = await db.sets.where('sessionId').equals(r.sessionIds[3]!).sortBy('order');
    expect(lunge[2]).toMatchObject({ reps: 10, uncertain: true });
    expect(lunge[2]!.load).toBeUndefined();
    // The answer for an exercise with no load type is filled in (free weights: every gym).
    expect((await db.exerciseSettings.get(['wide-lunge', ANY_GYM]))?.loadType).toBe('dumbbell_each');
    // Imported sessions are never the workout in progress, and they show in History.
    expect(await getActiveSession(db)).toBeUndefined();
    expect((await listFinished(db)).map((f) => f.sets)).toEqual([2, 3, 5, 3, 3]);
  });

  it('is idempotent: the same file twice writes nothing the second time', async () => {
    const first = await planFor();
    await writeImport(first.sessions, gym.id, first.fills, db);
    const again = await planFor();
    expect(again.already).toBe(5);
    expect(again.sets).toBe(0);
    // Even when the same sessions are passed again, nothing is duplicated (hash per session).
    const r = await writeImport(first.sessions, gym.id, first.fills, db);
    expect(r).toEqual({ sessionIds: [], sets: 0, filled: [] });
    expect(await db.sessions.count()).toBe(5);
    expect(await db.sets.count()).toBe(16);
  });

  it('is one transaction: a failing write leaves nothing behind', async () => {
    const plan = await planFor();
    const bad = [...plan.sessions, { hash: 'x', exerciseId: 'y', sets: [{ kind: 'work' as const, reps: 1, uncertain: false, load: { kind: 'stack' as const, unit: 'lb' as const, total: 1 } }] }];
    // Make the last one collide on a primary key mid write.
    const orig = db.sets.bulkAdd.bind(db.sets);
    let calls = 0;
    db.sets.bulkAdd = ((rows: Parameters<typeof orig>[0]) => {
      calls += 1;
      if (calls === bad.length) throw new Error('disk full');
      return orig(rows);
    }) as typeof db.sets.bulkAdd;
    await expect(writeImport(bad, gym.id, plan.fills, db)).rejects.toThrow('disk full');
    db.sets.bulkAdd = orig;
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
    expect(await db.exerciseSettings.count()).toBe(0);
  });

  it('a second import goes after the first; answers already given are never overridden', async () => {
    await db.exerciseSettings.put({ exerciseId: 'wide-lunge', gymId: ANY_GYM, loadType: 'single', note: 'mine' });
    const p = await planFor();
    const one = await writeImport(p.sessions.slice(0, 2), gym.id, p.fills, db);
    const two = await writeImport(p.sessions.slice(2), gym.id, p.fills, db);
    expect((await db.sessions.bulkGet(two.sessionIds)).map((s) => s!.importSeq)).toEqual([3, 4, 5]);
    expect(one.filled).toEqual([]);
    expect(two.filled).toEqual([]);
    expect((await db.exerciseSettings.get(['wide-lunge', ANY_GYM]))?.loadType).toBe('single');
  });

  it('undo deletes exactly that import: its sessions, sets and filled answers', async () => {
    const real = await startWorkout(gym.id, db, Date.UTC(2026, 9, 20));
    await logSet({ id: 'r1', sessionId: real.id, exerciseId: 'cable-tricep-pushdown', reps: 12, load: { kind: 'stack', unit: 'lb', total: 60, stackValue: 60 } }, db);
    await finishWorkout(real.id, db, Date.UTC(2026, 9, 20, 1));
    await db.exerciseSettings.put({ exerciseId: 'other', gymId: gym.id, barId: 'smith' });
    const p = await planFor();
    const smithFill = { exerciseId: 'barbell-back-squat', barId: 'smith' as const };
    const r = await writeImport(p.sessions, gym.id, [...p.fills, smithFill], db);
    expect(r.filled.map((f) => f.field)).toEqual(['loadType', 'barId']);
    await db.exerciseSettings.update(['wide-lunge', ANY_GYM], { restSec: 60 });
    await undoImport(r, db);
    expect(await db.sessions.count()).toBe(1);
    expect(await db.sets.count()).toBe(1);
    expect(await db.exerciseSettings.get(['barbell-back-squat', gym.id])).toBeUndefined();
    expect(await db.exerciseSettings.get(['wide-lunge', ANY_GYM])).toEqual({ exerciseId: 'wide-lunge', gymId: ANY_GYM, restSec: 60 });
    expect(await db.exerciseSettings.get(['other', gym.id])).toBeDefined();
    // Undo twice is harmless.
    await undoImport({ ...r, filled: [{ key: ['gone', ANY_GYM], field: 'loadType', value: 'stack' }] }, db);
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('undoImport keeps answers changed since', () => {
  it('a filled answer changed after the import survives Undo; an untouched one goes', async () => {
    const p = await planFor();
    const r = await writeImport(p.sessions, gym.id, [...p.fills, { exerciseId: 'barbell-back-squat', barId: 'smith' }], db);
    expect(r.filled).toEqual([
      { key: ['wide-lunge', ANY_GYM], field: 'loadType', value: 'dumbbell_each' },
      { key: ['barbell-back-squat', gym.id], field: 'barId', value: 'smith' },
    ]);
    await db.exerciseSettings.update(['wide-lunge', ANY_GYM], { loadType: 'single' });
    await undoImport(r, db);
    expect((await db.exerciseSettings.get(['wide-lunge', ANY_GYM]))?.loadType).toBe('single');
    expect(await db.exerciseSettings.get(['barbell-back-squat', gym.id])).toBeUndefined();
    expect(await db.sessions.count()).toBe(0);
  });
});

describe('imported history feeds Last time and Next (SPEC 6)', () => {
  it('the newest imported session is Last time; real workouts come after imported ones', async () => {
    const p = await planFor();
    await writeImport(p.sessions, gym.id, p.fills, db);
    const past = await getPastSessions('barbell-back-squat', gym.id, 'barbell', 6, { db });
    // Newest first: session 2 then session 1; working sets only; the unsure set left out.
    expect(past.map((s) => s.sets.map((x) => x.reps))).toEqual([[8, 8], [8, 8]]);
    expect(past.map((s) => s.date)).toEqual([2, 1]);
    const last = await lastSessionSets('barbell-back-squat', gym.id, 'barbell', { db });
    expect(last?.sets.map((x) => x.load.total)).toEqual([185, 185]);
    const next = progress({ exerciseId: 'barbell-back-squat', loadKind: 'barbell', unit: 'lb', gym: loadSetupFor(gym, 'barbell', 'barbell-back-squat', 'Barbell Back Squat'), repRange: [6, 8], history: past });
    expect(next.lastTime?.sets.map((s) => s.load.total)).toEqual([185, 185]);
    expect(next.next.kind).toBe('increase');

    // Machines are per gym: the cable history is at this gym only.
    expect(await getPastSessions('cable-tricep-pushdown', gym.id, 'stack', 6, { db })).toHaveLength(1);
    expect(await getPastSessions('cable-tricep-pushdown', 'other-gym', 'stack', 6, { db })).toHaveLength(0);
    // Free weights are shared across gyms.
    expect(await getPastSessions('wide-lunge', 'other-gym', 'dumbbell_each', 6, { db })).toHaveLength(1);

    const real = await startWorkout(gym.id, db, Date.UTC(2026, 9, 20));
    await logSet({ id: 'r1', sessionId: real.id, exerciseId: 'barbell-back-squat', reps: 5, load: { kind: 'barbell', unit: 'lb', total: 225, barWeight: 45, perSide: [45, 45], barId: 'olympic' } }, db);
    await finishWorkout(real.id, db, Date.UTC(2026, 9, 20, 1));
    expect((await lastSessionSets('barbell-back-squat', gym.id, 'barbell', { db }))?.sets.map((x) => x.load.total)).toEqual([225]);
  });
});
