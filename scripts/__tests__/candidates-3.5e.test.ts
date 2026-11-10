// PLAN 3.5e: the candidate builder and the coverage report run with plain Node (no network) and
// reproduce the committed files exactly.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (script: string) => execFileSync(process.execPath, ['--import', './scripts/ts-resolve.mjs', script, '--check'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('candidate scripts', () => {
  it('build-candidates rebuilds data/catalog-candidates.json byte for byte', () => {
    expect(run('scripts/build-candidates.ts')).toMatch(/catalog-candidates\.json: up to date/);
  }, 60_000);
  it('coverage-report prints the committed reports/coverage-3.5e.md', () => {
    expect(run('scripts/coverage-report.ts')).toMatch(/coverage report: up to date/);
  }, 60_000);
});
