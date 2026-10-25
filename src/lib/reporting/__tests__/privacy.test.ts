// SPEC 24: reports never carry workout history, names, emails, gym names or session ids. Seeds
// recognizable private values everywhere they could leak from, then checks what is queued on the
// phone and what goes over the wire.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../../db/schema';
import { getActiveGym } from '../../../db/bootstrap';
import { makeGym } from '../../../db/gyms';
import { enqueueCrash } from '../../../db/reports';
import { exportBackup } from '../../../db/backup';
import { TABLE_NAMES } from '../../backup';
import { buildCrash } from '../capture';
import { buildFeedback, gymFacts } from '../feedback';
import { clearErrors, noteRoute, pushError } from '../diagnostics';
import { createTransport } from '../transport';
import type { CrashPreference } from '../preferences';
import { stubBrowser } from './env';

const SESSION = '7c1e9d2a-5b4f-4e3a-9c8d-1f2e3a4b5c6d';
const PRIVATE = [SESSION, 'Zeta Secret Gym', 'Quentin', 'Privateperson', 'quentin.private@example.com', 'my secret note', 'token=hunter2'];
const on: CrashPreference = { enabled: () => true, ready: async () => true, fresh: async () => true, setEnabled: async () => {}, subscribe: () => () => {} };

let db: AnyGymDB;
let n = 0;

beforeEach(async () => {
  db = new AnyGymDB(`anygym-privacy-${n++}`);
  await db.open();
  const gym = makeGym({ name: 'Zeta Secret Gym', type: 'hotel', unit: 'kg', isActive: true }, 1000);
  await db.gyms.add(gym);
  await db.profile.add({ id: 'me', name: 'Quentin Privateperson', defaultUnit: 'kg', createdAt: 1 });
  await db.sessions.add({ id: SESSION, gymId: gym.id, startedAt: 2000, imported: false });
  await db.sets.add({ id: 's1', sessionId: SESSION, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 5, load: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] }, note: 'my secret note', uncertain: false });
  const win = stubBrowser(`#/workout/${SESSION}`);
  noteRoute(win.location.hash);
  noteRoute('#/settings');
  clearErrors();
  pushError(`TypeError: no set for session ${SESSION} (quentin.private@example.com) at https://rabahharchaoui-design.github.io/anygym/#/workout/${SESSION}?token=hunter2`);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
  vi.unstubAllGlobals();
});

describe('privacy of reports', () => {
  it('queued and transmitted payloads hold only the allowed fields and none of the private values', async () => {
    const gym = await getActiveGym(db);
    const fb = buildFeedback('The timer froze after a set', gymFacts(gym));
    expect(Object.keys(fb).sort()).toEqual(['appVersion', 'device', 'errors', 'gymType', 'message', 'requestId', 'route', 'unit']);
    expect(fb).toMatchObject({ unit: 'kg', gymType: 'hotel', route: '/workout/:id' });

    const err = new Error(`Could not load ${SESSION} for quentin.private@example.com`);
    err.stack = `load@https://rabahharchaoui-design.github.io/anygym/assets/index-Ab12.js?token=hunter2:3:9\n${SESSION}`;
    const cr = buildCrash(err)!;
    await enqueueCrash(cr, Date.now(), db);

    const bodies: string[] = [];
    let online = false;
    const fetch = (async (_url: string, init: RequestInit) => {
      if (!online) throw new TypeError('Load failed');
      bodies.push(String(init.body));
      return new Response('{}', { status: 201 });
    }) as unknown as typeof globalThis.fetch;
    const t = createTransport({ db, fetch, base: 'https://api.test', prefs: on, schedule: () => {} });
    expect(await t.sendFeedback(fb)).toBe('queued');

    const queued = JSON.stringify(await db.reportQueue.toArray());
    online = true;
    await t.drain(true);
    expect(bodies).toHaveLength(2);
    for (const text of [queued, ...bodies]) for (const secret of PRIVATE) expect(text, secret).not.toContain(secret);
    expect(await db.reportQueue.count()).toBe(0);
  });

  it('report tables are never in a backup', async () => {
    await enqueueCrash(buildCrash(new Error('x'))!, Date.now(), db);
    for (const t of ['reportQueue', 'crashSignatures', 'reportPreferences']) expect(TABLE_NAMES as readonly string[]).not.toContain(t);
    const backup = await exportBackup(db, Date.now(), null);
    expect(Object.keys(backup.tables)).not.toContain('reportQueue');
    expect(JSON.stringify(backup)).not.toContain('crashSignatures');
  });
});
