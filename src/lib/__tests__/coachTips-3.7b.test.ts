// PLAN 3.7b (gate critic 4): a coach tip only says what is true for the plan. Over every committed
// plan and a third of the 900 seeded built plans: the frequency tip never claims one session for a
// group the plan trains on more days, and its "Adds" sentence is exactly what Apply inserts.
import { describe, expect, it } from 'vitest';
import { seededAll } from '../../../scripts/perf/seeded';
import { generate } from '../../data/generator';
import { profileFor } from '../../data/order';
import { PLANS, definitionPlan } from '../../data/plans';
import { equipmentPreset } from '../../db/gyms';
import { SESSION_SETS, applyTips, freqAdds, planTips } from '../coachTips';
import { itemTarget, type Plan, type PlanBlock } from '../plans';

const profile = (id: string) => profileFor(id);
/** The tip's group words and the muscles each names (the app's own mapping: the primary muscles of every exercise). */
const GROUPS: Record<string, string[]> = { chest: ['chest'], back: ['back'], shoulders: ['front delts', 'side delts', 'rear delts'], quads: ['quads'], hamstrings: ['hamstrings'], glutes: ['glutes'] };
const setsOn = (plan: Plan, muscles: string[]): number[] => plan.days.map((d) => d.blocks.filter((b) => !b.warmup).reduce((n, b) => n + b.items.reduce((k, it) => { const p = profile(it.exerciseId); return k + (p.role === 'lift' && p.targets.some((m) => muscles.includes(m)) ? itemTarget(b, it, 0).sets : 0); }, 0), 0));

/** Checks the frequency tip of one plan; returns whether it had one. */
function check(plan: Plan): boolean {
  const tip = planTips(plan, profile).find((t) => t.id === 'freq');
  if (!tip) return false;
  const m = /^(.*) gets? one (full session|session) a week$/.exec(tip.title);
  expect(m, tip.title).not.toBeNull();
  const words = m![1]!.toLowerCase().split(/, | and /);
  for (const w of words) {
    const sets = setsOn(plan, GROUPS[w]!);
    // "one session": no second day trains it at all. "one full session": one day with 4 sets or more, never two.
    if (m![2] === 'session') expect(sets.filter((n) => n > 0).length, `${plan.name}: ${w}`).toBe(1);
    expect(sets.filter((n) => n >= SESSION_SETS).length, `${plan.name}: ${w}`).toBe(1);
  }
  // Apply: the blocks it inserts, and nothing else changed.
  const tuned = applyTips(plan, ['freq'], profile);
  const added: Array<{ day: number; block: PlanBlock }> = [];
  for (const [i, d] of tuned.days.entries()) {
    const was = plan.days[i]!.blocks;
    const fresh = d.blocks.filter((b) => !was.includes(b));
    expect(d.blocks.filter((b) => was.includes(b))).toEqual(was);
    for (const block of fresh) added.push({ day: d.n, block });
  }
  expect(added.length).toBe(words.length);
  expect(tip.why.endsWith(` ${freqAdds(added.map((a) => itemTarget(a.block, a.block.items[0]!, 0).sets))}`), tip.why).toBe(true);
  expect([...(tip.detail ?? [])].sort()).toEqual(added.map((a) => `${a.block.items[0]!.name} → Day ${a.day}`).sort());
  return true;
}

describe('3.7b: the frequency tip is true and says what Apply does', () => {
  it('the words: one move is "it", several with the same sets are "each", a single set is a set', () => {
    expect(freqAdds([3])).toBe('Adds 3 sets of it on another day, same split.');
    expect(freqAdds([3, 3])).toBe('Adds 3 sets of each on another day, same split.');
    expect(freqAdds([1])).toBe('Adds 1 set of it on another day, same split.');
    expect(freqAdds([3, 2])).toBe('Adds 2 exercises on other days, same split.');
  });

  it('every committed plan', () => {
    expect(PLANS.filter(check).length).toBeGreaterThan(0);
  });

  it("the critic's plan (brand new, full gym, 3 days, Lats and Biceps): shoulders are trained on two days, so no tip says one session", () => {
    const full = equipmentPreset('full', 'lb');
    const r = generate({ goals: ['muscle'], experience: 'new', days: 3, minutes: 45, style: 'mix', place: 'full', focusPicks: ['lats', 'biceps'], gym: { equipment: full.equipment, dumbbellRange: full.dumbbellRange } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const plan = definitionPlan(r.plan)!;
    expect(setsOn(plan, GROUPS.shoulders!).filter((n) => n > 0).length).toBeGreaterThan(1);
    for (const t of planTips(plan, profile)) expect(t.title).not.toMatch(/one session a week/);
    check(plan);
  });

  it('a third of the 900 seeded built plans', () => {
    let tips = 0;
    for (const [i, { input }] of seededAll().entries()) {
      if (i % 3) continue;
      const r = generate(input);
      if (r.ok && check(definitionPlan(r.plan)!)) tips++;
    }
    expect(tips).toBeGreaterThan(10);
  }, 120_000);
});
