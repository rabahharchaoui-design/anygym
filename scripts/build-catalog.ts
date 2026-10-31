// Builds the exercise catalog (PLAN 2.1, SPEC 4). Run: NODE_USE_ENV_PROXY=1 npm run catalog
// (the env var only matters behind a proxy; Node 22.6+ runs TypeScript directly).
// Downloads yuhonas/free-exercise-db at the pinned SHA in data/catalog-source.json, keeps only the
// curated subset (every target in data/exercise-map.json plus data/catalog-ladder.json), optimizes
// the photos into public/ex/<id>/{0,1}.{jpg,webp}, then writes data/catalog.json, the license copy
// and CATALOG_REPORT.md. The map itself is hand written and never changed here. Normal builds use
// the committed outputs and never touch the network. Output is staged, so a failure keeps the old files.
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { SAFE_ID, selectedCatalogIds, validateExerciseMap, type MapEntry } from '../src/lib/catalog.ts';
import { muscleReportLines, type MuscleOverrides } from '../src/lib/muscles.ts';

const root = new URL('../', import.meta.url).pathname;
const readJson = <T>(p: string): T => JSON.parse(readFileSync(root + p, 'utf8')) as T;
const source = readJson<{ repo: string; sha: string; license: string; licenseFile: string }>('data/catalog-source.json');
const map = readJson<MapEntry[]>('data/exercise-map.json');
const ladder = readJson<Record<string, string[]>>('data/catalog-ladder.json');
const planIds = readJson<{ id: string }[]>('data/plan-exercises.json').map((p) => p.id);
const finisherIds = ['finisher-stair-climbing', 'finisher-jump-rope', 'finisher-cycling'];

const WIDTH = 640; // phone sheet is about 360 pt wide; 640 stays sharp at 2x without bloat (SPEC says max 720)
const raw = `https://raw.githubusercontent.com/${source.repo}/${source.sha}`;

interface Upstream {
  id: string; name: string; force: string | null; level: string; mechanic: string | null;
  equipment: string | null; primaryMuscles: string[]; secondaryMuscles: string[];
  instructions: string[]; category: string; images: string[];
}

async function get(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`); // never save an error page as an image
  return Buffer.from(await res.arrayBuffer());
}

const ids = selectedCatalogIds(map, ladder);
const problems = validateExerciseMap(map, [...planIds, ...finisherIds], new Set(ids));
if (problems.length) throw new Error('exercise-map.json is invalid:\n' + problems.join('\n'));
for (const id of ids) if (!SAFE_ID.test(id)) throw new Error(`unsafe catalog id ${id}`);

const all = JSON.parse((await get(`${raw}/dist/exercises.json`)).toString('utf8')) as Upstream[];
const byId = new Map(all.map((e) => [e.id, e]));
const missing = ids.filter((id) => !byId.has(id));
if (missing.length) throw new Error('not in the source: ' + missing.join(', '));

const stage = root + 'public/.ex-stage/';
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const records = [];
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++]!;
    const up = byId.get(id)!;
    if (up.images.length < 2) throw new Error(`${id}: needs two photos`);
    mkdirSync(stage + id, { recursive: true });
    for (let i = 0; i < 2; i++) {
      const img = sharp(await get(`${raw}/exercises/${up.images[i]}`)).rotate().resize({ width: WIDTH, withoutEnlargement: true });
      await img.clone().jpeg({ quality: 72, mozjpeg: true }).toFile(`${stage}${id}/${i}.jpg`);
      await img.clone().webp({ quality: 72 }).toFile(`${stage}${id}/${i}.webp`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

for (const id of ids) {
  const up = byId.get(id)!;
  records.push({
    id, name: up.name, equipment: up.equipment, category: up.category, level: up.level,
    force: up.force, mechanic: up.mechanic,
    primaryMuscles: up.primaryMuscles, secondaryMuscles: up.secondaryMuscles,
    instructions: up.instructions,
    // Base relative (no leading slash) so they resolve under /anygym/.
    images: { jpg: [`ex/${id}/0.jpg`, `ex/${id}/1.jpg`], webp: [`ex/${id}/0.webp`, `ex/${id}/1.webp`] },
    reviewed: false,
  });
}

// Swap in the new photos only once everything succeeded.
const live = root + 'public/ex/';
rmSync(live, { recursive: true, force: true });
renameSync(stage, live);
writeFileSync(root + 'data/catalog.json', JSON.stringify({ source: { repo: source.repo, sha: source.sha, license: source.license }, exercises: records }, null, 1) + '\n');
writeFileSync(root + 'third_party/free-exercise-db-LICENSE.md', (await get(`${raw}/${source.licenseFile}`)).toString('utf8'));

// CATALOG_REPORT.md (SPEC 4.3): one row per plan exercise, for the tester who opens the images.
const size = (p: string) => statSync(root + 'public/' + p).size;
let total = 0, webpTotal = 0;
for (const r of records) {
  for (const p of r.images.jpg) total += size(p);
  for (const p of r.images.webp) { total += size(p); webpTotal += size(p); }
}
const count = (m: string) => map.filter((e) => e.match === m).length;
const kb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const lines = [
  '# Catalog report',
  '',
  `Source: ${source.repo} at commit \`${source.sha}\` (${source.license}). Generated by scripts/build-catalog.ts.`,
  '',
  `- Catalog exercises: ${records.length} (each has two photos as JPG and WebP, ${WIDTH}px wide, all \`reviewed: false\`)`,
  `- Plan exercises: ${map.length} = ${count('exact')} exact, ${count('variant')} variant, ${count('none')} none (no demo, "Demo coming soon")`,
  `- Image bytes: ${kb(total)} in public/ex/, of which ${kb(webpTotal)} WebP (the app precaches the WebP files; JPG is the fallback)`,
  '',
  '## Plan exercises',
  '',
  '| Plan exercise | Match | Catalog id | Why | Cue | Photos |',
  '|---|---|---|---|---|---|',
  ...map.map((e) => `| ${e.name} | ${e.match} | ${e.catalogId ?? ''} | ${e.reason} | ${e.cue ?? ''} | ${e.catalogId ? `public/ex/${e.catalogId}/0.jpg, 1.jpg` : ''} |`),
  '',
  '## Pattern ladder candidates (SPEC 7.2)',
  '',
  ...Object.entries(ladder).map(([p, l]) => `- ${p}: ${l.join(', ')}`),
  '',
  ...muscleReportLines(records, readJson<MuscleOverrides>('data/muscle-overrides.json')),
];
writeFileSync(root + 'CATALOG_REPORT.md', lines.join('\n'));
console.log(`catalog: ${records.length} exercises, ${kb(total)} images (${kb(webpTotal)} WebP); ${count('exact')} exact, ${count('variant')} variant, ${count('none')} none`);
