#!/usr/bin/env node
// Dead code report (PLAN 3.6x). Runs knip (config: knip.json) and writes reports/deadcode-<YYYY-MM>.md:
// unused files, exports, types and dependencies, in plain lists. It only reads and reports. It never
// deletes anything, never fails (always exits 0), and is not part of CI or `npm test`.
// A listed export can still be used in a way knip cannot see (a string, a test only helper), so a
// person decides what to remove.
//
//   npm run deadcode
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Plain markdown from knip's JSON `issues` list. Pure. */
export function renderReport(issues, month) {
  const pick = (key) => issues.flatMap((i) => (i[key] ?? []).map((x) => ({ file: i.file, ...x })));
  const unusedFiles = issues.filter((i) => (i.files ?? []).length).map((i) => i.file).sort();
  const byFile = (items) => {
    const map = new Map();
    for (const it of items) map.set(it.file, [...(map.get(it.file) ?? []), it]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const section = (title, items, line) => [
    `## ${title} (${items.length})`,
    '',
    ...(items.length ? byFile(items).flatMap(([file, list]) => [`- \`${file}\``, ...list.map((it) => `  - ${line(it)}`)]) : ['None.']),
    '',
  ];
  const deps = [...pick('dependencies'), ...pick('devDependencies'), ...pick('optionalPeerDependencies')];
  const exportsList = pick('exports');
  const types = pick('types');
  const dupes = issues.flatMap((i) => (i.duplicates ?? []).map((group) => ({ file: i.file, names: group.map((g) => g.name).join(' and ') })));
  return [
    `# Dead code report, ${month}`,
    '',
    'Made by `npm run deadcode` (knip). It lists things nothing seems to use. It deletes nothing. Check each one before removing: a name can be used in a way the tool cannot see.',
    '',
    `Summary: ${unusedFiles.length} unused files, ${deps.length} unused dependencies, ${exportsList.length} unused exports, ${types.length} unused types, ${dupes.length} duplicate exports.`,
    '',
    `## Unused files (${unusedFiles.length})`,
    '',
    ...(unusedFiles.length ? unusedFiles.map((f) => `- \`${f}\``) : ['None.']),
    '',
    ...section('Unused dependencies', deps, (d) => `\`${d.name}\``),
    ...section('Unused exports', exportsList, (e) => `\`${e.name}\` (line ${e.line})`),
    ...section('Unused types', types, (e) => `\`${e.name}\` (line ${e.line})`),
    ...section('Duplicate exports', dupes, (d) => `\`${d.names}\``),
  ].join('\n');
}

function main() {
  const month = new Date().toISOString().slice(0, 7);
  const r = spawnSync(join(ROOT, 'node_modules', '.bin', 'knip'), ['--no-exit-code', '--reporter', 'json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let issues;
  try {
    issues = JSON.parse(r.stdout).issues;
  } catch {
    console.error(`deadcode: knip gave no readable result (${(r.stderr || '').slice(0, 300)}). Nothing written.`);
    return;
  }
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  const file = join(ROOT, 'reports', `deadcode-${month}.md`);
  writeFileSync(file, `${renderReport(issues, month)}\n`);
  console.log(`deadcode: wrote reports/deadcode-${month}.md`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (e) {
    console.error(`deadcode: failed (${e instanceof Error ? e.message : e}). Nothing deleted.`);
  }
}
