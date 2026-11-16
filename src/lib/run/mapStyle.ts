// The run map's look (SPEC 12.10): OpenFreeMap vector tiles (the OpenMapTiles layers) drawn in the
// app's own palette. Derived from OpenFreeMap's "dark" style: the same sources and layer filters,
// cut down to what a runner needs (water, parks, buildings, paths, roads, rail, names) and
// recoloured from the tokens passed in. No sprite (no icons on a calm map), one font stack.
// Pure: colours come in as #rrggbb strings (the screen reads them from src/styles/tokens.css).

import { TILE_ORIGIN } from './mapSource';

/** The tokens the map is painted from. */
export type MapPalette = { bg: string; text: string; text2: string; accent: string };
export const MAP_PALETTE_TOKENS: Readonly<Record<keyof MapPalette, string>> = { bg: '--bg', text: '--text', text2: '--text-2', accent: '--accent' };

const HEX = /^#([0-9a-f]{6})$/i;

/** `a` moved `t` of the way to `b` (0 to 1), as #rrggbb. Throws on anything that is not #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const parse = (c: string): number[] => {
    const m = HEX.exec(c.trim());
    if (!m) throw new Error(`mapStyle: not a #rrggbb colour: ${c}`);
    return [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16));
  };
  const [x, y] = [parse(a), parse(b)];
  const k = Math.min(1, Math.max(0, t));
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

type Layer = Record<string, unknown> & { id: string; type: string };
export type RunMapStyle = { version: 8; name: string; glyphs: string; sources: Record<string, unknown>; layers: Layer[] };

const SRC = 'openmaptiles';
const FONT = ['Noto Sans Regular'];
const polygon = ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false];
const line = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const cls = (...names: string[]) => ['match', ['get', 'class'], names, true, false];
const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];
/** A line width that grows with zoom: [zoom, px] pairs. */
const grow = (...stops: Array<[number, number]>) => ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()];

/** The whole style. `origin` is where tiles and glyphs come from (tests point it elsewhere). */
export function runMapStyle(p: MapPalette, origin: string = TILE_ORIGIN): RunMapStyle {
  const land = p.bg;
  const water = mix(p.bg, p.accent, 0.26);
  // Parks and woods: a step lighter than the land and leaning to the accent, so they read as open
  // ground without a second hue.
  const green = mix(mix(p.bg, p.text, 0.07), p.accent, 0.08);
  const building = mix(p.bg, p.text, 0.045);
  const path = mix(p.bg, p.text, 0.34);
  const minor = mix(p.bg, p.text, 0.21);
  const major = mix(p.bg, p.text, 0.29);
  const motorway = mix(p.bg, p.text, 0.35);
  const rail = mix(p.bg, p.text, 0.14);
  const border = mix(p.bg, p.text, 0.3);
  const roadName = mix(p.bg, p.text2, 0.85);
  const placeName = p.text2;
  const road = (id: string, filter: unknown[], color: string, width: unknown, minzoom: number): Layer => ({
    id,
    type: 'line',
    source: SRC,
    'source-layer': 'transportation',
    minzoom,
    filter: ['all', line, notTunnel, ...filter],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': width },
  });
  const label = (id: string, filter: unknown[], size: unknown, minzoom: number, maxzoom?: number): Layer => ({
    id,
    type: 'symbol',
    source: SRC,
    'source-layer': 'place',
    minzoom,
    ...(maxzoom ? { maxzoom } : {}),
    filter: ['all', ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false], ...filter],
    layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': FONT, 'text-size': size, 'text-max-width': 8, 'text-letter-spacing': 0.04 },
    paint: { 'text-color': placeName, 'text-halo-color': land, 'text-halo-width': 1.2 },
  });
  return {
    version: 8,
    name: 'AnyGym run map',
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sources: { [SRC]: { type: 'vector', url: `${origin}/planet` } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': land } },
      { id: 'green', type: 'fill', source: SRC, 'source-layer': 'landcover', filter: ['all', polygon, cls('wood', 'grass')], paint: { 'fill-color': green } },
      { id: 'park', type: 'fill', source: SRC, 'source-layer': 'park', filter: polygon, paint: { 'fill-color': green } },
      { id: 'water', type: 'fill', source: SRC, 'source-layer': 'water', filter: ['all', polygon, notTunnel], paint: { 'fill-color': water } },
      { id: 'waterway', type: 'line', source: SRC, 'source-layer': 'waterway', filter: line, paint: { 'line-color': water, 'line-width': grow([8, 0.6], [16, 3]) } },
      { id: 'building', type: 'fill', source: SRC, 'source-layer': 'building', minzoom: 14, filter: polygon, paint: { 'fill-color': building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1] } },
      { ...road('rail', [cls('rail', 'transit')], rail, grow([12, 0.5], [18, 2]), 12) },
      { ...road('path', [cls('path', 'track')], path, grow([14, 0.6], [18, 2.2]), 14), paint: { 'line-color': path, 'line-width': grow([14, 0.6], [18, 2.2]), 'line-dasharray': [2, 1.6] } },
      road('road-minor', [cls('minor', 'service')], minor, grow([12, 0.5], [14, 1.8], [18, 11]), 12),
      road('road-major', [cls('primary', 'secondary', 'tertiary', 'trunk')], major, grow([8, 0.5], [13, 2.2], [18, 16]), 8),
      road('road-motorway', [cls('motorway')], motorway, grow([5, 0.6], [13, 3], [18, 20]), 5),
      { id: 'border', type: 'line', source: SRC, 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!', ['has', 'claimed_by']]], paint: { 'line-color': border, 'line-width': 0.8, 'line-dasharray': [3, 2] } },
      {
        id: 'road-name',
        type: 'symbol',
        source: SRC,
        'source-layer': 'transportation_name',
        minzoom: 14,
        filter: line,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 13] },
        paint: { 'text-color': roadName, 'text-halo-color': land, 'text-halo-width': 1.2 },
      },
      label('place-small', [cls('suburb', 'neighbourhood', 'village', 'hamlet')], 11, 11),
      label('place-town', [cls('town')], ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 15], 7),
      label('place-city', [cls('city')], ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 18], 3, 15),
      label('place-country', [cls('country')], ['interpolate', ['linear'], ['zoom'], 1, 10, 6, 15], 1, 7),
    ],
  };
}

/** The view before the phone says where it is: the whole world, no place pretended. */
export const NEUTRAL_VIEW = { center: [0, 25] as [number, number], zoom: 0.6 } as const;
/** Street level around the runner. */
export const HERE_ZOOM = 15.5;
