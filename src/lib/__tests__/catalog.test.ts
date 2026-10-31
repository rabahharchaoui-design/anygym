import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SAFE_ID, selectedCatalogIds, validateExerciseMap, type MapEntry } from '../catalog';

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8')) as T;
const map = read<MapEntry[]>('data/exercise-map.json');
const ladder = read<Record<string, string[]>>('data/catalog-ladder.json');
const catalog = read<{ source: { sha: string }; exercises: { id: string; reviewed: boolean; images: { jpg: string[]; webp: string[] } }[] }>('data/catalog.json');
const source = read<{ sha: string; repo: string }>('data/catalog-source.json');
const planIds = read<{ id: string }[]>('data/plan-exercises.json').map((p) => p.id);
const finisherIds = ['finisher-stair-climbing', 'finisher-jump-rope', 'finisher-cycling'];
const ids = new Set(catalog.exercises.map((e) => e.id));
const onDisk = (p: string) => existsSync(new URL(`../../../public/${p}`, import.meta.url));

describe('catalog source', () => {
  it('records a full pinned commit SHA, also in the generated catalog', () => {
    expect(source.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(source.repo).toBe('yuhonas/free-exercise-db');
    expect(catalog.source.sha).toBe(source.sha);
    expect(existsSync(new URL('../../../third_party/free-exercise-db-LICENSE.md', import.meta.url))).toBe(true);
  });
});

describe('exercise-map.json', () => {
  it('is valid and has an entry for every plan exercise and finisher', () => {
    expect(validateExerciseMap(map, [...planIds, ...finisherIds], ids)).toEqual([]);
  });
  it('only maps what is in the catalog, and the catalog is exactly the selected subset', () => {
    expect(catalog.exercises.map((e) => e.id).sort()).toEqual(selectedCatalogIds(map, ladder));
    expect(catalog.exercises.length).toBeGreaterThanOrEqual(120);
    expect(catalog.exercises.length).toBeLessThanOrEqual(180);
  });
  it('every exact and variant target has both photos in both formats, and all start unreviewed', () => {
    for (const e of map.filter((m) => m.match !== 'none')) {
      const rec = catalog.exercises.find((c) => c.id === e.catalogId)!;
      for (const p of [...rec.images.jpg, ...rec.images.webp]) expect(onDisk(p), p).toBe(true);
      expect(rec.images.jpg).toHaveLength(2);
    }
    for (const c of catalog.exercises) {
      expect(c.reviewed).toBe(false);
      expect(SAFE_ID.test(c.id)).toBe(true);
    }
  });
  it('photos are at most 720px wide', async () => {
    const rec = catalog.exercises[0]!;
    for (const p of [rec.images.jpg[0]!, rec.images.webp[1]!]) {
      const meta = await sharp(new URL(`../../../public/${p}`, import.meta.url).pathname).metadata();
      expect(meta.width).toBeLessThanOrEqual(720);
    }
  });
  it('covers all 17 movement patterns', () => {
    expect(Object.keys(ladder)).toHaveLength(17);
    for (const list of Object.values(ladder)) for (const id of list) expect(ids.has(id), id).toBe(true);
  });
});

describe('validateExerciseMap', () => {
  const ok: MapEntry = { planId: 'a', name: 'A', match: 'exact', catalogId: 'X', reason: 'same' };
  const ids2 = new Set(['X']);
  it('rejects the doubtful shapes', () => {
    expect(validateExerciseMap([ok], ['a'], ids2)).toEqual([]);
    expect(validateExerciseMap([ok], ['a', 'b'], ids2)).toHaveLength(1);
    expect(validateExerciseMap([ok, ok], ['a'], ids2).length).toBeGreaterThan(0);
    expect(validateExerciseMap([{ ...ok, catalogId: 'Y' }], ['a'], ids2).length).toBeGreaterThan(0);
    expect(validateExerciseMap([{ ...ok, match: 'variant' }], ['a'], ids2).length).toBeGreaterThan(0);
    expect(validateExerciseMap([{ ...ok, cue: 'c' }], ['a'], ids2).length).toBeGreaterThan(0);
    expect(validateExerciseMap([{ ...ok, match: 'none' }], ['a'], ids2).length).toBeGreaterThan(0);
    expect(validateExerciseMap([{ ...ok, match: 'none', catalogId: null, reason: ' ' }], ['a'], ids2).length).toBeGreaterThan(0);
    expect(validateExerciseMap([ok], ['b'], ids2).length).toBeGreaterThan(0);
  });
});
