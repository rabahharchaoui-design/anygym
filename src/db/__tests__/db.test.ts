import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym, getActiveGym } from '../bootstrap';
import { defaultBars, defaultPlateColors, defaultStackStep, stackStepFor, defaultPlateInventory, equipmentPreset, makeGym } from '../gyms';
import { newId } from '../ids';
import { EQUIPMENT_IDS } from '../types';

let db: AnyGymDB;
let n = 0;

beforeEach(async () => {
  db = new AnyGymDB(`anygym-test-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const enabled = (unit: 'lb' | 'kg') =>
  defaultPlateInventory(unit).filter((p) => p.enabled).map((p) => p.weight).sort((a, b) => b - a);
const disabled = (unit: 'lb' | 'kg') =>
  defaultPlateInventory(unit).filter((p) => !p.enabled).map((p) => p.weight).sort((a, b) => b - a);

describe('schema', () => {
  it('opens at version 1 with the expected tables', () => {
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['gyms', 'planDays', 'plans', 'profile', 'runs', 'sessions', 'sets'].sort(),
    );
  });

  it('indexes the fields queries need', () => {
    const idx = (table: string) => db.table(table).schema.indexes.map((i) => i.name);
    expect(idx('sets')).toEqual(expect.arrayContaining(['sessionId', 'exerciseId']));
    expect(idx('sessions')).toEqual(expect.arrayContaining(['startedAt', 'gymId']));
    expect(idx('runs')).toContain('startedAt');
    expect(db.table('gyms').schema.primKey.name).toBe('id');
  });

  it('stores a set load exactly as given (no unit conversion)', async () => {
    const load = { kind: 'barbell' as const, unit: 'kg' as const, total: 100, barWeight: 20, perSide: [25, 15] };
    await db.sets.add({ id: 's1', sessionId: 'x', exerciseId: 'squat', order: 0, kind: 'work', reps: 5, load, uncertain: false });
    expect((await db.sets.get('s1'))!.load).toEqual(load);
    expect(await db.sets.where('sessionId').equals('x').count()).toBe(1);
  });
});

describe('ensureFirstGym', () => {
  it('creates exactly one full lb gym named My Gym, active', async () => {
    const gym = await ensureFirstGym(db);
    expect(await db.gyms.count()).toBe(1);
    expect(gym).toMatchObject({ name: 'My Gym', type: 'full', unit: 'lb', isActive: true });
    expect(gym.equipment).toEqual([...EQUIPMENT_IDS]);
    expect((await getActiveGym(db))!.id).toBe(gym.id);
  });

  it('is idempotent across sequential and concurrent calls', async () => {
    const a = await ensureFirstGym(db);
    const b = await ensureFirstGym(db);
    expect(b.id).toBe(a.id);
    expect(await db.gyms.count()).toBe(1);
  });

  it('two concurrent first calls leave exactly one gym', async () => {
    const [a, b] = await Promise.all([ensureFirstGym(db), ensureFirstGym(db)]);
    expect(a.id).toBe(b.id);
    expect(await db.gyms.count()).toBe(1);
  });

  it('does not add a gym when one already exists', async () => {
    await db.gyms.add(makeGym({ name: 'Hotel', type: 'hotel', unit: 'kg', isActive: true }));
    const gym = await ensureFirstGym(db);
    expect(gym.name).toBe('Hotel');
    expect(await db.gyms.count()).toBe(1);
  });

  it('getActiveGym is undefined on an empty database', async () => {
    expect(await getActiveGym(db)).toBeUndefined();
  });
});

describe('presets (SPEC 3)', () => {
  it('full gym has every picker item', () => {
    expect(EQUIPMENT_IDS).toHaveLength(27);
    expect(equipmentPreset('full', 'lb').equipment).toEqual([...EQUIPMENT_IDS]);
  });

  it('hotel gym: dumbbells 5 to 50 lb step 5, 2 to 24 kg step 2, plus bench, cable, treadmill, bike', () => {
    const lb = equipmentPreset('hotel', 'lb');
    expect(lb.dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
    expect(equipmentPreset('hotel', 'kg').dumbbellRange).toEqual({ min: 2, max: 24, step: 2 });
    expect([...lb.equipment].sort()).toEqual(
      ['adjustable_bench', 'bike', 'cable_station', 'dumbbells', 'treadmill'].sort(),
    );
  });

  it('home gym starts with everything off (user picks)', () => {
    expect(equipmentPreset('home', 'lb')).toEqual({ equipment: [], dumbbellRange: null });
  });

  it('no equipment has nothing', () => {
    expect(equipmentPreset('none', 'kg')).toEqual({ equipment: [], dumbbellRange: null });
  });
});

describe('bars and plates (SPEC 5.3)', () => {
  it('olympic 45 lb / 20 kg, womens 35 lb / 15 kg', () => {
    expect(defaultBars('lb')).toMatchObject({ olympic: 45, womens: 35 });
    expect(defaultBars('kg')).toMatchObject({ olympic: 20, womens: 15 });
  });

  it('EZ, trap and Smith are unknown (null), never guessed', () => {
    for (const unit of ['lb', 'kg'] as const) {
      const bars = defaultBars(unit);
      expect(bars.ez_curl).toBeNull();
      expect(bars.trap).toBeNull();
      expect(bars.smith).toBeNull();
    }
    expect(makeGym({ name: 'x', type: 'full', unit: 'lb' }).equipmentWeights).toEqual({});
  });

  it('stack step defaults to 5 lb / 2.5 kg, per machine override wins', () => {
    expect(defaultStackStep('lb')).toBe(5);
    expect(defaultStackStep('kg')).toBe(2.5);
    const lb = makeGym({ name: 'x', type: 'full', unit: 'lb' });
    const kg = makeGym({ name: 'y', type: 'full', unit: 'kg' });
    expect(stackStepFor(lb, 'lat_pulldown')).toBe(5);
    expect(stackStepFor(kg, 'lat_pulldown')).toBe(2.5);
    lb.equipmentWeights.lat_pulldown = { kind: 'stack_step', value: 10 };
    expect(stackStepFor(lb, 'lat_pulldown')).toBe(10);
    expect(stackStepFor(lb, 'seated_row')).toBe(5);
  });

  it('plate loaded machine starting resistance is unknown by default', () => {
    expect(makeGym({ name: 'x', type: 'full', unit: 'lb' }).equipmentWeights.leg_press).toBeUndefined();
  });

  it('lb plate inventory defaults', () => {
    expect(enabled('lb')).toEqual([45, 35, 25, 10, 5, 2.5]);
    expect(disabled('lb')).toEqual([100, 55, 1.25]);
  });

  it('kg plate inventory defaults', () => {
    expect(enabled('kg')).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
    expect(disabled('kg')).toEqual([2, 1.5, 1, 0.5]);
  });

  it('collars none by default; plate colors black for lb, color for kg', () => {
    expect(makeGym({ name: 'x', type: 'full', unit: 'lb' }).collars).toBe('none');
    expect(defaultPlateColors('lb')).toBe('black');
    expect(defaultPlateColors('kg')).toBe('color');
    expect(makeGym({ name: 'x', type: 'full', unit: 'kg' }).plateColors).toBe('color');
  });
});

describe('newId', () => {
  it('returns unique uuid shaped strings', () => {
    const ids = new Set(Array.from({ length: 100 }, newId));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
