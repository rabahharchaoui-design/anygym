// PLAN 4.4b (13): the standing circle grows with the fixes' stated accuracy.
import { describe, expect, it } from 'vitest';
import { isStill, processPoints, STILL_RADIUS_M, type GpsPoint } from '..';
import { standing, straight } from './fixtures';

const KM = { splitM: 1000 };
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('standing still at poor accuracy (PLAN 4.4b 13)', () => {
  it('the circle is 4 m at good accuracy and grows with the worse fixes, from the surer of each pair', () => {
    const pt = (east: number, sec: number, accuracy: number): GpsPoint => ({ lat: 40, lng: -74 + east / 85_000, t: sec * 1000, accuracy });
    const win = (dx: number, acc: number) => [0, 2, 4, 6, 8].map((s) => pt(s === 0 ? dx : 0, s, acc));
    expect(isStill(win(STILL_RADIUS_M - 0.5, 5))).toBe(true);
    expect(isStill(win(STILL_RADIUS_M + 0.5, 5))).toBe(false);
    expect(isStill(win(9, 20))).toBe(true);
    expect(isStill(win(11, 20))).toBe(false);
    expect(isStill([pt(9, 0, 20), pt(0, 8, 5)])).toBe(false);
  });

  it('a still phone at 20 m accuracy adds almost nothing in five minutes, auto pause on or off, for 40 seeds', () => {
    for (const autoPause of [true, false]) {
      const near = SEEDS.map((seed) => processPoints(standing({ seed, sigma: 5, seconds: 300, accuracy: 20 }), { ...KM, autoPause }).reading.distanceM);
      expect(Math.max(...near)).toBeLessThan(20);
      // A wider wander (8 m a side at 20 m): before 4.4b up to 300 m was counted.
      const wide = SEEDS.map((seed) => processPoints(standing({ seed, sigma: 8, seconds: 300, accuracy: 20 }), { ...KM, autoPause }).reading.distanceM);
      expect(mean(wide)).toBeLessThan(30);
    }
  });

  it('a slow walk is still counted: at 5 m in full with its time, at 20 m its distance, and a jog at 20 m keeps its time', () => {
    for (const seed of SEEDS) {
      const good = processPoints(straight({ speed: 1, seconds: 300, noise: { seed, sigma: 1.25 }, accuracy: 5 }), KM).reading;
      expect(Math.abs(good.distanceM - 300) / 300).toBeLessThan(0.07);
      expect(good.movingSec).toBe(300);
      const poor = processPoints(straight({ speed: 1, seconds: 300, noise: { seed, sigma: 5 }, accuracy: 20 }), KM).reading;
      expect(Math.abs(poor.distanceM - 300) / 300).toBeLessThan(0.3);
      const jog = processPoints(straight({ speed: 2.5, seconds: 300, noise: { seed, sigma: 5 }, accuracy: 20 }), KM).reading;
      expect(Math.abs(jog.distanceM - 750) / 750).toBeLessThan(0.16);
      expect(jog.movingSec).toBeGreaterThan(280);
    }
  });
});
