// Rewrites only the muscle map section of CATALOG_REPORT.md (SPEC 4.5) from the committed
// data/catalog.json and data/muscle-overrides.json, without fetching anything. Run: npm run muscle-report
// (scripts/build-catalog.ts writes the same section when it rebuilds the whole catalog).
import { readFileSync, writeFileSync } from 'node:fs';
import { muscleReportLines, type CatalogMuscles, type MuscleOverrides } from '../src/lib/muscles.ts';

const root = new URL('../', import.meta.url).pathname;
const catalog = JSON.parse(readFileSync(root + 'data/catalog.json', 'utf8')) as { exercises: CatalogMuscles[] };
const overrides = JSON.parse(readFileSync(root + 'data/muscle-overrides.json', 'utf8')) as MuscleOverrides;
const report = readFileSync(root + 'CATALOG_REPORT.md', 'utf8');
const at = report.search(/^## Muscle(s to resolve| map) \(SPEC 4\.5\)$/m);
if (at < 0) throw new Error('CATALOG_REPORT.md has no SPEC 4.5 section');
writeFileSync(root + 'CATALOG_REPORT.md', report.slice(0, at) + muscleReportLines(catalog.exercises, overrides).join('\n'));
console.log('CATALOG_REPORT.md: muscle map section updated');
