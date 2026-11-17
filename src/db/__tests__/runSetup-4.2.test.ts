// PLAN 4.2: the run start screen's remembered choice and the profile's distance unit.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RUN_SETUP } from '../../lib/run';
import { getProfile } from '../intake';
import { RUN_SETUP_KEY, readRunSetup, saveRunSetup, saveRunUnit } from '../runSetup';
import { AnyGymDB } from '../schema';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-runsetup-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('run setup storage', () => {
  it('a new phone gets the default setup: a free run', async () => {
    expect((await readRunSetup(db)).setup).toEqual(DEFAULT_RUN_SETUP);
  });
  it('remembers the type and goals', async () => {
    const setup = { type: 'distance', distance: { value: 3, unit: 'mi' }, timeMin: 45, interval: 'speed', autoPause: false } as const;
    await saveRunSetup(setup, db);
    expect((await readRunSetup(db)).setup).toEqual(setup);
  });
  it('nonsense in the row reads as the default and never throws', async () => {
    await db.kv.put({ key: RUN_SETUP_KEY, value: '{oops', at: 1 });
    expect((await readRunSetup(db)).setup).toEqual(DEFAULT_RUN_SETUP);
  });
  it('the unit is the profile unit and the toggle writes it there', async () => {
    await saveRunUnit('mi', db);
    expect((await readRunSetup(db)).unit).toBe('mi');
    expect((await getProfile(db))?.distanceUnit).toBe('mi');
    await saveRunUnit('km', db);
    expect((await readRunSetup(db)).unit).toBe('km');
  });
  it('stores no run: only the one kv row', async () => {
    await saveRunSetup(DEFAULT_RUN_SETUP, db);
    expect(await db.kv.count()).toBe(1);
    expect(await db.sessions.count()).toBe(0);
  });
});
