#!/usr/bin/env node
// Duplicate code guard (PLAN 3.6x). Runs jscpd (config: .jscpd.json, src only) and fails when the
// share of duplicated lines, or the number of clones (copy pasted blocks), is higher than recorded in
// scripts/dup-baseline.json. A ratchet: it only ever goes down. Prints one summary line.
//
//   node scripts/dup-guard.mjs            check against the baseline
//   node scripts/dup-guard.mjs --update   lower the baseline (refuses to raise it)
//   node scripts/dup-guard.mjs --list     also print every clone found, to find the copies to remove
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The hard ceiling, in percent, whatever the baseline says (jscpd threshold in .jscpd.json). */
export const CEILING = 5;

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const BASELINE_PATH = join(here, 'dup-baseline.json');

const round2 = (n) => Math.round(n * 100) / 100;

/** Compare today's numbers { clones, percentage } with the baseline. Pure. Returns { failures, notes }. */
export function compareDup(now, baseline, ceiling = CEILING) {
  const failures = [];
  const notes = [];
  const pct = round2(now.percentage);
  if (pct > ceiling) failures.push(`duplication is ${pct}%, over the ${ceiling}% ceiling. Move the copied code into one shared helper or component.`);
  if (now.clones > baseline.clones) {
    failures.push(`copy pasted blocks went up: ${now.clones} clones, the baseline is ${baseline.clones}. Reuse the existing helper or component instead of copying (node scripts/dup-guard.mjs --list shows them).`);
  }
  if (pct > round2(baseline.percentage)) {
    failures.push(`duplicated code went up: ${pct}%, the baseline is ${round2(baseline.percentage)}%. Reuse the existing helper or component instead of copying.`);
  }
  if (!failures.length && (now.clones < baseline.clones || pct < round2(baseline.percentage))) {
    notes.push(`duplication improved (${now.clones} clones, ${pct}%): lock it in with node scripts/dup-guard.mjs --update`);
  }
  return { failures, notes };
}

/** The baseline after --update. Never raises: a number that went up is refused. Pure. */
export function lowerDup(now, baseline) {
  const pct = round2(now.percentage);
  const refused = [];
  if (now.clones > baseline.clones) refused.push(`clones went up (${baseline.clones} to ${now.clones})`);
  if (pct > round2(baseline.percentage)) refused.push(`percentage went up (${round2(baseline.percentage)} to ${pct})`);
  return { baseline: { clones: Math.min(now.clones, baseline.clones), percentage: Math.min(pct, round2(baseline.percentage)) }, refused };
}

function runJscpd() {
  const out = mkdtempSync(join(tmpdir(), 'anygym-jscpd-'));
  try {
    const bin = join(ROOT, 'node_modules', '.bin', 'jscpd');
    const r = spawnSync(bin, ['--config', '.jscpd.json', '--output', out, '--silent'], { cwd: ROOT, encoding: 'utf8' });
    const file = join(out, 'jscpd-report.json');
    if (!existsSync(file)) throw new Error(`jscpd produced no report (exit ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 400)}`);
    return JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function main(args) {
  const report = runJscpd();
  const total = report.statistics.total;
  const now = { clones: total.clones, percentage: round2(total.percentage) };
  if (args.includes('--list')) {
    for (const d of report.duplicates ?? []) {
      console.log(`${d.lines} lines: ${d.firstFile.name}:${d.firstFile.startLoc.line} == ${d.secondFile.name}:${d.secondFile.startLoc.line}`);
    }
  }
  const have = existsSync(BASELINE_PATH);
  const baseline = have ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  if (args.includes('--update')) {
    const { baseline: next, refused } = baseline ? lowerDup(now, baseline) : { baseline: now, refused: [] };
    if (refused.length) {
      console.error(`dup guard: --update refused: ${refused.join('; ')}. It only lowers the baseline; remove the copied code instead.`);
      process.exit(1);
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ note: 'Copy pasted code today. Only ever goes down: node scripts/dup-guard.mjs --update', ...next }, null, 2)}\n`);
    console.log(`dup guard: baseline written, ${next.clones} clones, ${next.percentage}%.`);
    return;
  }
  if (!baseline) {
    console.error('dup guard: scripts/dup-baseline.json is missing. Create it with: node scripts/dup-guard.mjs --update');
    process.exit(1);
  }
  const { failures, notes } = compareDup(now, baseline);
  if (failures.length) {
    console.error(`dup guard FAILED: ${failures.join(' ')}`);
    process.exit(1);
  }
  console.log(`dup guard ok: ${now.clones} clones, ${now.percentage}% duplicated (baseline ${baseline.clones}, ${baseline.percentage}%).${notes.length ? ` ${notes[0]}` : ''}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
