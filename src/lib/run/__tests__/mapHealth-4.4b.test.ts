import { describe, expect, it } from 'vitest';
import { HEALTHY, mapHealthStep, mapOffline, type MapHealthEvent } from '../mapHealth';

const after = (...es: MapHealthEvent[]) => es.reduce(mapHealthStep, HEALTHY);

describe('map offline chip (PLAN 4.4b 15)', () => {
  it('one failed tile says offline until a tile loads again', () => {
    expect(mapOffline(after({ type: 'error', tile: true }))).toBe(true);
    expect(mapOffline(after({ type: 'error', tile: true }, { type: 'tile-ok' }))).toBe(false);
    expect(after({ type: 'tile-ok' })).toBe(HEALTHY);
  });
  it('a style or WebGL failure holds through loaded tiles, until the retry', () => {
    const h = after({ type: 'error', tile: false }, { type: 'tile-ok' }, { type: 'error', tile: true }, { type: 'tile-ok' });
    expect(mapOffline(h)).toBe(true);
    expect(mapOffline(mapHealthStep(h, { type: 'retry' }))).toBe(false);
  });
});
