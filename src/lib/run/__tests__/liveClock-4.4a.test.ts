// PLAN 4.4a: the clock on the live screen counts between two positions, never backwards, never
// through a pause or a gap, and never more than FACE_HOLD_SEC (2 s, PLAN 4.4c) ahead of what is saved.
import { describe, expect, it } from 'vitest';
import { addPoint, GAP_SEC, pauseRun, pendingMs, readTracker, resumeRun, startTracker, type TrackerState } from '../../gps';
import { FACE_HOLD_SEC, FIX_LAG_MS, faceSec, inGap, liveMovingMs, liveMovingSec, liveStep, msToNextFace, readLiveAt, startLive } from '..';
import { DEFAULT_RUN_SETUP as DEFAULT_SETUP } from '../goal';

const T0 = 1_700_000_000_000;
/** A point `sec` seconds into the run, `m` meters north of the start. */
const at = (sec: number, m: number, accuracy = 5) => ({ lat: 48 + m / 111_320, lng: 2, t: T0 + sec * 1000, accuracy });
const feed = (state: TrackerState, sec: number, m: number) => addPoint(state, at(sec, m)).state;
const fresh = (autoPause = true) => startTracker({ splitM: 1000, autoPause });
/** Running at 3 m/s with a position every `every` seconds, up to `untilSec`. */
function running(untilSec: number, every = 6, autoPause = true): TrackerState {
  let s = fresh(autoPause);
  for (let t = 0; t <= untilSec; t += every) s = feed(s, t, t * 3);
  return s;
}

describe('liveMovingMs', () => {
  it('is zero before the first position, whatever the clock says', () => {
    expect(liveMovingMs(fresh(), T0 + 60_000)).toBe(0);
  });

  it('adds the time since the last position while running', () => {
    const s = running(12);
    expect(s.movingMs).toBe(12_000);
    expect(liveMovingMs(s, T0 + 12_000)).toBe(12_000);
    expect(liveMovingMs(s, T0 + 13_000)).toBe(13_000);
    expect(liveMovingSec(s, T0 + 17_400)).toBeCloseTo(17.4);
  });

  it('never goes back when the next position lands, at any moment in between', () => {
    let s = fresh();
    let shown = 0;
    let now = T0;
    // Positions every 6 s (stamped up to 1.5 s before they arrive), the clock read every 250 ms.
    for (let t = 0; t <= 120; t += 6) {
      const arrives = T0 + t * 1000 + (t % 4) * 500;
      for (; now < arrives; now += 250) {
        const v = liveMovingMs(s, now);
        expect(v).toBeGreaterThanOrEqual(shown);
        shown = v;
      }
      s = feed(s, t, t * 3);
      const v = liveMovingMs(s, arrives);
      expect(v).toBeGreaterThanOrEqual(shown);
      shown = v;
    }
    expect(s.movingMs).toBe(120_000);
  });

  it('is never more than a second ahead of what is saved when the run is paused or ended', () => {
    const s = running(60);
    for (const ms of [0, 1, 999, 3500, 5999, 14_999, 15_000]) {
      const now = T0 + 60_000 + ms;
      const saved = pauseRun(s, now).movingMs;
      expect(liveMovingMs(s, now) - saved).toBeLessThanOrEqual(1000);
      expect(saved).toBe(60_000 + ms);
      // ...and the face does not drop at the tap.
      expect(liveMovingMs(pauseRun(s, now), now + 5000)).toBe(saved);
    }
  });

  it('stands still while paused by hand, and after Resume until the first position', () => {
    const paused = pauseRun(running(30), T0 + 32_000);
    expect(paused.movingMs).toBe(32_000);
    expect(liveMovingMs(paused, T0 + 40_000)).toBe(32_000);
    const resumed = resumeRun(paused);
    expect(readTracker(resumed).status).toBe('running');
    expect(liveMovingMs(resumed, T0 + 41_000)).toBe(32_000);
    // The first position after it starts a new piece: no time across the pause, then it counts again.
    const back = feed(resumed, 44, 100);
    expect(back.movingMs).toBe(32_000);
    expect(liveMovingMs(back, T0 + 46_000)).toBe(34_000);
  });

  it('stands still while auto paused, and counts while standing with auto pause off', () => {
    let s = running(30, 2);
    for (let t = 32; t <= 50; t += 2) s = feed(s, t, 90);
    expect(readTracker(s).status).toBe('auto-paused');
    const stood = s.movingMs;
    expect(liveMovingMs(s, T0 + 51_500)).toBe(stood);
    expect(pauseRun(s, T0 + 51_500).movingMs).toBe(stood);

    let off = running(30, 2, false);
    for (let t = 32; t <= 50; t += 2) off = feed(off, t, 90);
    expect(readTracker(off).standing).toBe(true);
    expect(liveMovingMs(off, T0 + 51_500)).toBe(51_500);
  });

  it('a gap: the face holds at GAP_SEC past the last position, the next position counts exactly that, then it goes on', () => {
    const s = running(30);
    expect(liveMovingMs(s, T0 + 30_000 + GAP_SEC * 1000)).toBe(30_000 + GAP_SEC * 1000);
    expect(liveMovingMs(s, T0 + 30_000 + GAP_SEC * 1000 + 1)).toBe(30_000 + GAP_SEC * 1000);
    expect(liveMovingMs(s, T0 + 300_000)).toBe(30_000 + GAP_SEC * 1000);
    expect(inGap(s, T0 + 30_000 + GAP_SEC * 1000)).toBe(false);
    expect(inGap(s, T0 + 30_000 + GAP_SEC * 1000 + 1)).toBe(true);
    // The position that ends the gap counts the held seconds (and nothing after them): no step back.
    const back = feed(s, 50, 150);
    expect(back.movingMs).toBe(30_000 + GAP_SEC * 1000);
    expect(back.heldMs).toBe(GAP_SEC * 1000);
    expect(liveMovingMs(back, T0 + 52_000)).toBe(30_000 + GAP_SEC * 1000 + 2000);
    // A pause, or End, in the gap saves what the face shows; the held seconds stay out of the pace.
    const paused = pauseRun(s, T0 + 60_000);
    expect(paused.movingMs).toBe(30_000 + GAP_SEC * 1000);
    expect(readTracker(paused).averagePace).toBeCloseTo(1 / 3, 3);
  });

  it('ignores a clock that is behind the last position', () => {
    expect(pendingMs(running(12), T0 + 11_000)).toBe(0);
  });
});

