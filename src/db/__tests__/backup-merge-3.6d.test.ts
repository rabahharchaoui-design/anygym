// PLAN 3.6d (audit A8): Merge never brings the same imported history in twice. An import gives each
// workout a new id, so the ids of two phones that imported the same file never match: the import
// hash is what says it is the same workout (the same check Import itself makes).
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym, machineStartFor } from '../gyms';
import { importedHashes, writeImport } from '../importHistory';
import { exportBackup, restoreMerge } from '../backup';
import { parseBackup, serializeBackup } from '../../lib/backup';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { parseImportText } from '../../lib/import/anygymImportV1';
import { planImport, type LoadContext, type ReviewChoices } from '../../lib/import/importPlan';
import { loadSetupFor, machineIdFor } from '../../screens/workout/exerciseLoad';
import type { Gym } from '../types';

const FIXTURE = readFileSync(join(__dirname, '../../lib/import/__tests__/fixtures/synthetic-import-v1.json'), 'utf8');
const answers: ReviewChoices = { picks: { 3: 'dumbbell-bench-press' }, kinds: { 2: 'dumbbell_each' }, edits: {} };

const dbs: AnyGymDB[] = [];
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete();
});
async function newPhone(): Promise<{ db: AnyGymDB; gym: Gym }> {
  const db = new AnyGymDB(`b36d-merge-${Math.random()}`);
  dbs.push(db);
  await db.open();
  const gym = makeGym({ name: 'Club', type: 'full', unit: 'lb', isActive: true }, 1);
  await db.gyms.add(gym);
  return { db, gym };
}

async function importFixture(db: AnyGymDB, gym: Gym) {
  const parsed = parseImportText(FIXTURE);
  if (!parsed.ok) throw new Error(parsed.error);
  const contextFor = (id: string, name: string): LoadContext => ({
    gymUnit: gym.unit,
    olympic: gym.bars.olympic,
    smith: gym.bars.smith,
    machineStart: machineStartFor(gym, machineIdFor(id, name)),
    setupFor: (kind) => ({ unit: gym.unit, ...loadSetupFor(gym, kind, id, name) }),
  });
  const plan = planImport(parsed, answers, { planExercises: PLAN_EXERCISES, contextFor, existing: await importedHashes(db) });
  return writeImport(plan.sessions, gym.id, plan.fills, db);
}

describe('A8: Merge and imported history', () => {
  it('the same history imported on both phones is there once after Merge; the real workouts still come', async () => {
    const old = await newPhone();
    const imported = await importFixture(old.db, old.gym);
    await old.db.sessions.add({ id: 'real', gymId: old.gym.id, startedAt: 5000, endedAt: 6000, imported: false });
    await old.db.sets.add({ id: 'real-1', sessionId: 'real', exerciseId: 'bench', order: 0, kind: 'work', uncertain: false, reps: 5 });
    const parsed = parseBackup(serializeBackup(await exportBackup(old.db)));
    if (!parsed.ok) throw new Error(parsed.error);

    const fresh = await newPhone();
    await importFixture(fresh.db, fresh.gym);
    const before = { sessions: await fresh.db.sessions.count(), sets: await fresh.db.sets.count() };
    const r = await restoreMerge(parsed.backup, fresh.db);

    expect(r).toEqual({ workouts: 1, sets: 1 });
    expect(await fresh.db.sessions.count()).toBe(before.sessions + 1);
    expect(await fresh.db.sets.count()).toBe(before.sets + 1);
    const hashes = (await fresh.db.sessions.filter((s) => s.imported).toArray()).map((s) => s.importHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(hashes).toHaveLength(imported.sessionIds.length);
  });

  it('history imported only on the old phone comes in whole', async () => {
    const old = await newPhone();
    const imported = await importFixture(old.db, old.gym);
    const parsed = parseBackup(serializeBackup(await exportBackup(old.db)));
    if (!parsed.ok) throw new Error(parsed.error);
    const fresh = await newPhone();
    const r = await restoreMerge(parsed.backup, fresh.db);
    expect(r).toEqual({ workouts: imported.sessionIds.length, sets: imported.sets });
  });
});
