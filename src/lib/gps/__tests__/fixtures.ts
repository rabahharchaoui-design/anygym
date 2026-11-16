// Synthetic tracks for the GPS tests (SPEC 12.3). Built by code with a seeded random, so every run
// of the tests sees the same points. Positions are laid out in meters on a flat patch around ORIGIN
// (exact enough over a few km: the tests state their tolerances).
import { EARTH_RADIUS_M } from '../geo';
import type { RawPoint } from '../types';

export const ORIGIN = { lat: 40, lng: -74 };

/** First timestamp of every fixture (ms). Any fixed value works; time only comes from the points. */
export const T0 = 1_700_000_000_000;

/** Seeded random in [0, 1): mulberry32. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded normal(0, 1): Box and Muller. */
export function seededNormal(seed: number): () => number {
  const rand = seeded(seed);
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

const DEG = 180 / Math.PI;

/** A reported position `east` and `north` meters from ORIGIN, `sec` seconds after T0. */
export function at(east: number, north: number, sec: number, accuracy = 5): RawPoint {
  return {
    lat: ORIGIN.lat + (north / EARTH_RADIUS_M) * DEG,
    lng: ORIGIN.lng + (east / (EARTH_RADIUS_M * Math.cos(ORIGIN.lat / DEG))) * DEG,
    t: T0 + sec * 1000,
    accuracy,
  };
}

/**
 * GPS error the way a phone shows it: not a fresh random jump every second but a slow wander
 * (each second keeps `keep` of the last error). `sigma` is the size of the wander per axis, meters.
 */
export function wander(seed: number, sigma: number, keep = 0.97): () => { east: number; north: number } {
  const normal = seededNormal(seed);
  const fresh = sigma * Math.sqrt(1 - keep * keep);
  let east = sigma * normal();
  let north = sigma * normal();
  return () => {
    east = keep * east + fresh * normal();
    north = keep * north + fresh * normal();
    return { east, north };
  };
}

const still = () => ({ east: 0, north: 0 });

type Noise = { seed: number; sigma: number } | null;
const noiseOf = (noise: Noise) => (noise ? wander(noise.seed, noise.sigma) : still);

/** A straight line east from (startEast, 0): one point a second, `seconds` seconds, `speed` m/s. */
export function straight(opts: { speed: number; seconds: number; startSec?: number; startEast?: number; noise?: Noise; accuracy?: number }): RawPoint[] {
  const err = noiseOf(opts.noise ?? null);
  const out: RawPoint[] = [];
  for (let i = 0; i <= opts.seconds; i++) {
    const e = err();
    out.push(at((opts.startEast ?? 0) + opts.speed * i + e.east, e.north, (opts.startSec ?? 0) + i, opts.accuracy));
  }
  return out;
}

export const LOOP_RADIUS_M = 150;
/** True length of one lap of the loop fixture. */
export const LOOP_LENGTH_M = 2 * Math.PI * LOOP_RADIUS_M;

/** A recorded style loop: one lap of a 150 m circle at 3 m/s, one point a second, with GPS wander. */
export function loop(noise: Noise, speed = 3): RawPoint[] {
  const err = noiseOf(noise);
  const seconds = Math.round(LOOP_LENGTH_M / speed);
  const out: RawPoint[] = [];
  for (let i = 0; i <= seconds; i++) {
    const angle = (2 * Math.PI * i) / seconds;
    const e = err();
    out.push(at(LOOP_RADIUS_M * Math.sin(angle) + e.east, LOOP_RADIUS_M * (1 - Math.cos(angle)) + e.north, (i * LOOP_LENGTH_M) / speed / seconds));
  }
  return out;
}

/** Standing on one spot for `seconds` seconds with GPS wander. */
export function standing(opts: { seed: number; sigma: number; seconds: number; startSec?: number; east?: number; accuracy?: number }): RawPoint[] {
  const err = wander(opts.seed, opts.sigma);
  const out: RawPoint[] = [];
  for (let i = 0; i <= opts.seconds; i++) {
    const e = err();
    out.push(at((opts.east ?? 0) + e.east, e.north, (opts.startSec ?? 0) + i, opts.accuracy ?? 8));
  }
  return out;
}
