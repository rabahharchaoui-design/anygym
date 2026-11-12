#!/usr/bin/env node
// Import boundary baseline (PLAN 3.6x). CLAUDE.md: screens do not touch the database; they go through
// hooks (src/hooks/). Many screens still import src/db/ directly. scripts/boundary-allow.json lists
// them, so today's code passes while a NEW screen file importing src/db/ fails `npm run lint`.
// Type only imports (`import type`) are fine: a type is not a way to read or write data.
//
//   node scripts/boundary-baseline.mjs           check the list: it must name exactly today's offenders
//   node scripts/boundary-baseline.mjs --update  drop files that no longer import src/db/ (never adds)
//   node scripts/boundary-baseline.mjs --init    rewrite the whole list from the current tree (first time only)
//
// Detection is the same ESLint rule `npm run lint` uses (eslint.config.js), run with an empty list.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const ALLOW_PATH = join(here, 'boundary-allow.json');
export const RULE = 'anygym/screens-no-db';

/** Pure: compare the recorded list with today's offenders. Returns { stale, unlisted }. */
export function compareBoundary(listed, offenders) {
  return { stale: listed.filter((f) => !offenders.includes(f)).sort(), unlisted: offenders.filter((f) => !listed.includes(f)).sort() };
}

export async function findOffenders() {
  process.env.BOUNDARY_NO_ALLOW = '1';
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(['src/screens']);
  const files = results.filter((r) => r.messages.some((m) => m.ruleId === RULE)).map((r) => relative(ROOT, r.filePath).split('\\').join('/'));
  return files.sort();
}

const readList = () => JSON.parse(readFileSync(ALLOW_PATH, 'utf8')).files;
const write = (files) =>
  writeFileSync(ALLOW_PATH, `${JSON.stringify({ note: 'Screen files that still import src/db/ directly. Only ever shrinks: node scripts/boundary-baseline.mjs --update. New screens go through src/hooks/.', files }, null, 2)}\n`);

async function main(args) {
  const offenders = await findOffenders();
  if (args.includes('--init')) {
    write(offenders);
    console.log(`boundary: wrote ${offenders.length} files to scripts/boundary-allow.json`);
    return;
  }
  const { stale, unlisted } = compareBoundary(readList(), offenders);
  if (args.includes('--update')) {
    if (unlisted.length) {
      console.error(`boundary: --update never adds. These screens import src/db/ and are not listed: ${unlisted.join(', ')}. Go through a hook in src/hooks/ instead.`);
      process.exit(1);
    }
    write(offenders);
    console.log(`boundary: list now ${offenders.length} files (${stale.length} removed).`);
    return;
  }
  if (unlisted.length) {
    console.error(`boundary FAILED: screens may not import src/db/ directly, go through a hook in src/hooks/: ${unlisted.join(', ')}`);
    process.exit(1);
  }
  if (stale.length) {
    console.error(`boundary FAILED: these files no longer import src/db/ directly, take them off the list with: node scripts/boundary-baseline.mjs --update\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`boundary ok: ${offenders.length} screen files still import src/db/ (listed in scripts/boundary-allow.json).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
