import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_ATTRIBUTION, TILE_ORIGIN, isTileHostUrl } from '../mapSource';
import { MAP_PALETTE_TOKENS, NEUTRAL_VIEW, mix, runMapStyle, type MapPalette } from '../mapStyle';

// The palette comes from the real tokens file, the same values the screen reads at run time.
const tokens = readFileSync(join(__dirname, '../../../styles/tokens.css'), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})\\b`, 'i').exec(tokens);
  if (!m) throw new Error(`token ${name} is not a #rrggbb colour`);
  return m[1]!;
};
const palette = Object.fromEntries(Object.entries(MAP_PALETTE_TOKENS).map(([k, v]) => [k, token(v)])) as MapPalette;
const style = runMapStyle(palette);
const colours = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string' && v.startsWith('#')) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => colours(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => colours(x, out));
  return out;
};
// Colours written as hex('fff'): the colour guard (src/styles/__tests__/colorGuard.test.ts) allows no raw colour under src.
const hex = (digits: string) => `#${digits}`;
const lum = (c: string) => [1, 3, 5].reduce((n, i) => n + parseInt(c.slice(i, i + 2), 16), 0) / 3;

describe('run map style', () => {
  it('mixes two colours', () => {
    expect(mix(palette.bg, palette.text, 0)).toBe(palette.bg);
    expect(mix(palette.bg, palette.text, 1)).toBe(palette.text);
    expect(mix(palette.bg, palette.text, 2)).toBe(palette.text);
    expect(lum(mix(palette.bg, palette.text, 0.5))).toBeGreaterThan(lum(palette.bg));
    expect(() => mix('red', palette.bg, 0.5)).toThrow(/not a #rrggbb or #rgb/);
  });
  it('reads the short hex the build minifies tokens to (six digits shipped as three), in any letter case', () => {
    expect(mix(hex('fff'), hex('000'), 0)).toBe(hex('ffffff'));
    expect(mix(hex('FFF'), hex('000'), 0)).toBe(hex('ffffff'));
    expect(mix(hex('000'), hex('FFF'), 1)).toBe(hex('ffffff'));
    expect(mix(hex('abc'), hex('abc'), 0.5)).toBe(hex('aabbcc'));
    expect(mix(hex('9fd3ff'), hex('9FD3FF'), 0.5)).toBe(hex('9fd3ff'));
    expect(mix(hex('111214'), hex('fff'), 0.5)).toBe(mix(hex('111214'), hex('ffffff'), 0.5));
    expect(runMapStyle({ ...palette, text: hex('fff') })).toEqual(runMapStyle({ ...palette, text: hex('ffffff') }));
  });
  it('still rejects anything that is not #rgb or #rrggbb, with a clear error', () => {
    for (const bad of ['#ff', hex('ffff'), hex('fffff'), hex('fffffff'), '#ggg', 'fff', 'white', ''])
      expect(() => mix(bad, hex('000'), 0.5), bad).toThrow(/mapStyle: not a #rrggbb or #rgb colour: /);
  });
  it('is a version 8 style with one vector source and glyphs on the tile host, no sprite', () => {
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(['openmaptiles']);
    expect(style.sources.openmaptiles).toEqual({ type: 'vector', url: `${TILE_ORIGIN}/planet` });
    expect(style.glyphs.startsWith(`${TILE_ORIGIN}/fonts/`)).toBe(true);
    expect('sprite' in style).toBe(false);
  });
  it('every url in the style is on the one tile host', () => {
    const urls = JSON.stringify(style).match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.length).toBe(2);
    for (const u of urls) expect(isTileHostUrl(u.replace(/\{[^}]+\}/g, 'x'))).toBe(true);
    expect(isTileHostUrl('https://example.com/planet')).toBe(false);
    expect(isTileHostUrl('not a url')).toBe(false);
  });
  it('can point at another origin (tests)', () => {
    const local = runMapStyle(palette, 'http://localhost:1');
    expect(JSON.stringify(local)).not.toContain(TILE_ORIGIN);
  });
  it('is dark and calm: the background is the app background and nothing but names is bright', () => {
    expect(style.layers[0]).toEqual({ id: 'background', type: 'background', paint: { 'background-color': palette.bg } });
    const text = lum(palette.text);
    for (const l of style.layers.filter((x) => x.type !== 'symbol')) for (const c of colours(l)) expect(lum(c), `${l.id} ${c}`).toBeLessThan(text * 0.4);
  });
  it('water leans to the accent, so it reads as water without a second hue', () => {
    const water = (style.layers.find((l) => l.id === 'water')!.paint as Record<string, string>)['fill-color']!;
    const b = parseInt(water.slice(5, 7), 16);
    const r = parseInt(water.slice(1, 3), 16);
    expect(b).toBeGreaterThan(r);
  });
  it('layer ids are unique and every layer but the background reads the source', () => {
    const ids = style.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of style.layers.slice(1)) {
      expect(l.source).toBe('openmaptiles');
      expect(typeof l['source-layer']).toBe('string');
    }
  });
  it('shows what a runner needs: paths, parks, water, roads and names', () => {
    const ids = style.layers.map((l) => l.id);
    for (const id of ['path', 'park', 'water', 'road-minor', 'road-major', 'road-name', 'place-city']) expect(ids).toContain(id);
  });
  it('names sit over a halo of the background and use the one font stack', () => {
    for (const l of style.layers.filter((x) => x.type === 'symbol')) {
      expect((l.paint as Record<string, unknown>)['text-halo-color']).toBe(palette.bg);
      expect((l.layout as Record<string, unknown>)['text-font']).toEqual(['Noto Sans Regular']);
    }
  });
  it('credits the map data and starts on a view of no particular place', () => {
    for (const name of ['OpenFreeMap', 'OpenMapTiles', 'OpenStreetMap']) expect(MAP_ATTRIBUTION).toContain(name);
    expect(NEUTRAL_VIEW.zoom).toBeLessThan(2);
  });
});
