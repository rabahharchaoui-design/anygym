// The city heatmap (PLAN 4.6, SPEC 12.9): every finished run in one city, as one route to draw.
// Pure. The current city is the city of the latest finished run that has one. A run with no city
// is in no city's map. Cities are not looked up here (PLAN 4.7).
import type { Run } from '../../db/types';
import { drawRunRoute, type RouteGeo } from './routeGeo';

export const cityName = (run: Run): string | null => {
  const city = run.city?.trim();
  return city ? city : null;
};

const finished = (runs: readonly Run[]): Run[] => runs.filter((r) => r.endedAt !== undefined);

/** Cities that appear on a finished run, most recently finished first. */
export function citiesOf(runs: readonly Run[]): string[] {
  const ordered = finished(runs).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0) || b.startedAt - a.startedAt);
  const out: string[] = [];
  for (const run of ordered) {
    const city = cityName(run);
    if (city && !out.includes(city)) out.push(city);
  }
  return out;
}

/** The current city: the one on the latest finished run that has a city. Null when none do. */
export const currentCity = (runs: readonly Run[]): string | null => citiesOf(runs)[0] ?? null;

/** Finished runs in `city`, newest first. */
export function runsInCity(runs: readonly Run[], city: string): Run[] {
  return finished(runs)
    .filter((r) => cityName(r) === city)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
}

const EMPTY: RouteGeo = { solid: [], dashed: [], start: null, end: null, bounds: null };

/** Every run's line on one map. No single start mark: these are many runs. */
export function heatmapRoute(runs: readonly Run[]): RouteGeo {
  let geo: RouteGeo = EMPTY;
  for (const run of runs) {
    const part = drawRunRoute(run);
    if (!part.bounds) continue;
    const bounds = geo.bounds;
    geo = {
      solid: [...geo.solid, ...part.solid],
      dashed: [...geo.dashed, ...part.dashed],
      start: null,
      end: null,
      bounds: bounds
        ? [Math.min(bounds[0], part.bounds[0]), Math.min(bounds[1], part.bounds[1]), Math.max(bounds[2], part.bounds[2]), Math.max(bounds[3], part.bounds[3])]
        : part.bounds,
    };
  }
  return geo;
}
