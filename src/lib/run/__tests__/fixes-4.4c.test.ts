// PLAN 4.4c: the run fixes from the Grok audit and the 4.4a review.
import { describe, expect, it } from 'vitest';
import { at, T0 } from '../../gps/__tests__/fixtures';
import { GAP_SEC, type RawPoint } from '../../gps';
import { DEFAULT_RUN_SETUP } from '../goal';
import { liveStep, readLive, startLive, type LiveAction, type LiveRun } from '../live';
import { liveMovingMs } from '../liveClock';
import { liveRow, parseSnapshot, restoreLive, toSnapshot } from '../snapshot';
import { DASHED_NOTE } from '../summary';

const start = () => startLive({ id: 'r1', now: T0, setup: DEFAULT_RUN_SETUP, unit: 'km', autoPause: true });
const fix = (point: RawPoint): LiveAction => ({ type: 'fix', point });
const feed = (run: LiveRun, actions: LiveAction[]) => actions.reduce(liveStep, run);
/** East at 3 m/s, one point a second, from second `from` to `to`. */
const east = (from: number, to: number, speed = 3, x0 = 0): LiveAction[] => Array.from({ length: to - from + 1 }, (_, i) => fix(at(x0 + i * speed, 0, from + i)));

describe('the dashed stretch caption (fix 2)', () => {
  it('says what the clock does: a pause is left out, a GPS gap keeps only its first GAP_SEC seconds', () => {
    expect(DASHED_NOTE).toContain('Dashed');
    expect(DASHED_NOTE).toMatch(/pause/i);
    expect(DASHED_NOTE).toContain(`first ${GAP_SEC} seconds`);
    expect(DASHED_NOTE).not.toContain('That stretch is not counted as moving time');
  });
  it('says the distance across a GPS gap counts in the distance but not in the average pace (PLAN 4.6c 4)', () => {
    expect(DASHED_NOTE).toContain('A GPS gap of up to 5 minutes at a believable speed adds its straight-line distance to the total, but not to the average pace.');
    expect(DASHED_NOTE).toContain('A longer or faster gap adds no distance.');
    expect(DASHED_NOTE).not.toMatch(/\bmay\b/);
  });
});

describe('restore after a reload keeps the time the clock had shown (fix 3)', () => {
  const going = (to: number) => feed(start(), east(0, to));

  it('a snapshot saved 6 s after the last position comes back with those 6 s counted', () => {
    const run = going(100);
    const savedAt = T0 + 106_000;
    const shown = liveMovingMs(run.tracker, savedAt);
    expect(shown).toBe(106_000);
    const back = restoreLive(liveRow(run), parseSnapshot(JSON.stringify(toSnapshot(run, savedAt)), 'r1'), { unit: 'km', autoPause: true });
    expect(readLive(back).status).toBe('paused');
    expect(back.tracker.movingMs).toBe(shown);
    expect(readLive(back).distanceM).toBeCloseTo(readLive(run).distanceM, 6);
  });

  it('saved inside a GPS gap: only the first GAP_SEC count, the same as the clock held', () => {
    const run = going(100);
    const savedAt = T0 + 160_000;
    const back = restoreLive(liveRow(run), parseSnapshot(JSON.stringify(toSnapshot(run, savedAt)), 'r1'), { unit: 'km', autoPause: true });
    expect(back.tracker.movingMs).toBe(100_000 + GAP_SEC * 1000);
    expect(back.tracker.movingMs).toBe(liveMovingMs(run.tracker, savedAt));
  });

  it('an old snapshot without the time still restores, with the counted time only', () => {
    const run = going(100);
    const old = JSON.stringify(toSnapshot(run));
    expect(old).not.toContain('savedAt');
    const back = restoreLive(liveRow(run), parseSnapshot(old, 'r1'), { unit: 'km', autoPause: true });
    expect(back.tracker.movingMs).toBe(100_000);
    // A broken time is ignored the same way.
    const bad = JSON.stringify({ ...JSON.parse(old), savedAt: 'soon' });
    expect(restoreLive(liveRow(run), parseSnapshot(bad, 'r1'), { unit: 'km', autoPause: true }).tracker.movingMs).toBe(100_000);
  });
});
