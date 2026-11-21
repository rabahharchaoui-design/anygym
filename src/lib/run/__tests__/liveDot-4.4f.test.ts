// PLAN 4.4f (4): on a held position (standing, or a step shorter than the estimate's wobble) the map
// dot sat on the raw phone position while the line is the filtered estimate: the two disagreed.
import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { addPoint, type RawPoint } from '../../gps';
import { DEFAULT_RUN_SETUP } from '../goal';
import { liveStep, startLive, type LiveRun } from '../live';

const step = (run: LiveRun, p: RawPoint) => liveStep(run, { type: 'fix', point: p });
const same = (a: { lat?: number | null; lng?: number | null } | null, b: { lat?: number | null; lng?: number | null } | null) => !!a && !!b && a.lat === b.lat && a.lng === b.lng;

function ranThenStanding(): { run: LiveRun; held: number; raw: RawPoint[] } {
  let run = startLive({ id: 'd', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
  for (let s = 0; s <= 30; s++) run = step(run, at(s * 3, 0, s));
  let held = 0;
  const raw: RawPoint[] = [];
  // Standing at 90 m, the fixes wobbling 3 m from side to side.
  for (let s = 31; s <= 60; s++) {
    const p = at(90, s % 2 ? 3 : -3, s);
    const { event } = addPoint(run.tracker, p);
    run = step(run, p);
    if (event.type === 'held') {
      held++;
      raw.push(p);
      expect(same(run.here, run.tracker.lastGood), `the dot is the estimate at ${s} s`).toBe(true);
      expect(same(run.here, p), `the dot is not the raw fix at ${s} s`).toBe(false);
    }
  }
  return { run, held, raw };
}

describe('the dot on a held position (PLAN 4.4f 4)', () => {
  it('standing: the dot is the estimate the line is drawn from, not the raw fix', () => {
    const { held } = ranThenStanding();
    expect(held).toBeGreaterThan(10);
  });

  it('paused by hand: the dot still follows the phone (no estimate runs while paused)', () => {
    let run = ranThenStanding().run;
    run = liveStep(run, { type: 'pause', now: T0 + 61_000 });
    const p = at(120, 0, 70);
    run = step(run, p);
    expect(same(run.here, p)).toBe(true);
  });
});
