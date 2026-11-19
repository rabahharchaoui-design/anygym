// PLAN 4.4b (13): the standing circle grows with the fixes' stated accuracy.
import { describe, expect, it } from 'vitest';
import { isStill, processPoints, STILL_RADIUS_CAP_M, STILL_RADIUS_M, type GpsPoint } from '..';
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
    // PLAN 4.4d (3): ...but never wider than STILL_RADIUS_CAP_M (6 m): a walk at 1.2 m/s covers 9.6 m
    // in 8 s and must not read as standing (was: half the accuracy, 10 m at 20 m).
    expect(isStill(win(STILL_RADIUS_CAP_M - 0.5, 20))).toBe(true);
    expect(isStill(win(STILL_RADIUS_CAP_M + 0.5, 20))).toBe(false);
    expect(isStill(win(9, 20))).toBe(false);
    expect(isStill(win(4.9, 10))).toBe(true);
    expect(isStill([pt(9, 0, 20), pt(0, 8, 5)])).toBe(false);
  });

  it('a still phone at 20 m accuracy adds almost nothing in five minutes, auto pause on or off, for 40 seeds', () => {
    for (const autoPause of [true, false]) {
      // PLAN 4.4d, measured with no phone speed (a phone that gives none): mean 3.1 m (was 12.0),
      // worst seed of 40 13.2 m (was 18.5 m). Moving again needs the way off the spot and walking
      // pace over the last 8 s, so slow drift never ends standing.
      const near = SEEDS.map((seed) => processPoints(standing({ seed, sigma: 5, seconds: 300, accuracy: 20 }), { ...KM, autoPause }).reading.distanceM);
      expect(Math.max(...near)).toBeLessThan(15);
      expect(mean(near)).toBeLessThan(5);
      // A wider wander (8 m a side at 20 m, wider than the phone claims): before 4.4b up to 300 m
      // was counted; before 4.4d mean 21.7 m, now 24.6 m (worst 124.7 m). Bound as before 4.4d.
      const wide = SEEDS.map((seed) => processPoints(standing({ seed, sigma: 8, seconds: 300, accuracy: 20 }), { ...KM, autoPause }).reading.distanceM);
      expect(mean(wide)).toBeLessThan(30);
      // The same phone with its own speed (0: lying still) adds nothing after its first 10 s, the
      // 8 s standing rule's time to see it (PLAN 4.4d: standing and moving again by the phone's speed).
      for (const seed of SEEDS) {
        const still = standing({ seed, sigma: 5, seconds: 300, accuracy: 20 }).map((p) => ({ ...p, speed: 0 }));
        const first = processPoints(still.slice(0, 11), { ...KM, autoPause }).reading.distanceM;
        expect(processPoints(still, { ...KM, autoPause }).reading.distanceM - first).toBe(0);
      }
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
