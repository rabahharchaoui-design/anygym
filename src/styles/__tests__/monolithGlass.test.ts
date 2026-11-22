import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

// Glass blur obscures text and is outside the Monolith visual system. Photo artwork may still use
// a normal filter; this guard is specifically for blur applied to content behind a UI surface.
it('does not add backdrop blur to app styles', () => {
  const root = join(__dirname, '../..');
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((p) => p.endsWith('.css'));
  const offenders: string[] = [];
  for (const file of files) {
    const css = readFileSync(join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/(?:-webkit-)?backdrop-filter\s*:\s*([^;}]*)/g)) {
      if (match[1]?.trim() !== 'none') offenders.push(`${relative(root, join(root, file))}: ${match[0]}`);
    }
  }
  expect(offenders).toEqual([]);
});
