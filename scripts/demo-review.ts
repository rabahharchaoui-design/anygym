// PLAN D0: turns G's demo review (data/reviews/demo-review-2026-11-19.json) into the one small file
// the app ships, src/data/demoHidden.json: the catalog sha and the ids G hid. His notes and times
// stay in the repo, never in the app. Refuses a review made for another catalog.
// Run: npm run demo-review   (--check: exit 1 when the committed file is out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import { hiddenList, parseDemoReview } from '../src/lib/demoReview.ts';

const root = new URL('../', import.meta.url).pathname;
const REVIEW = 'data/reviews/demo-review-2026-11-19.json';
const OUT = 'src/data/demoHidden.json';
const read = (p: string): unknown => JSON.parse(readFileSync(root + p, 'utf8'));

const catalog = read('data/catalog.json') as { source: { sha: string }; exercises: { id: string }[] };
const ids = new Set(catalog.exercises.map((e) => e.id));
const text = `${JSON.stringify(hiddenList(parseDemoReview(read(REVIEW), catalog.source.sha, ids), ids), null, 1)}\n`;
if (process.argv.includes('--check')) {
  const same = readFileSync(root + OUT, 'utf8') === text;
  console.log(same ? 'demo review: up to date' : 'demo review: out of date (run npm run demo-review)');
  process.exit(same ? 0 : 1);
}
writeFileSync(root + OUT, text);
console.log(`demo review: ${OUT} written`);
