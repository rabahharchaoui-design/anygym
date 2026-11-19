// PLAN M0: turns the PNGs from tests/shots-m0.spec.ts (test-results/shots-m0/<set>/) into small
// WebP files in reports/monolith/<set>/. Needs cwebp (brew install webp).
// Usage: node scripts/shots-webp.mjs before
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const set = process.argv[2];
if (!set) throw new Error('usage: node scripts/shots-webp.mjs <set>');
const from = join('test-results/shots-m0', set);
const to = join('reports/monolith', set);
mkdirSync(to, { recursive: true });
for (const name of readdirSync(from).filter((f) => f.endsWith('.png'))) {
  execFileSync('cwebp', ['-quiet', '-q', '72', join(from, name), '-o', join(to, name.replace(/\.png$/, '.webp'))]);
}
console.log(`${to}: ${readdirSync(to).length} files`);
