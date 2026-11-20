// PLAN 4.4d (4): a diagnostics export (Settings, 5 taps on the version, then the run's detail:
// Export diagnostics) or a GPX file dropped into tests/fixtures/gps/ becomes a replay trace, and
// replay-4.4d.test.ts replays every one of them on each test run. No truth is known for them, so
// they are held to the rules that need none (see that test).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiag } from '../../../src/lib/run/diag';
import type { Trace, TraceFix } from './traces';

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

/** A GPX has no accuracy: its points are taken as this sure (a typical iPhone fix outdoors). */
export const GPX_ACCURACY_M = 10;

/** The track points of a GPX file (lat, lon, time), one second apart when it has no times. */
export function parseGpx(text: string): TraceFix[] {
  const out: TraceFix[] = [];
  const re = /<trkpt\b[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    const body = m[3] ?? '';
    const time = /<time>([^<]+)<\/time>/.exec(body)?.[1];
    const stamp = time ? Date.parse(time) : 1_700_000_000_000 + i * 1000;
    out.push({ stamp, arrival: stamp, lat: Number(m[1]), lng: Number(m[2]), accuracy: GPX_ACCURACY_M, speed: null });
    i++;
  }
  return out;
}

/** One file as a trace, or null when it is neither a diagnostics export nor a GPX. */
export function traceFromFile(name: string, text: string): Trace | null {
  if (name.endsWith('.gpx')) {
    const fixes = parseGpx(text);
    return fixes.length ? { name, spec: null, t0: fixes[0]!.stamp, fixes, truth: null } : null;
  }
  const diag = parseDiag(text);
  if (!diag) return null;
  const fixes = diag.fixes.map(({ stamp, arrival, lat, lng, accuracy, speed }) => ({ stamp, arrival, lat, lng, accuracy, speed }));
  return { name, spec: null, t0: diag.startedAt, fixes, truth: null };
}

/** Every export and GPX in the folder (or `dir`), sorted by name. */
export function loadRecorded(dir = FIXTURE_DIR): Trace[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') || f.endsWith('.gpx'))
    .sort()
    .map((f) => traceFromFile(f, readFileSync(join(dir, f), 'utf8')))
    .filter((t): t is Trace => t !== null);
}
