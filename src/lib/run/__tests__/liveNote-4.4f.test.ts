// PLAN 4.4f (2): during an auto pause the screen said "Auto paused" even when the phone had stopped
// giving positions, so it never said GPS was lost.
import { describe, expect, it } from 'vitest';
import { GAP_SEC, readTracker } from '../../gps';
import { liveNote, liveStep, msToNextFace, startLive, type LiveRun } from '..';
import { DEFAULT_RUN_SETUP } from '../goal';

const T0 = 1_700_000_000_000;
const at = (sec: number, m: number) => ({ lat: 48 + m / 111_320, lng: 2, t: T0 + sec * 1000, accuracy: 5 });
const fix = (run: LiveRun, sec: number, m: number) => liveStep(run, { type: 'fix', point: at(sec, m), now: T0 + sec * 1000 });
const note = (run: LiveRun, nowSec: number) => liveNote(run, readTracker(run.tracker).status, T0 + nowSec * 1000);

/** Ran 30 s at 3 m/s, then stood from 32 to 50 s, one position every 2 s: auto paused at 50 s. */
function autoPaused(): LiveRun {
  let run = startLive({ id: 'n', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
  for (let t = 0; t <= 30; t += 2) run = fix(run, t, t * 3);
  for (let t = 32; t <= 50; t += 2) run = fix(run, t, 90);
  return run;
}

describe('liveNote (PLAN 4.4f 2)', () => {
  it('auto paused with fresh GPS: Auto paused', () => {
    const run = autoPaused();
    expect(readTracker(run.tracker).status).toBe('auto-paused');
    expect(note(run, 51)?.text).toBe('Auto paused · move to go on');
    expect(note(run, 50 + GAP_SEC)?.text).toBe('Auto paused · move to go on');
  });

  it('auto paused with stale GPS: GPS lost', () => {
    const run = autoPaused();
    expect(note(run, 51 + GAP_SEC)).toEqual({ tone: 'wait', text: 'GPS lost · time on hold' });
  });

  it('moving with stale GPS: GPS lost', () => {
    let run = startLive({ id: 'm', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
    for (let t = 0; t <= 30; t += 2) run = fix(run, t, t * 3);
    expect(note(run, 31)).toBeNull();
    expect(note(run, 31 + GAP_SEC)).toEqual({ tone: 'wait', text: 'GPS lost · time on hold' });
  });

  it('paused by hand: Paused, however old the last position', () => {
    const run = liveStep(autoPaused(), { type: 'pause', now: T0 + 51_000 });
    expect(note(run, 51 + 5 * GAP_SEC)).toEqual({ tone: 'paused', text: 'Paused' });
  });

  it('the face wakes once when an auto pause turns into lost GPS, then stands', () => {
    const run = autoPaused();
    expect(msToNextFace(run.tracker, T0 + 51_000)).toBe(GAP_SEC * 1000 - 1000 + 1);
    expect(msToNextFace(run.tracker, T0 + 51_000 + GAP_SEC * 1000)).toBeNull();
  });
});
