// PLAN 3.9: gym presets, the gyms list writes, and switching gyms in the middle of a workout.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECORD_CHECKS } from '../../lib/backup';
import { GYM_PRESETS, cleanGymName, equipmentSummary, gymLine, recentGyms } from '../../lib/gymPresets';
import { makeGym } from '../gyms';
import { GymInUseError, LastGymError, addGym, deleteGym, gymInUse, setGymDetails, setGymEquipment, undoDeleteGym } from '../gymList';
import { SwitchStaleError, SwitchUndoStaleError, previewGymSwitch, switchGym, undoGymSwitch } from '../gymSwitch';
import { getPastSessions } from '../history';
import { AnyGymDB } from '../schema';
import { EQUIPMENT_IDS, type Gym, type Load } from '../types';
import { finishWorkout, logSet, startPlanDay } from '../workouts';

const PLAN = 'five-day-split';
let db: AnyGymDB;
let n = 0;
let full: Gym;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-gyms39-${n++}`);
  await db.open();
  full = makeGym({ name: 'Full', type: 'full', unit: 'lb', isActive: true });
  await db.gyms.add(full);
});
afterEach(async () => {
  await db.delete();
});
const load: Load = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const log = (id: string, sessionId: string, exerciseId: string) => logSet({ id, sessionId, exerciseId, reps: 10, load }, db);

describe('presets', () => {
  it('SPEC 19 order, five of them', () => {
    expect(GYM_PRESETS.map((p) => p.label)).toEqual(['Hotel gym', 'Full gym', 'Home', 'Outdoors', 'No equipment']);
  });

  it('a new gym starts with its preset equipment only, the name and city cleaned, not active', async () => {
    const hotel = await addGym({ preset: 'hotel', name: '  Hotel   in  Tokyo ', city: ' Tokyo ', unit: 'kg' }, db);
    expect(hotel).toMatchObject({ name: 'Hotel in Tokyo', city: 'Tokyo', type: 'hotel', unit: 'kg', isActive: false });
    expect(hotel.equipment).toEqual(makeGym({ name: 'x', type: 'hotel', unit: 'kg' }).equipment);
    expect(hotel.equipment).not.toContain('barbell_rack');
    for (const p of ['home', 'outdoors', 'none'] as const) {
      const g = await addGym({ preset: p, name: '', unit: 'lb' }, db);
      expect(g.equipment, p).toEqual([]);
      expect(g.city).toBeUndefined();
    }
    expect((await addGym({ preset: 'outdoors', name: '', unit: 'lb' }, db)).name).toBe('Outdoors');
    expect((await db.gyms.get(full.id))!.isActive).toBe(true);
    for (const g of await db.gyms.toArray()) expect(RECORD_CHECKS.gyms(g), g.name).toBe(true);
  });

  it('summaries use only what is saved', () => {
    expect(equipmentSummary({ equipment: [], dumbbellRange: null, unit: 'lb' })).toBe('Nothing: bodyweight only');
    expect(equipmentSummary({ equipment: [...EQUIPMENT_IDS], dumbbellRange: null, unit: 'lb' })).toBe('Everything');
    expect(equipmentSummary({ equipment: ['cable_station', 'dumbbells', 'treadmill'], dumbbellRange: { min: 5, max: 50, step: 5 }, unit: 'lb' })).toBe('Dumbbells 5 to 50 lb, cable station + 1 more');
    expect(gymLine({ city: 'Tokyo', equipment: [], dumbbellRange: null, unit: 'lb' })).toBe('Tokyo · Nothing: bodyweight only');
    expect(cleanGymName('x'.repeat(60))).toHaveLength(40);
  });

  it('recent gyms: active first, then last used, then oldest', () => {
    const a = { isActive: false, createdAt: 1, lastUsedAt: undefined };
    const b = { isActive: false, createdAt: 2, lastUsedAt: 50 };
    const c = { isActive: true, createdAt: 3, lastUsedAt: undefined };
    expect(recentGyms([a, b, c])).toEqual([c, b, a]);
  });
});

describe('rename, equipment, delete', () => {
  it('rename keeps the old name for an empty one; the city can be removed', async () => {
    await setGymDetails(full.id, { name: 'Iron  House', city: 'Cairns' }, db);
    await setGymDetails(full.id, { name: '   ' }, db);
    expect((await db.gyms.get(full.id))).toMatchObject({ name: 'Iron House', city: 'Cairns' });
    await setGymDetails(full.id, { city: '' }, db);
    expect((await db.gyms.get(full.id))!.city).toBeUndefined();
  });

  it('equipment keeps the dumbbell range with the dumbbells, and drops it without', async () => {
    const g = await addGym({ preset: 'home', name: '', unit: 'lb' }, db);
    const a = await setGymEquipment(g.id, ['dumbbells', 'flat_bench'], { min: 5, max: 40, step: 5 }, db);
    expect(a.dumbbellRange).toEqual({ min: 5, max: 40, step: 5 });
    expect((await setGymEquipment(g.id, ['dumbbells'], undefined, db)).dumbbellRange).toEqual({ min: 5, max: 40, step: 5 });
    expect((await setGymEquipment(g.id, ['flat_bench'], undefined, db)).dumbbellRange).toBeNull();
    await expect(setGymEquipment(g.id, ['dumbbells'], { min: 50, max: 5, step: 5 }, db)).rejects.toThrow();
  });

  it('delete with Undo when no workout, blocked when there are workouts, never the last gym', async () => {
    const g = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    const receipt = await deleteGym(g.id, db);
    expect(await db.gyms.get(g.id)).toBeUndefined();
    await undoDeleteGym(receipt, db);
    expect((await db.gyms.get(g.id))).toEqual(g);

    const s = await startPlanDay(g.id, PLAN, 0, db);
    expect(await gymInUse(g.id, db)).toBe(true);
    await expect(deleteGym(g.id, db)).rejects.toBeInstanceOf(GymInUseError);
    expect(s.gymId).toBe(g.id);

    await db.sessions.clear();
    await deleteGym(g.id, db);
    await expect(deleteGym(full.id, db)).rejects.toBeInstanceOf(LastGymError);
  });

  it('deleting the active gym hands over to another, and Undo gives it back', async () => {
    const g = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    await switchGym(g.id, null, db);
    const r = await deleteGym(g.id, db);
    expect((await db.gyms.get(full.id))!.isActive).toBe(true);
    await undoDeleteGym(r, db);
    expect((await db.gyms.toArray()).filter((x) => x.isActive).map((x) => x.id)).toEqual([g.id]);
  });
});

describe('Undo of deleting the active gym', () => {
  it('both gym records come back byte identical, one active, lastUsedAt exact', async () => {
    const g = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    await switchGym(g.id, null, db, 500);
    await switchGym(full.id, null, db, 900);
    await switchGym(g.id, null, db, 1200);
    const before = JSON.stringify((await db.gyms.orderBy('createdAt').toArray()));
    const r = await deleteGym(g.id, db);
    expect((await db.gyms.toArray()).filter((x) => x.isActive)).toHaveLength(1);
    await undoDeleteGym(r, db);
    expect(JSON.stringify(await db.gyms.orderBy('createdAt').toArray())).toBe(before);
  });
});

describe('Undo of deleting the active gym after the other gym was touched', () => {
  it('still byte identical: the hand off and a stray switch cannot leave the restored gym inactive', async () => {
    const g = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    await switchGym(g.id, null, db, 1200);
    const before = JSON.stringify(await db.gyms.orderBy('createdAt').toArray());
    const r = await deleteGym(g.id, db);
    await switchGym(full.id, null, db, 5000);
    await undoDeleteGym(r, db);
    expect(JSON.stringify(await db.gyms.orderBy('createdAt').toArray())).toBe(before);
  });
});

describe('switching without a workout', () => {
  it('one write: one active gym, lastUsedAt set; Undo restores', async () => {
    const g = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    const r = await switchGym(g.id, null, db, 1000);
    expect((await db.gyms.toArray()).filter((x) => x.isActive).map((x) => x.id)).toEqual([g.id]);
    expect((await db.gyms.get(g.id))!.lastUsedAt).toBe(1000);
    await undoGymSwitch(r, db);
    expect((await db.gyms.get(full.id))!.isActive).toBe(true);
    expect((await db.gyms.get(g.id))!.lastUsedAt).toBeUndefined();
  });
});

describe('switching in the middle of a workout', () => {
  it('previews what swaps; the switch writes exactly that; logged sets stay; Undo is exact', async () => {
    const hotel = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await log('s1', s.id, 'barbell-back-squat');
    const before = (await db.sessions.get(s.id))!;
    const p = await previewGymSwitch(hotel.id, db);
    const changes = p.workout!.changes;
    expect(changes.length).toBeGreaterThan(0);
    // The squat with a logged set is swapped for the rest of the workout; its sets stay under it.
    expect(changes.some((c) => c.kind === 'swap' && c.from === 'barbell-back-squat')).toBe(true);
    expect((await db.gyms.get(full.id))!.isActive).toBe(true);

    const r = await switchGym(hotel.id, p.workout!.fp, db);
    const after = (await db.sessions.get(s.id))!;
    expect(after.gymId).toBe(hotel.id);
    expect(after.swaps?.some((x) => x.auto && x.reason)).toBe(true);
    expect(after.swaps?.find((x) => x.slot === 'barbell-back-squat')?.kept).toContain('barbell-back-squat');
    expect((await db.sets.get('s1'))).toMatchObject({ exerciseId: 'barbell-back-squat', gymId: full.id });

    await undoGymSwitch(r, db);
    const back = (await db.sessions.get(s.id))!;
    expect(back).toEqual(before);
    expect((await db.sets.get('s1'))!.gymId).toBeUndefined();
    expect((await db.gyms.get(full.id))!.isActive).toBe(true);
  });

  it('a stale preview writes nothing; Undo after a new set keeps the switch', async () => {
    const hotel = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    const s = await startPlanDay(full.id, PLAN, 0, db);
    await expect(switchGym(hotel.id, '[]', db)).rejects.toBeInstanceOf(SwitchStaleError);
    expect((await db.sessions.get(s.id))!.gymId).toBe(full.id);
    const p = await previewGymSwitch(hotel.id, db);
    const r = await switchGym(hotel.id, p.workout!.fp, db);
    await log('s2', s.id, 'Dumbbell_Squat');
    await expect(undoGymSwitch(r, db)).rejects.toBeInstanceOf(SwitchUndoStaleError);
    expect((await db.sessions.get(s.id))!.gymId).toBe(hotel.id);
  });

  it('going back to the full gym brings the plan exercises back', async () => {
    const hotel = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    const s = await startPlanDay(full.id, PLAN, 0, db);
    const original = (await db.sessions.get(s.id))!.exerciseIds;
    const p = await previewGymSwitch(hotel.id, db);
    await switchGym(hotel.id, p.workout!.fp, db);
    const q = await previewGymSwitch(full.id, db);
    expect(q.workout!.changes.every((c) => c.kind === 'back' || c.kind === 'fits')).toBe(true);
    await switchGym(full.id, q.workout!.fp, db);
    expect((await db.sessions.get(s.id))!.exerciseIds).toEqual(original);
  });

  it('history follows the gym each set was lifted at (machine sets never cross gyms)', async () => {
    const hotel = await addGym({ preset: 'hotel', name: '', unit: 'lb' }, db);
    const s = await startPlanDay(full.id, PLAN, 0, db);
    const stack: Load = { kind: 'stack', unit: 'lb', total: 100, stackValue: 100 };
    await logSet({ id: 'm1', sessionId: s.id, exerciseId: 'Leg_Press', reps: 10, load: stack }, db);
    const p = await previewGymSwitch(hotel.id, db);
    await switchGym(hotel.id, p.workout!.fp, db);
    await finishWorkout(s.id, db, Date.now(), undefined, undefined, null);
    expect(await getPastSessions('Leg_Press', full.id, 'stack', 6, { db })).toHaveLength(1);
    expect(await getPastSessions('Leg_Press', hotel.id, 'stack', 6, { db })).toHaveLength(0);
  });
});
