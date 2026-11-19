// PLAN 4.6a (3): at poor accuracy the wide standing circle (4.4b 13) drops wander distance only;
// the moving clock keeps the 4 m rule, so a walk or a slow jog keeps its time and its pace makes sense.
import { describe, expect, it } from 'vitest';
import { processPoints } from '..';
import { standing, straight } from './fixtures';

const KM = { splitM: 1000 };
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('poor accuracy: distance and moving time agree (PLAN 4.6a 3)', () => {
  it('a still phone at 10, 15 and 20 m accuracy still adds no distance, auto pause on or off', () => {
    for (const accuracy of [10, 15, 20])
      for (const autoPause of [true, false])
        for (const seed of SEEDS) {
          const r = processPoints(standing({ seed, sigma: accuracy / 4, seconds: 300, accuracy }), { ...KM, autoPause }).reading;
          expect(r.distanceM).toBeLessThan(20);
        }
  });

  it('a steady walk and a slow jog at 20 m accuracy keep their moving time, with a plausible pace', () => {
    for (const speed of [1.4, 1.8]) {
      const moving: number[] = [];
      for (const seed of SEEDS) {
        const r = processPoints(straight({ speed, seconds: 300, noise: { seed, sigma: 5 }, accuracy: 20 }), KM).reading;
        moving.push(r.movingSec);
        // Before 4.6a a 1.4 m/s walk kept 76 to 152 of its 300 s, a 1.8 m/s jog 162 to 234.
        expect(r.movingSec).toBeGreaterThan(240);
        // The average pace shown is the speed walked, within 35 % (GPS wander adds about 13 % even at 2.5 m/s).
        expect(Math.abs(1 / r.averagePace! - speed) / speed).toBeLessThan(0.35);
      }
      expect(mean(moving)).toBeGreaterThan(285);
    }
  });

  it('a slow 1 m/s walk at 20 m: its pace stays plausible; the clock stands where the GPS shows it under 0.5 m/s', () => {
    const moving: number[] = [];
    for (const seed of SEEDS) {
      const r = processPoints(straight({ speed: 1, seconds: 300, noise: { seed, sigma: 5 }, accuracy: 20 }), KM).reading;
      moving.push(r.movingSec);
      expect(Math.abs(1 / r.averagePace! - 1)).toBeLessThan(0.35);
      expect(r.movingSec).toBeGreaterThan(120);
    }
    // The 4 m clock rule (SPEC 12.3) meets a GPS wander that cancels the walk for 8 s at times: about
    // a third of the time stands (before 4.6a, four fifths). Pinned so a change is seen.
    expect(mean(moving)).toBeGreaterThan(190);
  });

  it('a walk at 20 m that stops at a light: standing adds no distance, and the walk on both sides keeps its time', () => {
    for (const seed of SEEDS) {
      const walk = straight({ speed: 1.4, seconds: 120, noise: { seed, sigma: 5 }, accuracy: 20 });
      const wait = standing({ seed: seed + 100, sigma: 5, seconds: 60, startSec: 121, east: 168, accuracy: 20 });
      const on = straight({ speed: 1.4, seconds: 120, startSec: 182, startEast: 168, noise: { seed: seed + 200, sigma: 5 }, accuracy: 20 });
      const r = processPoints([...walk, ...wait, ...on], KM).reading;
      // 336 m walked; the minute at the light adds none of its own.
      expect(Math.abs(r.distanceM - 336) / 336).toBeLessThan(0.3);
      expect(r.movingSec).toBeGreaterThan(240 * 0.8);
      expect(Math.abs(1 / r.averagePace! - 1.4) / 1.4).toBeLessThan(0.35);
    }
  });
});
