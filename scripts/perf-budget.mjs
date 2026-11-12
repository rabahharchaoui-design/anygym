#!/usr/bin/env node
// Bundle budget (PLAN 3.6y). The JavaScript a phone must download before the app starts (the scripts
// and module preloads in dist/index.html, plus the chunks they import at load time), gzip level 9.
// Fails when it grows more than the allowed percent over scripts/perf-baseline.json. Growth on
// purpose is raised with --update, reviewed in the diff like any other change.
//
//   node scripts/perf-budget.mjs              check dist/ against the baseline
//   node scripts/perf-budget.mjs --update     write today's size as the new baseline
//   node scripts/perf-budget.mjs --dist-dir <path>   (also: --baseline <path>)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dist = resolve(flag('--dist-dir') ?? join(here, '..', 'dist'));
const baselinePath = resolve(flag('--baseline') ?? join(here, 'perf-baseline.json'));
const update = args.includes('--update');
const GROWTH_PERCENT = 10;

/** The files index.html loads as scripts, then every chunk those import statically (not import()). */
export function initialScripts(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const base = /(?:src|href)="(\/[^"]*?\/)assets\//.exec(html)?.[1] ?? '/';
  const toFile = (url) => join(distDir, url.slice(base.length));
  const found = new Set();
  const visit = (file) => {
    if (found.has(file) || !existsSync(file)) return;
    found.add(file);
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["']\.\/([^"']+\.js)["']/g)) visit(join(dirname(file), m[1]));
  };
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) visit(toFile(m[1]));
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g)) visit(toFile(m[1]));
  return [...found];
}

export function measure(distDir) {
  const files = initialScripts(distDir).map((f) => ({ file: f.slice(distDir.length + 1), gzip: gzipSync(readFileSync(f), { level: 9 }).length }));
  return { files, gzipBytes: files.reduce((n, f) => n + f.gzip, 0) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`perf-budget: no build at ${dist}. Run npm run build first.`);
    process.exit(1);
  }
  const now = measure(dist);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  if (update) {
    const next = { initialJsGzipBytes: now.gzipBytes, allowedGrowthPercent: GROWTH_PERCENT, files: now.files.map((f) => f.file.replace(/-[\w-]{8}\.js$/, '-[hash].js')) };
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`perf-budget: baseline raised to ${kb(now.gzipBytes)} (${now.gzipBytes} bytes). Commit scripts/perf-baseline.json on purpose.`);
    process.exit(0);
  }
  if (!existsSync(baselinePath)) {
    console.error('perf-budget: scripts/perf-baseline.json is missing. Run: node scripts/perf-budget.mjs --update');
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const limit = Math.floor(base.initialJsGzipBytes * (1 + (base.allowedGrowthPercent ?? GROWTH_PERCENT) / 100));
  const pct = ((now.gzipBytes - base.initialJsGzipBytes) / base.initialJsGzipBytes) * 100;
  console.log(`perf-budget: initial JS ${kb(now.gzipBytes)} gzip (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs baseline ${kb(base.initialJsGzipBytes)}, limit ${kb(limit)}); ${now.files.length} file(s)`);
  if (now.gzipBytes > limit) {
    console.error(`perf-budget: FAIL. The initial JS grew more than ${base.allowedGrowthPercent ?? GROWTH_PERCENT}%. Shrink it, lazy load the new code, or raise the baseline on purpose with: node scripts/perf-budget.mjs --update`);
    process.exit(1);
  }
}
