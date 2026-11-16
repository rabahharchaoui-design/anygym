// PLAN 3.6p: one stable hash per plan (the whole generator result) and the fit line of each of the
// 900 seeded intakes, so speed work can be proved to change no plan and no word.
// Run: PERF_OUT=/tmp/3.6p-before.json npx vitest run --config scripts/perf/vitest.perf.config.ts scripts/perf/snapshot.perf.ts
// Compare two files with: cmp /tmp/3.6p-before.json /tmp/3.6p-after.json
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { generate } from '../../src/data/generator';
import { focusFit } from '../../src/lib/intake/focusFit';
import { seededAll } from './seeded';

const OUT = process.env.PERF_OUT ?? '/tmp/3.6p-after.json';
const TIMES = process.env.PERF_TIMES;
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x) ?? 'undefined').digest('hex').slice(0, 24);

it('snapshots the 900 seeded plans and their fit lines', () => {
  const out: Record<string, { plan: string; fit: string | null; fitAll: string }> = {};
  const times: Array<[string, number]> = [];
  for (const { label, input } of seededAll()) {
    const t0 = performance.now();
    const r = generate(input);
    const fit = r.ok ? focusFit({ days: input.days as 3, minutes: input.minutes as 45 }, r.applied.focusReport, (a) => { const x = generate({ ...input, days: a.days!, minutes: a.minutes! }); return x.ok ? x.applied.focusReport : undefined; }) : null;
    times.push([label, Math.round(performance.now() - t0)]);
    out[label] = { plan: sha(r), fit: fit?.line ?? null, fitAll: sha(fit) };
  }
  writeFileSync(OUT, JSON.stringify(out, null, 0));
  if (TIMES) writeFileSync(TIMES, JSON.stringify({ total: times.reduce((n, t) => n + t[1], 0), slowest: [...times].sort((a, b) => b[1] - a[1]).slice(0, 25) }));
});
