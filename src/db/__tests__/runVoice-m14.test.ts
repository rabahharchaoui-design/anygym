// PLAN M14: You changes only the voice coach part of the run setup row; the Run tab reads it back.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RUN_SETUP } from '../../lib/run';
import { RUN_SETUP_KEY, readRunSetup, saveRunSetup } from '../runSetup';
import { readRunVoice, saveRunVoice } from '../runVoice';
import { AnyGymDB } from '../schema';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-runvoice-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('run voice on You', () => {
  it('a new phone reads the default voice (on, every split)', async () => {
    expect(await readRunVoice(db)).toEqual(DEFAULT_RUN_SETUP.voice);
  });
  it('turning it off keeps every other part of the run setup', async () => {
    const setup = { ...DEFAULT_RUN_SETUP, type: 'distance', distance: { value: 3, unit: 'mi' }, autoPause: false, voice: { on: true, splits: 'second' } } as const;
    await saveRunSetup(setup, db);
    await saveRunVoice({ on: false, splits: 'second' }, db);
    expect((await readRunSetup(db)).setup).toEqual({ ...setup, voice: { on: false, splits: 'second' } });
    expect(await readRunVoice(db)).toEqual({ on: false, splits: 'second' });
  });
  it('with nothing or nonsense saved, the Run tab reads the defaults plus the new voice', async () => {
    await db.kv.put({ key: RUN_SETUP_KEY, value: '{oops', at: 1 });
    expect(await readRunVoice(db)).toEqual(DEFAULT_RUN_SETUP.voice);
    await saveRunVoice({ on: false, splits: 'every' }, db);
    expect((await readRunSetup(db)).setup).toEqual({ ...DEFAULT_RUN_SETUP, voice: { on: false, splits: 'every' } });
  });
});
