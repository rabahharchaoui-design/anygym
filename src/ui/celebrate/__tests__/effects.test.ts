import { describe, expect, it } from 'vitest';
import { EFFECTS, EFFECT_CAP, cappedCount, effectFor } from '../effects';
import { KIND_ORDER } from '../select';
import { seeded } from '../seeded';
import { ring } from '../fx/ring';
import { shards } from '../fx/shards';
import { trail } from '../fx/trail';

describe('effect selection (PLAN 3.6h)', () => {
  it('each kind of moment gets its effect; anything else the burst', () => {
    expect(effectFor('first_workout')).toBe('shards');
    expect(effectFor('lift_record')).toBe('burst');
    expect(effectFor('level_up')).toBe('ring');
    expect(effectFor('run_record')).toBe('trail');
    for (const kind of KIND_ORDER) expect(EFFECTS).toContain(effectFor(kind));
    // The ambient is a backdrop, never a moment's effect.
    expect(KIND_ORDER.map(effectFor)).not.toContain('ambient');
  });

  it('piece counts never pass the cap, and the caps stay small', () => {
    for (const v of EFFECTS) {
      expect(EFFECT_CAP[v]).toBeLessThanOrEqual(48);
      expect(cappedCount(v)).toBe(EFFECT_CAP[v]);
      expect(cappedCount(v, 10_000)).toBe(EFFECT_CAP[v]);
      expect(cappedCount(v, 0)).toBe(1);
    }
    expect(cappedCount('burst', 16)).toBe(16);
  });

  it('every drawn effect makes exactly the pieces asked for, the same ones every time', () => {
    for (const [fx, n] of [[shards, 14], [ring, 12], [trail, 8]] as const) {
      const a = fx.make(n, seeded(7), 390, 800);
      const b = fx.make(n, seeded(7), 390, 800);
      expect(a).toHaveLength(n);
      expect(a).toEqual(b);
      expect(fx.stillAt).toBeGreaterThan(0);
      expect(fx.stillAt).toBeLessThanOrEqual(1);
      expect(fx.life).toBeLessThanOrEqual(1000);
    }
  });
});
