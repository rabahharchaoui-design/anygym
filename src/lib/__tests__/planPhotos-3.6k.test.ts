import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alwaysPicksFor, planExerciseIds, planPhotoPaths } from '../planPhotos';
import { PHOTO_CACHE, warmPhotos, type CacheLike, type WarmDeps } from '../photoWarm';
import type { DemoImages } from '../exerciseInfo';
import { PLANS } from '../../data/plans';
import { demoFor } from '../../data/exerciseInfo';

const demo = (id: string): DemoImages => ({ webp: [`ex/${id}/0.webp`, `ex/${id}/1.webp`], jpg: [`ex/${id}/0.jpg`, `ex/${id}/1.jpg`] });
const item = (exerciseId: string) => ({ exerciseId, name: exerciseId });
const plan = {
  days: [
    { n: 1, name: 'A', blocks: [{ kind: 'single' as const, items: [item('squat')] }, { kind: 'pair' as const, items: [item('row'), item('curl')] }] },
    { n: 2, name: 'B', blocks: [{ kind: 'single' as const, items: [item('squat'), item('plank')] }] },
  ],
};

describe('planExerciseIds (PLAN 3.6k)', () => {
  it('lists every exercise once, Day 1 first, then the extra picks', () => {
    expect(planExerciseIds(plan)).toEqual(['squat', 'row', 'curl', 'plank']);
    expect(planExerciseIds(plan, ['swapA', 'row'])).toEqual(['squat', 'row', 'curl', 'plank', 'swapA']);
  });
  it('is empty with no plan', () => {
    expect(planExerciseIds(undefined, ['x'])).toEqual([]);
  });
});

describe('planPhotoPaths (PLAN 3.6k)', () => {
  const sure = (id: string) => (id === 'curl' ? null : demo(id));
  it('gives both frames of each sure demo in one format, each once', () => {
    expect(planPhotoPaths(['squat', 'curl', 'squat'], sure, 'webp')).toEqual(['ex/squat/0.webp', 'ex/squat/1.webp']);
    expect(planPhotoPaths(['row'], sure, 'jpg')).toEqual(['ex/row/0.jpg', 'ex/row/1.jpg']);
  });
  it('never lists a photo for an exercise without a sure demo (SPEC 4.3)', () => {
    expect(planPhotoPaths(['curl'], sure)).toEqual([]);
  });
  it('every shipped plan lists only sure photos that exist, never the whole catalog', () => {
    for (const p of PLANS) {
      const paths = planPhotoPaths(planExerciseIds(p), demoFor);
      for (const path of paths) {
        expect(path).toMatch(/^ex\/[^/]+\/[01]\.webp$/);
        expect(() => readFileSync(`public/${path}`)).not.toThrow();
      }
      expect(paths.length).toBeLessThan(200);
    }
  });
});

describe('alwaysPicksFor', () => {
  it('reads only this plan\'s picks', () => {
    expect(alwaysPicksFor('p1', [{ alwaysUse: { p1: 'a', p2: 'b' } }, {}, { alwaysUse: { p2: 'c' } }, { alwaysUse: { p1: 'd' } }])).toEqual(['a', 'd']);
  });
});

function fakeCache(kept: string[] = []) {
  const store = new Set(kept);
  const puts: string[] = [];
  const cache: CacheLike = {
    match: async (u) => (store.has(u) ? {} : undefined),
    put: async (u) => {
      store.add(u);
      puts.push(u);
    },
  };
  return { cache, puts };
}

function deps(cache: CacheLike, over: Partial<WarmDeps> = {}): WarmDeps & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    open: async () => cache,
    fetch: async (u) => {
      fetched.push(u);
      return new Response('x', { status: 200 });
    },
    idle: async () => undefined,
    online: () => true,
    ...over,
  };
}

describe('warmPhotos (PLAN 3.6k)', () => {
  it('uses the cache the service worker reads for ex/ photos', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain(`cacheName: '${PHOTO_CACHE}'`);
    expect(config).not.toMatch(/globPatterns:[^\n]*\bex\b/);
  });

  it('saves what is not kept and never refetches a kept photo', async () => {
    const { cache, puts } = fakeCache(['/a']);
    const d = deps(cache);
    expect(await warmPhotos(['/a', '/b', '/c'], d)).toEqual({ saved: 2, kept: 1, failed: 0, stopped: false });
    expect(d.fetched).toEqual(['/b', '/c']);
    expect(puts).toEqual(['/b', '/c']);
  });

  it('goes a few at a time, waiting for idle time before each batch', async () => {
    const { cache } = fakeCache();
    let idles = 0;
    let inFlight = 0;
    let most = 0;
    const d = deps(cache, {
      idle: async () => void idles++,
      fetch: async () => {
        most = Math.max(most, ++inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return new Response('x');
      },
    });
    await warmPhotos(['1', '2', '3', '4', '5', '6', '7'], d, undefined, 3);
    expect(idles).toBe(3);
    expect(most).toBeLessThanOrEqual(3);
  });

  it('keeps going past a failed photo and never keeps an error answer', async () => {
    const { cache, puts } = fakeCache();
    const d = deps(cache, {
      fetch: async (u) => {
        if (u === '/x') throw new Error('net');
        if (u === '/y') return new Response('nope', { status: 404 });
        return new Response('ok');
      },
    });
    expect(await warmPhotos(['/x', '/y', '/z'], d)).toEqual({ saved: 1, kept: 0, failed: 2, stopped: false });
    expect(puts).toEqual(['/z']);
  });

  it('stops when the phone goes offline or the plan changes', async () => {
    const { cache } = fakeCache();
    let on = true;
    const d = deps(cache, { online: () => on, fetch: async () => ((on = false), new Response('x')) });
    const r = await warmPhotos(['1', '2', '3', '4'], d, undefined, 2);
    expect(r).toMatchObject({ saved: 2, stopped: true });

    const stop = new AbortController();
    stop.abort();
    const d2 = deps(fakeCache().cache);
    expect(await warmPhotos(['1'], d2, stop.signal)).toMatchObject({ saved: 0, stopped: true });
    expect(d2.fetched).toEqual([]);
  });

  it('never throws when storage cannot open', async () => {
    const d = deps(fakeCache().cache, { open: async () => Promise.reject(new Error('quota')) });
    expect(await warmPhotos(['1'], d)).toMatchObject({ saved: 0, stopped: true });
  });
});