describe('readLiveAt', () => {
  it('gives the reading with the time of the face, and the same object when nothing is added', () => {
    let run = startLive({ id: 'r', now: T0, setup: DEFAULT_SETUP, unit: 'km', autoPause: true });
    for (let t = 0; t <= 12; t += 6) run = liveStep(run, { type: 'fix', point: at(t, t * 3) });
    expect(readLiveAt(run, T0 + 15_000).movingSec).toBe(15);
    expect(readLiveAt(run, T0 + 15_000).distanceM).toBeCloseTo(36, 0);
    const paused = liveStep(run, { type: 'pause', now: T0 + 15_000 });
    expect(readLiveAt(paused, T0 + 20_000).movingSec).toBe(15);
  });
});

describe('msToNextFace', () => {
  it('is the time to the next whole second of the face', () => {
    const s = running(12);
    expect(msToNextFace(s, T0 + 12_001)).toBe(999);
    expect(msToNextFace(s, T0 + 12_250)).toBe(750);
    expect(msToNextFace(s, T0 + 12_999)).toBe(1);
  });

  it('follows the face, not the wall clock, after a pause moved the two apart', () => {
    const back = feed(resumeRun(pauseRun(running(30), T0 + 30_400)), 40.7, 100);
    expect(back.movingMs).toBe(30_400);
    // The face reads 30.4 s at the position, 30.5 s a tenth later: the next whole second is 500 ms on.
    expect(msToNextFace(back, T0 + 40_800)).toBe(500);
  });

  it('stops at the moment the wait becomes a gap', () => {
    const s = running(12);
    expect(msToNextFace(s, T0 + 12_000 + GAP_SEC * 1000 - 200)).toBe(200);
    expect(msToNextFace(s, T0 + 12_000 + GAP_SEC * 1000 + 1)).toBeNull();
  });

  it('is null while the face stands: waiting, paused, auto paused, just resumed', () => {
    expect(msToNextFace(fresh(), T0)).toBeNull();
    const paused = pauseRun(running(12), T0 + 13_000);
    expect(msToNextFace(paused, T0 + 14_000)).toBeNull();
    expect(msToNextFace(resumeRun(paused), T0 + 14_000)).toBeNull();
  });

  it('ticking at each returned delay shows every second once, none skipped or repeated', () => {
    let s = fresh();
    let now = T0 + 137;
    const shown: number[] = [];
    let prev: number | null = null;
    let nextFix = 0;
    while (now < T0 + 90_000) {
      // Positions land every 6 s, 137 ms after their stamp.
      while (T0 + nextFix * 1000 + 137 <= now) {
        s = feed(s, nextFix, nextFix * 3);
        nextFix += 6;
      }
      const v: number = faceSec(prev, liveMovingMs(s, now));
      if (v !== prev) shown.push(v);
      prev = v;
      const wait = msToNextFace(s, now);
      const fixAt = T0 + nextFix * 1000 + 137;
      now = wait === null ? fixAt : Math.min(now + wait, fixAt);
    }
    expect(shown).toEqual(Array.from({ length: shown.length }, (_, i) => i));
    expect(shown.length).toBeGreaterThan(85);
  });
});

