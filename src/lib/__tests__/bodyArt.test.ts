import { describe, expect, it } from 'vitest';
import { BODIES, REGION_NAMES, REGIONS, regionFor, regionsIn, type BodyKind, type View } from '../bodyArt';
import { MUSCLE_REGIONS, SHOULDER_PARTS } from '../muscles';

// PLAN 2.2a: the four react-native-body-highlighter bodies, mapped to our region names.
const KINDS: BodyKind[] = ['male', 'female'];
const VIEWS: View[] = ['front', 'back'];

describe('body art', () => {
  it.each(KINDS.flatMap((k) => VIEWS.map((v) => [k, v] as const)))('%s %s: a viewBox, an outline and real path data', (k, v) => {
    const art = BODIES[k][v];
    expect(art.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true);
    expect(art.outline).toMatch(/^[mM]/);
    expect(art.shapes.length).toBeGreaterThan(10);
    for (const s of art.shapes) {
      expect(s.paths.length).toBeGreaterThan(0);
      for (const d of s.paths) expect(d).toMatch(/^[mM][\d\s.,-]/);
      if (s.region) expect(REGIONS).toContain(s.region);
    }
  });

  it('the female body is its own drawing, not the male one reused', () => {
    for (const v of VIEWS) {
      const male = new Set(BODIES.male[v].shapes.flatMap((s) => s.paths));
      expect(BODIES.female[v].shapes.flatMap((s) => s.paths).some((d) => male.has(d))).toBe(false);
    }
  });

  it('maps slugs: same names, adductors, deltoids split by view, the rest is resting body', () => {
    expect(regionFor('chest', 'front')).toBe('chest');
    expect(regionFor('upper-back', 'back')).toBe('upper-back');
    expect(regionFor('adductors', 'back')).toBe('adductor');
    expect(regionFor('deltoids', 'front')).toBe('front-deltoids');
    expect(regionFor('deltoids', 'back')).toBe('back-deltoids');
    for (const slug of ['hair', 'head', 'hands', 'feet', 'ankles', 'knees', 'tibialis']) expect(regionFor(slug, 'front')).toBeNull();
  });

  it('every region the catalog can light is drawn on both bodies', () => {
    const used = new Set([...Object.values(MUSCLE_REGIONS).flat(), ...Object.values(SHOULDER_PARTS).flatMap((p) => p.regions)]);
    for (const k of KINDS) {
      const drawn = new Set([...regionsIn(k, 'front'), ...regionsIn(k, 'back')]);
      for (const r of used) expect(drawn.has(r), `${k} ${r}`).toBe(true);
    }
    expect(regionsIn('male', 'front').has('front-deltoids')).toBe(true);
    expect(regionsIn('male', 'front').has('back-deltoids')).toBe(false);
    expect(regionsIn('female', 'back').has('back-deltoids')).toBe(true);
  });

  it('plain-word names', () => {
    expect(REGION_NAMES['front-deltoids']).toBe('Front delts');
    expect(REGION_NAMES['back-deltoids']).toBe('Rear delts');
    expect(REGION_NAMES.adductor).toBe('Inner thighs');
    expect(REGION_NAMES.gluteal).toBe('Glutes');
  });
});
