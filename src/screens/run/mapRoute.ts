// The run's line on the MapLibre map (SPEC 12.2): solid in the accent colour, dashed across gaps,
// and a mark where the run started. Part of the lazy map chunk (only RunMapGl imports it). The
// layers are our own data, so they draw with or without tiles ("Map offline").
import { Marker, type GeoJSONSource, type Map as GlMap } from 'maplibre-gl';
import type { LngLat, RouteGeo } from '../../lib/run/routeGeo';
import styles from './RunMap.module.css';

const SOLID = 'run-route';
const DASHED = 'run-gaps';

const lines = (coordinates: LngLat[][]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates } });

/** Adds the two line layers to a freshly loaded style (again after every style reload). */
export function addRouteLayers(gl: GlMap, accent: string, halo: string): void {
  if (gl.getSource(SOLID)) return;
  gl.addSource(SOLID, { type: 'geojson', data: lines([]) });
  gl.addSource(DASHED, { type: 'geojson', data: lines([]) });
  const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
  // A dark edge under the line keeps it readable over light roads.
  gl.addLayer({ id: `${SOLID}-edge`, type: 'line', source: SOLID, layout: round, paint: { 'line-color': halo, 'line-width': 8, 'line-opacity': 0.55 } });
  gl.addLayer({ id: DASHED, type: 'line', source: DASHED, layout: { 'line-join': 'round' }, paint: { 'line-color': accent, 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [1.4, 1.6] } });
  gl.addLayer({ id: SOLID, type: 'line', source: SOLID, layout: round, paint: { 'line-color': accent, 'line-width': 5 } });
}

/** Draws the route. Returns false while the style is not ready (the caller tries again on style load). */
export function drawRouteOn(gl: GlMap, geo: RouteGeo): boolean {
  const solid = gl.getSource(SOLID) as GeoJSONSource | undefined;
  const dashed = gl.getSource(DASHED) as GeoJSONSource | undefined;
  if (!solid || !dashed) return false;
  solid.setData(lines(geo.solid));
  dashed.setData(lines(geo.dashed));
  return true;
}

/** The mark where the run started: a small ring, so it never reads as the runner's dot. */
export function startMarker(gl: GlMap, at: LngLat): Marker {
  const el = document.createElement('div');
  el.className = styles.startMark!;
  el.setAttribute('data-testid', 'run-start-mark');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Start of the run');
  return new Marker({ element: el }).setLngLat(at).addTo(gl);
}