describe('faceSec', () => {
  it('prints whole seconds, rounded down', () => {
    expect(faceSec(null, 0)).toBe(0);
    expect(faceSec(null, 59_999)).toBe(59);
    expect(faceSec(59, 60_000)).toBe(60);
  });
  it('holds a step back of up to FACE_HOLD_SEC (the most a position may be stamped late), shows a larger one', () => {
    expect(FACE_HOLD_SEC * 1000).toBe(FIX_LAG_MS);
    expect(faceSec(31, 30_900)).toBe(31);
    expect(faceSec(31, 31_000)).toBe(31);
    // PLAN 4.4c (5): stopping on a position stamped 2 s late must not step the face back.
    expect(faceSec(33, 31_000)).toBe(33);
    expect(faceSec(33, 31_999)).toBe(33);
    expect(faceSec(45, 30_000)).toBe(30);
  });
});

describe('the face over random timelines (property)', () => {
  /** A small seeded random, so a failure can be replayed. */
  const rng = (seed: number) => () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);

  it('never steps back, and is never more than FACE_HOLD_SEC beyond what End would save', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      let s = fresh(r() < 0.7);
      let now = T0;
      let m = 0;
      let prev: number | null = null;
      let t = 0;
      const check = () => {
        const shown = faceSec(prev, liveMovingMs(s, now));
        if (prev !== null) expect(shown, `seed ${seed} at ${now - T0} ms`).toBeGreaterThanOrEqual(prev);
        prev = shown;
        const saved = pauseRun(s, now).movingMs;
        expect(shown * 1000 - saved, `seed ${seed}: face ahead of End`).toBeLessThanOrEqual(FACE_HOLD_SEC * 1000);
        expect(saved - liveMovingMs(s, now), `seed ${seed}: End beyond the face`).toBeLessThanOrEqual(0);
      };
      for (let step = 0; step < 120; step++) {
        const pick = r();
        if (pick < 0.08) {
          s = s.manual ? resumeRun(s) : pauseRun(s, now);
        } else if (pick < 0.14) {
          // A gap: no position for 16 to 60 s, the face read on the way.
          const until = now + 16_000 + Math.floor(r() * 44_000);
          for (; now < until; now += 700) check();
        } else {
          const wait = 300 + Math.floor(r() * 6000);
          for (const end = now + wait; now < end; now += 400) check();
          t = now - T0;
          // Standing still now and then (auto pause), else running at 3 m/s; stamped up to FIX_LAG_MS
          // early, the most fixTime accepts (PLAN 4.4c: a stop on such a position stepped the face back).
          if (r() < 0.75) m += (3 * wait) / 1000;
          s = addPoint(s, at(Math.max(0, t - Math.floor(r() * (FIX_LAG_MS + 1))) / 1000, m)).state;
        }
        check();
      }
    }
  });
});
