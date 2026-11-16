// PLAN 3.6p, speed guard: one plan with five picks, five days and 60 minutes builds fast, and so
// does the reveal's whole work for it (the plan, then its fit line with the rebuilds).
// On a laptop the build takes about 18 ms and the reveal about 33 ms (before the speed work: 65 and
// 174). A runner can be eight times slower, so a time alone cannot be the limit. The same answers
// with no picks are timed on the same machine (about 0.15 ms); the build is about 120 times that,
// the reveal about 215 times, wherever it runs. It fails only when it is slow both ways: past a
// time no laptop reaches AND past five times that ratio. So work that makes the build ten times
// slower fails here and on the runner, and a slow or busy machine alone never does. The best of
// three runs is judged.
import { describe, expect, it } from 'vitest';
import { GENERATOR_DEPS } from '../../data/generator';
import { generatePlan, type GeneratorInput } from '../generator';
import { focusFit } from '../intake/focusFit';
import { equipmentPreset } from '../../db/gyms';

const input: GeneratorInput = { goals: ['muscle'], experience: '1_2y', days: 5, minutes: 60, focusPicks: ['side_delts', 'glutes', 'biceps', 'calves', 'mobility'], scheduleStyle: 'fixed', gym: equipmentPreset('full', 'lb') };
/** The best of three, each with nothing remembered (new deps: the memo is kept per deps object). */
const best = (run: (deps: typeof GENERATOR_DEPS) => void): number => Math.min(...[0, 1, 2].map(() => { const deps = { ...GENERATOR_DEPS }; const t = performance.now(); run(deps); return performance.now() - t; }));

describe('PLAN 3.6p: a plan with focus picks builds fast', () => {
  /** One build of the same answers with no picks, on this machine (ms). */
  const plain = () => best((deps) => { for (let i = 0; i < 20; i++) generatePlan({ ...input, focusPicks: [] }, { ...deps }); }) / 20;
  const reveal = (deps: typeof GENERATOR_DEPS) => {
    const r = generatePlan(input, deps);
    if (r.ok) focusFit({ days: 5, minutes: 60 }, r.applied.focusReport, (a) => { const x = generatePlan({ ...input, days: a.days!, minutes: a.minutes! }, deps); return x.ok ? x.applied.focusReport : undefined; });
  };
  it('5 picks, 5 days, 60 min: one build', () => {
    expect(generatePlan(input, { ...GENERATOR_DEPS }).ok).toBe(true);
    reveal({ ...GENERATOR_DEPS });
    const unit = plain(), ms = best((deps) => generatePlan(input, deps));
    expect(ms < 150 || ms / unit < 600, `build ${ms.toFixed(1)} ms, ${(ms / unit).toFixed(0)} times a build with no picks`).toBe(true);
  });
  it('the reveal for it: the plan, then its fit line with every rebuild', () => {
    const unit = plain(), ms = best(reveal);
    expect(ms < 300 || ms / unit < 1100, `reveal ${ms.toFixed(1)} ms, ${(ms / unit).toFixed(0)} times a build with no picks`).toBe(true);
  });
  it('the same answers are built once: the second build is the remembered plan, and its own copy', () => {
    const deps = { ...GENERATOR_DEPS };
    const a = generatePlan(input, deps), t = performance.now(), b = generatePlan(input, deps), again = performance.now() - t;
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    if (a.ok && b.ok) { a.plan.days.length = 0; expect(generatePlan(input, deps)).toEqual(b); }
    expect(again).toBeLessThan(200);
  });
});
