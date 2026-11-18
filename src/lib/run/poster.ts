// The share card as data (PLAN 4.6, SPEC 12.9): a bold line, the city and the stats. Pure. No map
// tiles, and no position the privacy zone removed. The screen paints this; it does not recompute it.
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../intake/answers';
import { EARTH_RADIUS_M, fromRunPoint, toSegments, type GpsPoint } from '../gps';
import { formatElapsed } from '../timer';
import { distanceWithUnit, formatPace, paceUnit } from './format';
import { trimPrivacy } from './privacy';
import { rowPace } from './summary';

/** A point of the line, in a square from 0 to 1. North is up (smaller y). */
export type PosterPoint = { x: number; y: number };

export type Poster = {
  /** Solid pieces. Empty when there is nothing to draw. */
  lines: PosterPoint[][];
  /** The privacy zone covered the whole route. */
  routeHidden: boolean;
  /** The run's city, or null when it has none. Never a guess. */
  city: string | null;
  distance: string;
  time: string;
  pace: string;
  /** A short note about the line, or null. */
  note: string | null;
  mark: 'AnyGym';
};

const PAD = 0.08;

/** Local meters from `origin`, for the picture only. Records never use this. */
function local(origin: GpsPoint, p: GpsPoint): { x: number; y: number } {
  const lat = (origin.lat * Math.PI) / 180;
  const y = ((p.lat - origin.lat) * Math.PI) / 180 * EARTH_RADIUS_M;
  const x = ((p.lng - origin.lng) * Math.PI) / 180 * EARTH_RADIUS_M * Math.cos(lat);
  return { x, y };
}

/** Fit the pieces in the square, north up, with room around the line. */
export function projectRoute(pieces: readonly (readonly GpsPoint[])[]): PosterPoint[][] {
  const usable = pieces.filter((p) => p.length >= 2);
  const origin = usable[0]?.[0];
  if (!origin) return [];
  const locals = usable.map((piece) => piece.map((p) => local(origin, p)));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const piece of locals) {
    for (const p of piece) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 0)) return [];
  const scale = (1 - PAD * 2) / span;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return locals.map((piece) => piece.map((p) => ({ x: 0.5 + (p.x - midX) * scale, y: 0.5 - (p.y - midY) * scale })));
}

/** The card for this run. `privacy` trims the first and last 200 m (the default). */
export function posterOf(run: Run, unit: DistanceUnit, privacy: boolean): Poster {
  const solid = toSegments(run.points.map(fromRunPoint), run.gaps).map((s) => s.points);
  const trimmed = privacy ? trimPrivacy(run.points, run.gaps) : { pieces: solid, hidden: false };
  const lines = projectRoute(trimmed.pieces);
  const city = run.city?.trim() || null;
  const pace = formatPace(rowPace(run), unit);
  return {
    lines,
    routeHidden: trimmed.hidden,
    city,
    distance: distanceWithUnit(run.distanceM, unit),
    time: formatElapsed(run.movingSec),
    pace: `${pace} ${paceUnit(unit)}`,
    note: trimmed.hidden ? 'Route hidden' : privacy && lines.length > 0 ? 'Start and end hidden' : null,
    mark: 'AnyGym',
  };
}
