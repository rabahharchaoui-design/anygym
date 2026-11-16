// PLAN 3.6p: how long one plan build takes, and how many builds one reveal causes.
// Run: npx vitest run --config scripts/perf/vitest.perf.config.ts scripts/perf/measure.perf.ts
import { writeFileSync } from 'node:fs';
import { it, vi } from 'vitest';
import * as planModule from '../../src/lib/generator/plan';
import { GENERATOR_DEPS } from '../../src/data/generator';
import { focusFit } from '../../src/lib/intake/focusFit';
import { seededInput } from './seeded';

vi.setConfig({ testTimeout: 900_000 });
const OUT = process.env.PERF_OUT ?? '/tmp/3.6p-measure.json';

it('measures', () => {
  const rows: unknown[] = [];
  let calls = 0;
  const real = planModule.generatePlan;
  const spy = vi.spyOn(planModule, 'generatePlan').mockImplementation((i, d) => { calls++; return real(i, d); });
  void spy;
  // Fresh deps object per build: the least.ts memo is keyed by deps, so every build starts cold.
  const cold = () => ({ ...GENERATOR_DEPS });
  for (const count of [0, 1, 3, 5, 7]) for (const minutes of [45, 60, 75]) for (const days of [3, 4, 5, 6]) {
    const input = seededInput(count, days, minutes, 0);
    const t0 = performance.now();
    const r = planModule.generatePlan(input, cold());
    const build = performance.now() - t0;
    // One reveal: the build, then the fit line with its rebuilds, sharing one deps (as the app does).
    const deps = cold();
    let top = 0;
    const t1 = performance.now();
    const b = planModule.generatePlan(input, deps); top++;
    if (b.ok) focusFit({ days: days as 3, minutes: minutes as 45 }, b.applied.focusReport, (a) => { top++; const x = planModule.generatePlan({ ...input, days: a.days!, minutes: a.minutes! }, deps); return x.ok ? x.applied.focusReport : undefined; });
    const reveal = performance.now() - t1;
    rows.push({ count, minutes, days, ok: r.ok, buildMs: Math.round(build), revealMs: Math.round(reveal), revealTopBuilds: top });
    writeFileSync(OUT, JSON.stringify({ rows, note: 'inner generatePlan recursion (least.ts) is not counted in revealTopBuilds; see innerBuilds' }, null, 1));
  }
  void calls;
});
