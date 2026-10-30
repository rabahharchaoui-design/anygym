// Independent verification of PLAN 2.0c (tester): groups E (legacy Smith vs unit change, equipment
// answers across units) and F (Retry-After in the queue). Synthetic data only.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym, defaultBars, defaultStackStep } from '../gyms';
import type { Gym, Load } from '../types';
import { getPastSessions, lastSessionSets, workoutRecords } from '../history';
import { setEquipmentWeight, setGymUnit } from '../equipment';
import { finishWorkout, logSet, startWorkout } from '../workouts';
import { claimNext, enqueueFeedback, nextDue } from '../reports';
import { createTransport } from '../../lib/reporting/transport';
import type { CrashPreference } from '../../lib/reporting/preferences';
import type { FeedbackPayload } from '../../lib/reporting/types';
import { stubBrowser } from '../../lib/reporting/__tests__/env';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  stubBrowser();
  db = new AnyGymDB(`anygym-verify-2.0c-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
  vi.unstubAllGlobals();
});

const gym = async (smith: number | null, unit: 'lb' | 'kg' = 'lb'): Promise<Gym> => {
  const g0 = makeGym({ name: 'G', type: 'full', unit }, 1);
  const g = { ...g0, bars: { ...g0.bars, smith } };
  await db.gyms.add(g);
  return g;
};
async function wk(gymId: string, at: number, ex: string, sets: Array<{ id: string; load: Load }>) {
  const s = await startWorkout(gymId, db, at);
  for (const x of sets) await logSet({ id: x.id, sessionId: s.id, exerciseId: ex, reps: 5, load: x.load }, db);
  await finishWorkout(s.id, db, at + 1);
  return s;
}
const smithLegacy = (id: string, per: number): { id: string; load: Load } => ({ id, load: { kind: 'barbell', unit: 'lb', total: per * 2, barWeight: 0, perSide: [per] } });

describe('E: legacy Smith sets stay out of Olympic history through unit changes (both ways)', () => {
  it('lb -> kg -> lb at the same gym: LAST TIME, history and records never see them as Olympic', async () => {
    const g = await gym(0);
    await wk(g.id, 1000, 'barbell-bench-press', [smithLegacy('a', 45), smithLegacy('b', 55)]);
    await wk(g.id, 2000, 'barbell-back-squat', [smithLegacy('c', 65)]);
    const o = { db, defaultBar: 'olympic' as const };
    expect(await getPastSessions('barbell-bench-press', g.id, 'barbell', 6, o)).toEqual([]);
    await setGymUnit(g.id, 'kg', db);
    expect(await getPastSessions('barbell-bench-press', g.id, 'barbell', 6, o)).toEqual([]);
    expect(await lastSessionSets('barbell-bench-press', g.id, 'barbell', o)).toBeNull();
    await setGymUnit(g.id, 'lb', db);
    expect(await getPastSessions('barbell-bench-press', g.id, 'barbell', 6, o)).toEqual([]);
    expect(await lastSessionSets('barbell-back-squat', g.id, 'barbell', o)).toBeNull();
    // Records of a new Olympic session are not compared against them.
    const now = await startWorkout(g.id, db, 9000);
    await logSet({ id: 'n1', sessionId: now.id, exerciseId: 'barbell-bench-press', reps: 5, load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, barId: 'olympic', perSide: [25] } }, db);
    await finishWorkout(now.id, db, 9001);
    expect(await workoutRecords(now.id, () => 'Bench', db)).toEqual([]);
    // Still intact as Smith history, totals unchanged.
    const smith = await getPastSessions('barbell-bench-press', g.id, 'barbell', 6, { ...o, smith: true });
    expect(smith.flatMap((p) => p.sets.map((s) => s.load.total))).toEqual([90, 110]);
    for (const id of ['a', 'b', 'c']) expect((await db.sets.get(id))!.load!.barId).toBe('smith');
  });

  it('with no Smith answer the gym cannot have had a Smith bar: legacy sets keep the exercise bar after a unit change', async () => {
    const g = await gym(null);
    await wk(g.id, 1000, 'barbell-bench-press', [{ id: 'x', load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } }]);
    await setGymUnit(g.id, 'kg', db);
    expect((await db.sets.get('x'))!.load!.barId).toBe('olympic');
  });
});

describe('E: equipment answers do not carry a lb number into kg (reset to defaults / unknown)', () => {
  it('bars, stack step, starting weights, plates', async () => {
    const g = await gym(0);
    await setEquipmentWeight(g.id, 'ez_curl_bar', { kind: 'bar_weight', value: 25 }, db, 'lb');
    await setEquipmentWeight(g.id, 'trap_bar', { kind: 'bar_weight', value: 55 }, db, 'lb');
    await setEquipmentWeight(g.id, 'leg-press', { kind: 'starting_resistance', value: 100 }, db, 'lb');
    await db.gyms.update(g.id, { stackStep: 12.5 });
    const kg = await setGymUnit(g.id, 'kg', db);
    expect(kg.bars).toEqual(defaultBars('kg'));
    expect(kg.bars.ez_curl).toBeNull();
    expect(kg.bars.trap).toBeNull();
    expect(kg.bars.smith).toBeNull();
    expect(kg.stackStep).toBe(defaultStackStep('kg'));
    expect(kg.equipmentWeights).toEqual({});
    expect(JSON.stringify(kg.plateInventory)).not.toMatch(/"size":(45|35|25|10)\b[^}]*"unit":"lb"/);
    // Reset is by design (not converted): answers must be asked again.
  });
});

describe('F: Retry-After edge cases in the queue', () => {
  const device = { model: 'iPhone', os: 'iOS 18.2', viewport: '393x852', dpr: 3, standalone: false };
  const fb = (id: string): FeedbackPayload => ({ requestId: id, message: 'x', appVersion: '0.1.0+dev', route: '/', device, unit: 'kg', gymType: 'full', errors: [] });
  const prefs: CrashPreference = { enabled: () => true, ready: async () => true, fresh: async () => true, setEnabled: async () => {}, subscribe: () => () => {} };
  const run = async (retryAfter: string | null, forcedAt: number[]) => {
    let clock = 1_000_000;
    const ids: string[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => {
      ids.push(JSON.parse(String(init.body)).requestId);
      return new Response('{}', { status: 429, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } });
    }) as unknown as typeof fetch;
    const mk = () => createTransport({ db, fetch: fetcher, base: 'https://api.test', now: () => clock, prefs, schedule: () => {} });
    await enqueueFeedback(fb('q1'), clock, db);
    await mk().drain(true);
    for (const at of forcedAt) {
      clock = at;
      await mk().drain(true); // a fresh transport = an app restart
    }
    return { ids, row: await db.reportQueue.get('q1') };
  };

  it('120: a restarted app forcing a drain at +119 s sends nothing, at +120 s it sends the same id', async () => {
    const early = await run('120', [1_119_000]);
    expect(early.ids).toEqual(['q1']);
    expect(early.row!.nextAttemptAt).toBeGreaterThanOrEqual(1_120_000);
    expect(await nextDue(db)).toBeGreaterThanOrEqual(1_120_000);
    expect(await claimNext(Infinity, db, new Set(), 1_119_999)).toBeUndefined();
    expect((await claimNext(Infinity, db, new Set(), 1_120_000))?.id).toBe('q1');
  });

  it('absurd or malformed values never wedge the queue forever or retry early', async () => {
    for (const v of ['99999999', '0', '-5', 'abc', 'Wed, 21 Oct 2026 07:28:00 GMT', '1.5', '']) {
      await db.reportQueue.clear();
      const r = await run(v, []);
      const next = r.row!.nextAttemptAt;
      expect(next, `Retry-After "${v}"`).toBeGreaterThan(1_000_000);
      expect(next - 1_000_000, `Retry-After "${v}" capped to 1 h`).toBeLessThanOrEqual(3_600_000);
    }
  });
});
