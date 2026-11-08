// Tester strengthening of PLAN 3.8b (bughunt 1108-0142 #7): through the real submitRow path (draft, journal, write),
// including a journal that was adopted after a lost write, the gym of the tap survives a gym switch.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { previewGymSwitch, switchGym } from '../gymSwitch';
import { setsOf, startWorkout } from '../workouts';
import { saveDraft, type Draft } from '../../lib/drafts';
import { createLogQueue } from '../../lib/logQueue';
import { rowKey } from '../../lib/setTable';
import { adoptJournal, committedOf, journalOf, submitRow } from '../../screens/workout/rowLog';
import type { Gym, Load } from '../types';

let db: AnyGymDB;
let home: Gym;
let away: Gym;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`verify-3.8b-${n++}`);
  await db.open();
  home = makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }, 1);
  away = makeGym({ name: 'Away', type: 'full', unit: 'lb' }, 2);
  await db.gyms.bulkAdd([home, away]);
});
afterEach(async () => { await db.delete(); });
const phone = () => { const d = new Map<string, string>(); return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), removeItem: (k: string) => void d.delete(k) }; };
const pin: Load = { kind: 'stack', unit: 'lb', total: 50, stackValue: 50, added: 0 };

describe('verify 3.8b gym of the tap', () => {
  it('submitRow after a gym switch keeps the tapped gym on the saved set', async () => {
    const s = await startWorkout(home.id, db, 1000);
    const storage = phone();
    const draft: Draft = { id: 'row1', load: pin, reps: 8, type: 'normal', rev: 1, submitted: 1, gymId: home.id };
    saveDraft(s.id, rowKey('lat-pulldown', 0), draft, storage);
    const preview = await previewGymSwitch(away.id, db);
    await switchGym(away.id, preview.workout!.fp, db, 1200);
    expect(await submitRow(s.id, 'lat-pulldown', draft, { db, storage, queue: createLogQueue() })).toBe(true);
    const sets = await setsOf(s.id, db);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.gymId).toBe(home.id);
  });

  it('a draft without a gym (older version) still saves with no stamp', async () => {
    const s = await startWorkout(home.id, db, 1000);
    const storage = phone();
    const draft: Draft = { id: 'row2', load: pin, reps: 8, type: 'normal', rev: 1, submitted: 1 };
    saveDraft(s.id, rowKey('lat-pulldown', 0), draft, storage);
    expect(await submitRow(s.id, 'lat-pulldown', draft, { db, storage, queue: createLogQueue() })).toBe(true);
    expect((await setsOf(s.id, db))[0]!.gymId).toBeUndefined();
  });

  it('the journal entry carries the gym, so an adopted lost write is still re-homed correctly', async () => {
    const s = await startWorkout(home.id, db, 1000);
    const { gymId: _g, ...values } = { id: 'row3', load: pin, reps: 8, type: 'normal', rev: 1, gymId: home.id } as Draft;
    await db.journal.put({ id: 'row3', sessionId: s.id, exerciseId: 'lat-pulldown', key: rowKey('lat-pulldown', 0), rev: 1, draft: { ...values, gymId: home.id }, at: 1 });
    const storage = phone();
    expect(adoptJournal(s.id, await journalOf(s.id, db), await committedOf(s.id, db), { db, storage })).toBe(true);
    // (A real switch is refused while a journal entry is pending; the session moved some other way, e.g. after a recovery.)
    await db.sessions.update(s.id, { gymId: away.id });
    const { sessionDrafts } = await import('../../lib/drafts');
    const adopted = [...sessionDrafts(s.id, storage)][0]![1];
    expect(adopted.gymId).toBe(home.id);
    expect(await submitRow(s.id, 'lat-pulldown', adopted, { db, storage, queue: createLogQueue() })).toBe(true);
    expect((await setsOf(s.id, db))[0]!.gymId).toBe(home.id);
  });
});
