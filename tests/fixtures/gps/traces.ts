// PLAN 4.4d (4): realistic iPhone style GPS traces for the replay tests, built by code with a seeded
// random, so every run of the tests sees the same fixes. These are SIMULATED traces, not G's phone:
// the noise model below is our best reading of how an iPhone reports, and is stated so it can be
// argued with. A real diagnostics export (or GPX) dropped next to this file replays the same way
// (load.ts).
//
// The noise model, per fix:
// - Reported accuracy a(t): the level (5, 15, 30 or 50 m) times a slow wobble between 0.6 and 1.5.
//   A cold start reports 60 m (within 5%) for the first 90 s.
// - The real error is tied to the reported accuracy (a phone that says 50 m is really further off):
//   a smooth bias, per axis a sum of three slow waves (periods 120 to 600 s) with a spread of
//   0.35 a(t), plus white jitter with a spread of 0.05 a(t). Phones filter their own fixes, so the
//   error drifts rather than jumping every second; when the accuracy changes (a cold start ends), the
//   bias changes with it, which looks like the jump a phone makes when it gets its GPS lock.
// - 1% of fixes are outliers: thrown 2 to 3 a(t) off in a random direction, still claiming a(t).
// - 3% of fixes repeat the previous position exactly with a new time (phones do that).
// - Delivery: a fix reaches the app 0.1 to 0.6 s after its stamp; 4% of the time delivery stalls for
//   1.5 to 4 s and the held fixes then arrive together, in order (late fixes).
// - Speed (coords.speed, true speed plus a spread of 0.2 m/s) is given only at 25 m accuracy or better
//   (the app's own "good GPS" line): phones give it only with a GPS lock. None in the cold start.
import { seeded, seededNormal } from '../../../src/lib/gps/__tests__/fixtures';
import { EARTH_RADIUS_M } from '../../../src/lib/gps/geo';

export const SPEEDS = { walk: 1.4, jog: 2.5, run: 3.5 } as const;
export type SpeedName = keyof typeof SPEEDS;
export const CADENCES = [1, 5] as const;
export type Cadence = (typeof CADENCES)[number];
export const NOISES = [5, 15, 30, 50] as const;
export type Noise = (typeof NOISES)[number];
/**
 * surge: steady, 30% faster from 300 to 420 s, then steady again (pace must follow).
 * cold-start: 60 m accuracy or worse for the first 90 s.
 * tunnel: no fix at all from 300 to 340 s while moving.
 * light: standing at a light from 300 to 330 s, the phone still reporting.
 * still: a phone lying still for 300 s (no distance may be added, live or at End).
 */
export const SCENARIOS = ['surge', 'cold-start', 'tunnel', 'light', 'still'] as const;
/** Not in the matrix, for the lag numbers of the report: walking at 1.4 m/s, running at 3.5 m/s from 300 s. */
export type Scenario = (typeof SCENARIOS)[number] | 'walk-to-run';

export type TraceSpec = { speed: SpeedName; cadence: Cadence; noise: Noise; scenario: Scenario; seed: number };

/** One fix as the phone gives it: its own stamp, when it reached the app, and what it says. */
export type TraceFix = { stamp: number; arrival: number; lat: number; lng: number; accuracy: number; speed: number | null };

export type Truth = {
  durationSec: number;
  /** True speed at `sec`, m/s. */
  speedAt: (sec: number) => number;
  /** True distance covered by `sec`, m. */
  distanceAt: (sec: number) => number;
  /** Seconds at which the speed changes (pace must follow). */
  changes: number[];
  /** No fix arrives in here. */
  tunnel: [number, number] | null;
  /** Standing in here. */
  stop: [number, number] | null;
};

export type Trace = { name: string; spec: TraceSpec | null; t0: number; fixes: TraceFix[]; truth: Truth | null };

export const T0 = 1_763_568_000_000;
const ORIGIN = { lat: 40.7812, lng: -73.9665 };
const DURATION_SEC = 600;
const DEG = 180 / Math.PI;

/** City blocks: east 200 m, north 120 m, east 200 m, south 120 m, again and again. */
function routeAt(m: number): { east: number; north: number } {
  const legs: Array<[number, number, number]> = [[1, 0, 200], [0, 1, 120], [1, 0, 200], [0, -1, 120]];
  const lap = 640;
  let east = Math.floor(m / lap) * 400;
  let north = 0;
  let left = m % lap;
  for (const [de, dn, len] of legs) {
    const take = Math.min(left, len);
    east += de * take;
    north += dn * take;
    left -= take;
    if (left <= 0) break;
  }
  return { east, north };
}

function profile(spec: TraceSpec): Truth {
  const v = SPEEDS[spec.speed];
  const s = spec.scenario;
  const speedAt = (sec: number): number => {
    if (s === 'walk-to-run') return sec < 300 ? 1.4 : 3.5;
    if (s === 'still') return 0;
    if (s === 'surge' && sec >= 300 && sec < 420) return v * 1.3;
    if (s === 'light' && sec >= 300 && sec < 330) return 0;
    return v;
  };
  const distanceAt = (sec: number): number => {
    const t = Math.max(0, Math.min(sec, DURATION_SEC));
    if (s === 'still') return 0;
    if (s === 'walk-to-run') return 1.4 * Math.min(t, 300) + 3.5 * Math.max(0, t - 300);
    if (s === 'surge') return v * t + 0.3 * v * Math.max(0, Math.min(t, 420) - 300);
    if (s === 'light') return v * t - v * Math.max(0, Math.min(t, 330) - 300);
    return v * t;
  };
  return {
    durationSec: s === 'still' ? 300 : DURATION_SEC,
    speedAt,
    distanceAt,
    changes: s === 'surge' ? [300, 420] : s === 'light' ? [330] : s === 'walk-to-run' ? [300] : [],
    tunnel: s === 'tunnel' ? [300, 340] : null,
    stop: s === 'light' ? [300, 330] : s === 'still' ? [0, 300] : null,
  };
}

