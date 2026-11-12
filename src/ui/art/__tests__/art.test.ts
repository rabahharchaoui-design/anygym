import { describe, expect, it } from 'vitest';
import { medallion, rosettePath, wavePath } from '../passport/guilloche';
import { SCENES, SCENE_RATIO } from '../scenes';

const points = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);

describe('guilloche (PLAN 3.6h)', () => {
  it('a rosette is closed, stays inside its radius and dips by its depth', () => {
    const d = rosettePath(100, 100, 40, 8, 0.5);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const far = points(d).map(([x, y]) => Math.hypot(x - 100, y - 100));
    expect(Math.max(...far)).toBeLessThanOrEqual(40.01);
    expect(Math.min(...far)).toBeGreaterThanOrEqual(19.99);
    expect(Math.min(...far)).toBeLessThan(21);
  });

  it('the same numbers always give the same drawing', () => {
    expect(rosettePath(50, 50, 30, 7, 0.3)).toBe(rosettePath(50, 50, 30, 7, 0.3));
    expect(medallion(50, 50, 30)).toEqual(medallion(50, 50, 30));
    expect(medallion(50, 50, 30, 4)).toHaveLength(4);
  });

  it('a wave band spans its width and stays inside its amplitude', () => {
    const pts = points(wavePath(300, 20, 6, 9));
    expect(pts[0]![0]).toBe(0);
    expect(pts[pts.length - 1]![0]).toBe(300);
    for (const [, y] of pts) expect(Math.abs(y - 20)).toBeLessThanOrEqual(6.01);
  });
});

describe('scenes (PLAN 3.6h)', () => {
  it('there is a scene for each empty state and hero, all one shape', () => {
    expect([...SCENES].sort()).toEqual(['history', 'planReady', 'plans', 'today', 'welcome']);
    expect(SCENE_RATIO).toBe(0.7);
  });
});
