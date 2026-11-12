#!/usr/bin/env node
// Size guard (PLAN 3.6x). CLAUDE.md: new files stay under about 300 lines, a file over 400 lines is
// split the next time it is touched. This enforces it without anyone remembering:
//   - a source file that is NOT in scripts/size-baseline.json and is over 400 lines fails;
//   - a file in the baseline may never be longer than the line count recorded there (a ratchet);
//   - when a baseline file shrinks, or drops to 400 or under, this says so, and --update records it.
//
//   node scripts/size-guard.mjs                      check src/ against the baseline
//   node scripts/size-guard.mjs --update             lower the baseline (never raises, never adds)
//   node scripts/size-guard.mjs --update --allow-grow <path>   raise or add one file (loud, reviewed in the diff)
//
// Counted: .ts, .tsx and .css under src/. Not counted: __tests__, *.test.*, src/data/, *.d.ts, json, MAP.md.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIMIT = 400;

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const BASELINE_PATH = join(here, 'size-baseline.json');

/** Lines in a file's text, the way an editor shows them: "a\nb\n" and "a\nb" are both 2. */
export function countLines(text) {
  if (text === '') return 0;
  const parts = text.split(/\r\n|[\r\n\u2028\u2029]/);
  return text.endsWith('\n') || text.endsWith('\r') ? parts.length - 1 : parts.length;
}

/** True for a path (relative to the repo root, forward slashes) the guard counts. */
export function isCounted(path) {
  if (!path.startsWith('src/')) return false;
  if (!/\.(ts|tsx|css)$/.test(path) || path.endsWith('.d.ts')) return false;
  if (path.includes('/__tests__/') || /\.test\.[^/]*$/.test(path)) return false;
  if (path.startsWith('src/data/')) return false;
  return true;
}

/**
 * The rule, pure. `sizes` and `baseline` map a path to a line count.
 * Returns { failures, notes }: failures are messages that must fail the build, notes are good news
 * (a baseline file got smaller) telling the reader to run --update.
 */
export function checkSizes(sizes, baseline, limit = LIMIT) {
  const failures = [];
  const notes = [];
  for (const [path, lines] of Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))) {
    const recorded = baseline[path];
    if (recorded === undefined) {
      if (lines > limit) {
        failures.push(`${path} has ${lines} lines; the limit for a file is ${limit}. Split it into smaller files with one job each (see src/MAP.md), without changing behavior.`);
      }
    } else if (lines > recorded) {
      failures.push(`${path} grew to ${lines} lines; it was ${recorded} and the limit is ${limit}. A file over the limit may only get smaller. Split it before adding more.`);
    } else if (lines <= limit) {
      notes.push(`${path} is down to ${lines} lines (limit ${limit}): it can leave the baseline. Run: node scripts/size-guard.mjs --update`);
    } else if (lines < recorded) {
      notes.push(`${path} shrank from ${recorded} to ${lines} lines. Run: node scripts/size-guard.mjs --update to lock it in.`);
    }
  }
  for (const path of Object.keys(baseline)) {
    if (!(path in sizes)) notes.push(`${path} is gone (moved, split or deleted): it can leave the baseline. Run: node scripts/size-guard.mjs --update`);
  }
  return { failures, notes };
}

/**
 * The baseline after --update, pure. Only ever goes down: a smaller number replaces the old one, a
 * file at the limit or under, or gone, is removed. Raising a number or adding a file is refused
 * unless the path is in `allowGrow`. Returns { baseline, refused, warnings }.
 */
export function planUpdate(sizes, baseline, allowGrow = [], limit = LIMIT) {
  const next = {};
  const refused = [];
  const warnings = [];
  const paths = new Set([...Object.keys(baseline), ...Object.keys(sizes).filter((p) => sizes[p] > limit)]);
  for (const path of [...paths].sort()) {
    const lines = sizes[path];
    const recorded = baseline[path];
    if (lines === undefined || lines <= limit) continue;
    if (recorded === undefined || lines > recorded) {
      if (allowGrow.includes(path)) {
        warnings.push(`!!! WARNING: ${path} is ${recorded === undefined ? 'ADDED to' : `RAISED from ${recorded} in`} the size baseline at ${lines} lines, by --allow-grow. This is the escape hatch: split the file instead.`);
        next[path] = lines;
      } else {
        refused.push(`${path} has ${lines} lines${recorded === undefined ? ' and is not in the baseline' : `, more than the recorded ${recorded}`}. --update only lowers the baseline. Split the file (or, for a reviewed exception, add --allow-grow ${path}).`);
        if (recorded !== undefined) next[path] = recorded;
      }
    } else {
      next[path] = lines;
    }
  }
  return { baseline: next, refused, warnings };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

/** Line counts of every counted file under src/. */
export function measure(root = ROOT) {
  const sizes = {};
  for (const abs of walk(join(root, 'src'))) {
    const path = relative(root, abs).split('\\').join('/');
    if (isCounted(path)) sizes[path] = countLines(readFileSync(abs, 'utf8'));
  }
  return sizes;
}

const readBaseline = () => (existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? {} : {});

function main(args) {
  const sizes = measure();
  const baseline = readBaseline();
  if (args.includes('--update')) {
    const allow = args.flatMap((a, i) => (a === '--allow-grow' ? [args[i + 1]] : []));
    const { baseline: next, refused, warnings } = planUpdate(sizes, baseline, allow);
    for (const w of warnings) console.warn(w);
    if (refused.length) {
      console.error(`size guard: --update refused:\n${refused.map((m) => `  ${m}`).join('\n')}`);
      process.exit(1);
    }
    const doc = { note: 'Files over the line limit, and the most lines each may have. Only ever goes down: node scripts/size-guard.mjs --update', limit: LIMIT, files: next };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`size guard: baseline written, ${Object.keys(next).length} files over ${LIMIT} lines.`);
    return;
  }
  const { failures, notes } = checkSizes(sizes, baseline);
  for (const n of notes) console.log(`size guard: ${n}`);
  if (failures.length) {
    console.error(`size guard FAILED:\n${failures.map((m) => `  ${m}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`size guard ok: ${Object.keys(sizes).length} files, ${Object.keys(baseline).length} over ${LIMIT} lines held by the baseline.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
