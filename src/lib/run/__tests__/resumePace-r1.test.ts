// PLAN R1 (2): after Resume the live screen showed the pace from before the pause as if it were
// current, until a new position arrived. Now there is no current pace ("--") and the note says
// "Looking for GPS" until a new accepted position gives one; the average pace is unchanged.
import { describe, expect, it } from 'vitest';
import { readTracker } from '../../gps';
import { liveNote, liveStep, startLive, type LiveRun } from '..';
import { DEFAULT_RUN_SETUP } from '../goal';

const T0 = 1_700_000_000_000;
const at = (sec: number, m: number, speed?: number) => ({ lat: 48 + m / 111_320, lng: 2, t: T0 + sec * 1000, accuracy: 5, ...(speed === undefined ? {} : { speed }) });
const fix = (run: LiveRun, sec: number, m: number, speed?: number) => liveStep(run, { type: 'fix', point: at(sec, m, speed), now: T0 + sec * 1000 });
const note = (run: LiveRun, nowSec: number) => liveNote(run, readTracker(run.tracker).status, T0 + nowSec * 1000);

/** 60 s at 3 m/s, one position every 2 s, then paused by hand at 61 s and resumed 2 minutes later. */
function resumedAfterTwoMinutes(speed: boolean): { before: LiveRun; paused: LiveRun; resumed: LiveRun } {
  let run = startLive({ id: 'r', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
  for (let t = 0; t <= 60; t += 2) run = fix(run, t, t * 3, speed ? 3 : undefined);
  const before = run;
  const paused = liveStep(run, { type: 'pause', now: T0 + 61_000 });
  return { before, paused, resumed: liveStep(paused, { type: 'resume' }) };
}

describe.each([
  ['with the phone speed', true],
  ['from positions alone', false],
])('R1 (2) pace after Resume, %s', (_name, speed) => {
  it('before the pause there was a current pace', () => {
    expect(readTracker(resumedAfterTwoMinutes(speed).before.tracker).currentPace).not.toBeNull();
  });

  it('pause 2 minutes, resume: no current pace and "Looking for GPS" until the next fix', () => {
    const { paused, resumed } = resumedAfterTwoMinutes(speed);
    const reading = readTracker(resumed.tracker);
    expect(reading.status).not.toBe('paused');
    expect(reading.currentPace).toBeNull();
    expect(note(resumed, 182)).toEqual({ tone: 'wait', text: 'Looking for GPS' });
    // The average pace is the run's so far: the resume leaves it as the pause left it.
    expect(reading.averagePace).not.toBeNull();
    expect(reading.averagePace).toBe(readTracker(paused.tracker).averagePace);
  });

  it('new accepted positions give a pace again, and the note clears', () => {
    let run = resumedAfterTwoMinutes(speed).resumed;
    run = fix(run, 182, 180, speed ? 3 : undefined);
    expect(note(run, 182)).toBeNull();
    for (let t = 184; t <= 210; t += 2) run = fix(run, t, 180 + (t - 182) * 3, speed ? 3 : undefined);
    const pace = readTracker(run.tracker).currentPace;
    expect(pace).not.toBeNull();
    expect(1 / pace!).toBeCloseTo(3, 0);
  });
});
