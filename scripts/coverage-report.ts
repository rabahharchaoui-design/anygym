// Prints the PLAN 3.5e coverage table and writes reports/coverage-3.5e.md. No network.
// Run: npm run coverage-report   (--check: only compare with the committed report, exit 1 when it differs)
import { readFileSync, writeFileSync } from 'node:fs';
import { eligibleDemos } from '../src/lib/exerciseInfo.ts';
import type { MapEntry } from '../src/lib/catalog.ts';
import { sureLadderMoves } from '../src/lib/candidates/coverage.ts';
import { coverageReport } from '../src/lib/candidates/report.ts';
import { EXTRA_GROUPS, type CandidateFile } from '../src/lib/candidates/types.ts';
import type { PatternFile } from '../src/lib/swap.ts';

const root = new URL('../', import.meta.url).pathname;
const readJson = <T>(p: string): T => JSON.parse(readFileSync(root + p, 'utf8')) as T;

const catalogIds = new Set(readJson<{ exercises: { id: string }[] }>('data/catalog.json').exercises.map((e) => e.id));
const eligible = eligibleDemos(readJson<MapEntry[]>('data/exercise-map.json'), readJson<{ exercises: { catalogId: string }[] }>('data/catalog-demos.json').exercises, catalogIds);
const patterns = readJson<PatternFile>('data/patterns.json').patterns;
const file = readJson<CandidateFile>('data/catalog-candidates.json');
const curation = readJson<{ photos: Record<string, string> }>('data/candidate-curation.json');
const report = coverageReport({
  sure: sureLadderMoves(patterns, (id) => eligible.has(id)),
  candidates: file.candidates,
  groups: [...Object.keys(patterns), ...EXTRA_GROUPS],
  dropped: Object.values(curation.photos).filter((n) => n.startsWith('drop')).length,
  sourceTotal: readJson<{ total: number }>('data/candidate-source.json').total,
  catalogTotal: catalogIds.size,
});
if (process.argv.includes('--check')) {
  const same = readFileSync(root + 'reports/coverage-3.5e.md', 'utf8') === report.text;
  console.log(same ? 'coverage report: up to date' : 'coverage report: out of date (run npm run coverage-report)');
  process.exit(same ? 0 : 1);
}
writeFileSync(root + 'reports/coverage-3.5e.md', report.text);
console.log(report.text);
