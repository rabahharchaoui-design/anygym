import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PLAN 1.10a: every Playwright spec goes through tests/fixtures.ts, which blocks the network
// outside localhost and closes popups (so the Music and Spotify buttons never launch apps).
// Only the live site check talks to the real network, with its own config.
const TESTS = join(__dirname, '..', '..', '..', 'tests');
const ALLOWED = new Set(['live_check.spec.ts']); // relative to tests/
const specs = (readdirSync(TESTS, { recursive: true }) as string[])
  .map((f) => f.split('\\').join('/'))
  .filter((f) => /\.(spec|test)\.tsx?$/.test(f) && !ALLOWED.has(f));
const read = (f: string) => readFileSync(join(TESTS, f), 'utf8');

describe('Playwright specs use the network guarded fixtures', () => {
  it('finds the specs', () => {
    expect(specs.length).toBeGreaterThan(5);
  });

  it.each(specs)('%s does not import from @playwright/test', (f) => {
    expect(read(f)).not.toMatch(/['"]@playwright\/test['"]/);
  });

  it.each(specs)('%s imports test from ./fixtures', (f) => {
    expect(read(f)).toMatch(/from ['"](\.\.?\/)+fixtures['"]/);
  });

  it.each(specs)('%s guards every context it makes itself', (f) => {
    const bad = read(f)
      .split('\n')
      .filter((line) => /\.newContext\(/.test(line) && !line.includes('guardContext('));
    expect(bad).toEqual([]);
  });
});
