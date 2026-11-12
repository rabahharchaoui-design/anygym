import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { checkSizes, countLines, isCounted, planUpdate } from '../size-guard.mjs';

type Sizes = Record<string, number>;
const check = (sizes: Sizes, baseline: Sizes) => checkSizes(sizes, baseline) as { failures: string[]; notes: string[] };
const update = (sizes: Sizes, baseline: Sizes, allow: string[] = []) =>
  planUpdate(sizes, baseline, allow) as { baseline: Sizes; refused: string[]; warnings: string[] };

describe('size guard rules (PLAN 3.6x)', () => {
  it('counts lines like an editor', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('a\r\nb\r\n')).toBe(2);
  });

  it('counts only source under src, not tests, data, json or the map', () => {
    expect(isCounted('src/lib/plans.ts')).toBe(true);
    expect(isCounted('src/ui/Button.module.css')).toBe(true);
    expect(isCounted('src/screens/a/B.tsx')).toBe(true);
    for (const no of ['src/lib/__tests__/a.test.ts', 'src/lib/a.test.ts', 'src/data/plans.ts', 'src/vite-env.d.ts', 'src/MAP.md', 'src/x.json', 'scripts/a.ts', 'src/lib/load/steps.ts-E']) {
      expect(isCounted(no), no).toBe(false);
    }
  });

  it('a new file over the limit fails and names the file, its lines and the limit', () => {
    const { failures } = check({ 'src/lib/big.ts': 401 }, {});
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('src/lib/big.ts');
    expect(failures[0]).toContain('401');
    expect(failures[0]).toContain('400');
    expect(failures[0]).toMatch(/Split/);
  });

  it('a new file at the limit or under passes', () => {
    expect(check({ 'src/lib/a.ts': 400, 'src/lib/b.ts': 12 }, {}).failures).toEqual([]);
  });

  it('a baseline file may not grow, even by one line', () => {
    const { failures } = check({ 'src/lib/old.ts': 501 }, { 'src/lib/old.ts': 500 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('src/lib/old.ts');
    expect(failures[0]).toContain('501');
    expect(failures[0]).toContain('500');
  });

  it('a baseline file that stays the same passes quietly', () => {
    expect(check({ 'src/lib/old.ts': 500 }, { 'src/lib/old.ts': 500 })).toEqual({ failures: [], notes: [] });
  });

  it('a baseline file that shrinks passes and says so', () => {
    const r = check({ 'src/lib/old.ts': 450 }, { 'src/lib/old.ts': 500 });
    expect(r.failures).toEqual([]);
    expect(r.notes[0]).toContain('--update');
  });

  it('a baseline file that drops to the limit or under, or disappears, passes and says so', () => {
    const r = check({ 'src/lib/old.ts': 400 }, { 'src/lib/old.ts': 500, 'src/lib/gone.ts': 450 });
    expect(r.failures).toEqual([]);
    expect(r.notes).toHaveLength(2);
  });

  it('update lowers numbers and removes files at the limit or gone', () => {
    const r = update({ 'src/a.ts': 450, 'src/b.ts': 380, 'src/c.ts': 500 }, { 'src/a.ts': 500, 'src/b.ts': 420, 'src/gone.ts': 410, 'src/c.ts': 500 });
    expect(r.refused).toEqual([]);
    expect(r.baseline).toEqual({ 'src/a.ts': 450, 'src/c.ts': 500 });
  });

  it('update never raises a number', () => {
    const r = update({ 'src/a.ts': 520 }, { 'src/a.ts': 500 });
    expect(r.refused).toHaveLength(1);
    expect(r.baseline['src/a.ts']).toBe(500);
  });

  it('update never adds a file', () => {
    const r = update({ 'src/new.ts': 450 }, {});
    expect(r.refused).toHaveLength(1);
    expect(r.baseline).toEqual({});
  });

  it('--allow-grow raises or adds one named file, and warns loudly', () => {
    const r = update({ 'src/a.ts': 520, 'src/new.ts': 450 }, { 'src/a.ts': 500 }, ['src/a.ts']);
    expect(r.baseline['src/a.ts']).toBe(520);
    expect(r.warnings[0]).toMatch(/WARNING/);
    expect(r.refused).toHaveLength(1);
    expect(r.refused[0]).toContain('src/new.ts');
  });
});