/** A smooth unit spread wave: three slow sines with random periods and phases. */
function wave(rand: () => number): (sec: number) => number {
  const parts = [0, 1, 2].map(() => ({ period: 120 + rand() * 480, phase: rand() * 2 * Math.PI }));
  return (sec) => parts.reduce((sum, p) => sum + Math.sqrt(2 / 3) * Math.sin((2 * Math.PI * sec) / p.period + p.phase), 0);
}

const toLatLng = (east: number, north: number) => ({
  lat: ORIGIN.lat + (north / EARTH_RADIUS_M) * DEG,
  lng: ORIGIN.lng + (east / (EARTH_RADIUS_M * Math.cos(ORIGIN.lat / DEG))) * DEG,
});

export const traceName = (s: TraceSpec) => `${s.speed}-${s.cadence}s-${s.noise}m-${s.scenario}-seed${s.seed}`;

/**
 * One seeded trace. `biasOnly`: the same trace with only the smooth bias (no jitter, outliers,
 * repeats or stalls): what is left is the error no filter can tell from movement.
 */
export function makeTrace(spec: TraceSpec, opts: { biasOnly?: boolean; white?: boolean; exact?: boolean } = {}): Trace {
  const jitter = opts.biasOnly ? 0 : 0.05;
  const truth = profile(spec);
  const seed = spec.seed * 1009 + spec.noise * 31 + spec.cadence * 7 + SPEEDS[spec.speed] * 100 + (SCENARIOS as readonly string[]).indexOf(spec.scenario) * 50_000;
  const rand = seeded(seed);
  const normal = seededNormal(seed + 1);
  const biasE = wave(rand);
  const biasN = wave(rand);
  const wobble = wave(rand);
  const fixes: TraceFix[] = [];
  let stallUntil = -1;
  for (let sec = 0; sec <= truth.durationSec; sec += spec.cadence) {
    if (truth.tunnel && sec >= truth.tunnel[0] && sec < truth.tunnel[1]) continue;
    const at = sec + (spec.cadence === 5 && sec > 0 ? (rand() - 0.5) * 0.4 : 0);
    // The cold start says 60 m (within 5%) for its first 90 s, as the brief has it.
    const cold = spec.scenario === 'cold-start' && at < 90 && spec.noise < 60;
    const spread = cold ? Math.max(0.95, Math.min(1.05, 1 + 0.05 * wobble(at))) : Math.max(0.6, Math.min(1.5, 1 + 0.2 * wobble(at)));
    const accuracy = Math.round((cold ? 60 : spec.noise) * spread * 10) / 10;
    const pos = routeAt(truth.distanceAt(at));
    // `white`: the stress case, an error drawn afresh for every fix with the full spread the accuracy
    // claims (accuracy / 1.5 a side). Far harsher than a phone; reported, never a pass rule.
    // `exact`: no error at all, the accuracy still reported: what the filter itself lags.
    const k = opts.exact ? 0 : 1;
    let east = pos.east + k * (opts.white ? (accuracy / 1.5) * normal() : 0.35 * accuracy * biasE(at) + jitter * accuracy * normal());
    let north = pos.north + k * (opts.white ? (accuracy / 1.5) * normal() : 0.35 * accuracy * biasN(at) + jitter * accuracy * normal());
    if (!opts.biasOnly && !opts.exact && rand() < 0.01) {
      const angle = rand() * 2 * Math.PI;
      const jump = (2 + rand()) * accuracy;
      east += jump * Math.cos(angle);
      north += jump * Math.sin(angle);
    }
    const prev = fixes[fixes.length - 1];
    const repeat = !opts.biasOnly && prev && rand() < 0.03;
    const { lat, lng } = repeat ? prev : toLatLng(east, north);
    const stamp = T0 + Math.round(at * 1000);
    if (!opts.biasOnly && stallUntil < 0 && rand() < 0.04) stallUntil = stamp + Math.round((1.5 + rand() * 2.5) * 1000);
    let arrival = stamp + Math.round((0.1 + rand() * 0.5) * 1000);
    if (stallUntil >= 0) {
      if (stamp <= stallUntil) arrival = Math.max(arrival, stallUntil);
      else stallUntil = -1;
    }
    if (prev && arrival < prev.arrival) arrival = prev.arrival;
    const speed = accuracy <= 25 ? Math.max(0, truth.speedAt(at) + 0.2 * normal()) : null;
    fixes.push({ stamp, arrival, lat, lng, accuracy: repeat ? prev.accuracy : accuracy, speed });
  }
  return { name: traceName(spec), spec, t0: T0, fixes, truth };
}

/** Every combination for the given seeds: 3 speeds x 2 cadences x 4 noise levels x 5 scenarios each. */
export function matrix(seeds: readonly number[]): TraceSpec[] {
  const out: TraceSpec[] = [];
  for (const seed of seeds)
    for (const speed of Object.keys(SPEEDS) as SpeedName[])
      for (const cadence of CADENCES) for (const noise of NOISES) for (const scenario of SCENARIOS) out.push({ speed, cadence, noise, scenario, seed });
  return out;
}
