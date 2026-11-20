// SPEC 12.3: what must hold for any track. Random runs from a seeded generator: clean stretches,
// spikes, bad fixes, gaps, stops, taps on pause and resume.
import { describe, expect, it } from 'vitest';
import { addPoint, haversineM, pauseTrack, processTrack, readTracker, resumeRun, startTracker, stepTracker, METERS_PER_MILE, type GpsPoint, type TrackInput, type TrackerState } from '..';
import { at, seeded, wander } from './fixtures';

/** A random run of about `steps` inputs. */
function randomRun(seed: number, steps = 600): TrackInput[] {
  const rand = seeded(seed);
  const err = wander(seed + 1000, 1.5);
  const out: TrackInput[] = [];
  let east = 0;
  let north = 0;
  let sec = 0;
  let heading = rand() * 2 * Math.PI;
  let speed = 3;
  let paused = false;
  for (let i = 0; i < steps; i++) {
    const roll = rand();
    sec += 1;
    if (roll < 0.01) sec += 20 + rand() * 400; // a gap, short or long
    else if (roll < 0.02) speed = speed === 0 ? 2 + rand() * 3 : 0; // stop or go
    else if (roll < 0.03) {
      out.push({ type: paused ? 'resume' : 'pause' });
      paused = !paused;
    } else if (roll < 0.035) out.push({ type: paused ? 'pause' : 'resume' }); // a tap that changes nothing
    else if (roll < 0.04) {
      east += 3000; // carried away: the next point is a jump no runner makes
      sec += 30;
    }
    heading += (rand() - 0.5) * 0.3;
    east += speed * Math.cos(heading);
    north += speed * Math.sin(heading);
    const e = err();
    const point = at(east + e.east, north + e.north, sec, 3 + rand() * 6);
    const bad = rand();
    if (bad < 0.03) out.push({ type: 'point', point: at(east + 400 + rand() * 900, north, sec - 0.5) }); // spike
    if (bad > 0.97) out.push({ type: 'point', point: { ...point, accuracy: 30 + rand() * 100 } });
    else if (bad > 0.96) out.push({ type: 'point', point: { ...point, t: undefined } });
    else if (bad > 0.95) out.push({ type: 'point', point: { ...point, t: point.t! - 5000 } });
    else out.push({ type: 'point', point });
  }
  return out;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const OPTIONS = [{ splitM: 1000 }, { splitM: METERS_PER_MILE, autoPause: false }];
const optionsFor = (seed: number) => OPTIONS[seed % 2]!;

describe('for any track', () => {
  it('the generator really produces every kind of trouble', () => {
    const all = SEEDS.map((seed) => processTrack(randomRun(seed), optionsFor(seed)));
    const reasons = new Set(all.flatMap((r) => r.rejected.map((x) => x.reason)));
    // PLAN 4.4d adds 'jump': far off where the estimate expected (estimate.ts).
    expect([...reasons].sort()).toEqual(['accuracy', 'jump', 'no-time', 'speed', 'time-backwards']);
    expect(all.some((r) => r.breaks.some((b) => b.kind === 'gap' && b.bridged))).toBe(true);
    expect(all.some((r) => r.unbridgedGaps > 0)).toBe(true);
    expect(all.some((r) => r.breaks.some((b) => b.kind === 'pause'))).toBe(true);
    expect(all.some((r) => r.heldCount > 0)).toBe(true);
    expect(all.some((r) => r.reading.splits.full.length > 0)).toBe(true);
  });

  it('feeding one input at a time gives exactly the batch result, at every step', () => {
    for (const seed of SEEDS) {
      const inputs = randomRun(seed, 300);
      const options = optionsFor(seed);
      let state: TrackerState = startTracker(options);
      const points: GpsPoint[] = [];
      inputs.forEach((input, i) => {
        if (input.type === 'point') {
          const r = addPoint(state, input.point);
          state = r.state;
          if (r.event.type === 'recorded') points.push(...(r.event.withheld ? [r.event.withheld] : []), r.event.point);
        } else if (input.type === 'resume') state = resumeRun(state);
        else {
          // A pause may record the end of the withheld leg (PLAN 4.6b).
          const r = pauseTrack(state);
          state = r.state;
          if (r.point) points.push(r.point);
        }
        if (i % 50 === 49 || i === inputs.length - 1) {
          const batch = processTrack(inputs.slice(0, i + 1), options);
          expect(batch.state).toEqual(state);
          expect(batch.points).toEqual(points);
          expect(batch.reading).toEqual(readTracker(state));
        }
      });
    }
  });

  it('distance and moving time are never negative and never go down; moving time never passes elapsed time', () => {
    for (const seed of SEEDS) {
      let state: TrackerState = startTracker(optionsFor(seed));
      for (const input of randomRun(seed)) {
        const next = stepTracker(state, input).state;
        expect(next.distanceM).toBeGreaterThanOrEqual(state.distanceM);
        expect(next.movingMs).toBeGreaterThanOrEqual(state.movingMs);
        expect(next.timedM).toBeLessThanOrEqual(next.distanceM + 1e-9);
        state = next;
        const reading = readTracker(state);
        expect(reading.distanceM).toBeGreaterThanOrEqual(0);
        expect(reading.movingSec).toBeLessThanOrEqual(reading.elapsedSec + 1e-9);
        if (reading.currentPace !== null) expect(reading.currentPace).toBeGreaterThan(0);
        if (reading.averagePace !== null) expect(reading.averagePace).toBeGreaterThan(0);
      }
    }
  });

  // PLAN 4.4d: a 'jump' is judged against the estimate and remembered by it (a held surprise counts
  // once the next fix confirms it; jumps in a row restart it), so it is not a stateless drop: only
  // the filter's own drops are removed here, and the jumps must come out the same.
  it('removing the rejected points changes nothing', () => {
    for (const seed of SEEDS) {
      const inputs = randomRun(seed);
      const options = optionsFor(seed);
      const full = processTrack(inputs, options);
      expect(full.rejected.length).toBeGreaterThan(0);
      const dropped = new Set(full.rejected.filter((r) => r.reason !== 'jump').map((r) => r.index));
      const clean = processTrack(inputs.filter((_, i) => !dropped.has(i)), options);
      expect(clean.rejected.map((r) => r.reason)).toEqual(full.rejected.filter((r) => r.reason === 'jump').map((r) => r.reason));
      expect(clean.state).toEqual(full.state);
      expect(clean.points).toEqual(full.points);
      expect(clean.breaks).toEqual(full.breaks);
    }
  });

  it('the splits add up to the distance and to the moving time', () => {
    for (const seed of SEEDS) {
      const options = optionsFor(seed);
      const { reading } = processTrack(randomRun(seed), options);
      const all = [...reading.splits.full, ...(reading.splits.partial ? [reading.splits.partial] : [])];
      for (const s of reading.splits.full) expect(s.distanceM).toBe(options.splitM);
      if (reading.splits.partial) expect(reading.splits.partial.distanceM).toBeLessThan(options.splitM);
      expect(all.reduce((sum, s) => sum + s.distanceM, 0)).toBeCloseTo(reading.distanceM, 6);
      expect(all.reduce((sum, s) => sum + s.sec, 0)).toBeCloseTo(reading.movingSec, 6);
      expect(all.map((s) => s.index)).toEqual(all.map((_, i) => i + 1));
    }
  });

  it('the distance is haversine over the recorded points: every leg but the breaks, plus what the bridged gaps say', () => {
    for (const seed of SEEDS) {
      const r = processTrack(randomRun(seed), optionsFor(seed));
      const breakAfter = new Map(r.breaks.map((b) => [b.fromT, b]));
      let sum = 0;
      r.points.forEach((p, i) => {
        const prev = r.points[i - 1];
        if (!prev) return;
        const brk = breakAfter.get(prev.t);
        if (brk && brk.toT === p.t) {
          sum += brk.distanceM;
          // PLAN 4.4d: a correction of the estimate (reanchor) is a bridged break that counts what the
          // estimated speed covered in its time, so a bridged break counts at most the straight line
          // across (was: exactly it). An unbridged one counts nothing.
          if (brk.bridged) expect(brk.distanceM).toBeLessThanOrEqual(haversineM(prev, p) + 1e-9);
          else expect(brk.distanceM).toBe(0);
        } else sum += haversineM(prev, p);
      });
      expect(r.reading.distanceM).toBeCloseTo(sum, 6);
      // Timestamps on the track only ever go forward.
      expect(r.points.every((p, i) => i === 0 || p.t > r.points[i - 1]!.t)).toBe(true);
    }
  });
});
