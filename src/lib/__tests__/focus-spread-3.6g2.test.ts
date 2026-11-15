// PLAN 3.6g2, point 5 (the fourth critique): a pick's extra is spread over the days that train its
// muscle. Never more than two moves for the same pick added to one day while another day that
// trains it has none, and two near identical small moves (the same movement pattern, the order
// rule's own notion: two curls, two lateral raises) are never back to back when another small move
// of the day can go between. Counted on the built plans, beside the same answers
// with no picks.
import { describe, expect, it, vi as viTimeout } from 'vitest';
import { focusFacts } from '../../data/focus';
import { generate } from '../../data/generator';
import { profileFor } from '../../data/order';
import { definitionPlan } from '../../data/plans';
import { equipmentPreset } from '../../db/gyms';
import type { GeneratorInput } from '../generator';
import type { FocusPickId } from '../intake/options';
import { isCompound } from '../order';
import type { Plan } from '../plans';
import { samples } from './focusMeasure36g';
// A heavy test file (about 800 plans built once, then each rebuilt to read its moves); an explicit limit sized for the GitHub runner, never a retry.
viTimeout.setConfig({ testTimeout: 240_000 });

const plansOf = (input: GeneratorInput) => { const r = generate(input), b = generate({ ...input, focusPicks: [] }); if (!r.ok || !b.ok) throw new Error('no plan'); return { plan: definitionPlan(r.plan)!, base: definitionPlan(b.plan)! }; };
const lifts = (d: Plan['days'][number]) => d.blocks.filter((b) => !b.warmup && !b.mobility);
/** The exercises of a day that train the pick (the sure muscles, the same facts the plan is made from). */
const movesFor = (d: Plan['days'][number], id: FocusPickId) => lifts(d).flatMap((b) => b.items).map((it) => it.exerciseId).filter((x) => focusFacts(x, profileFor(x)).picks.includes(id));
type Block = Plan['days'][number]['blocks'][number];
const smallBlock = (b: Block) => b.items.every((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' && !isCompound(p); });
/** Two blocks of small moves where the last move of one and the first of the next have one movement pattern: two curls, two lateral raises, done back to back. */
const twin = (a: Block, b: Block) => { if (!smallBlock(a) || !smallBlock(b)) return false; const p = profileFor(b.items[0]!.exerciseId).pattern; return !!p && profileFor(a.items.at(-1)!.exerciseId).pattern === p; };
/**
 * The pairs of near identical small moves back to back that another small move of the day could
 * have gone between: after the day's last big lift, a later small move put between the two, or
 * the small move before the pair changing places with the pair's first, whenever that leaves the
 * day with fewer such pairs. None is ever left (lib/generator/focus.ts apart). What is left when no such move exists is a day whose
 * small moves are all of one pattern there (three curls for a Biceps pick and nothing else small).
 */
const count = (all: Block[], tail: number) => all.filter((b, k) => k > tail && twin(all[k - 1]!, b)).length;
const twins = (d: Plan['days'][number]) => count(lifts(d), 0);
function avoidable(d: Plan['days'][number]): string[] {
  const all = lifts(d), tail = all.findLastIndex((b) => !smallBlock(b)) + 1, now = count(all, tail), out: string[] = [];
  for (let k = tail + 1; k < all.length; k++) {
    if (!twin(all[k - 1]!, all[k]!)) continue;
    const later = all.some((b, j) => j > k && smallBlock(b) && count(all.toSpliced(j, 1).toSpliced(k, 0, b), tail) < now);
    const before = k - 2 >= tail && count(all.with(k - 2, all[k - 1]!).with(k - 1, all[k - 2]!), tail) < now;
    if (later || before) out.push(`${all[k - 1]!.items.at(-1)!.exerciseId} then ${all[k]!.items[0]!.exerciseId}`);
  }
  return out;
}
/** For each day: the moves for the pick that the same day has only with the picks. */
const addedBy = (plan: Plan, base: Plan, id: FocusPickId) => plan.days.map((d, i) => movesFor(d, id).filter((x) => !movesFor(base.days[i]!, id).includes(x)));

describe('5. spread', () => {
  it('the critic\'s case: Lats and Mobility on 3 days of 45 min (four lat moves on Day 1, none added on Day 2): no day gets a third new lat move while another has none, and no two near identical small moves stay in a row', () => {
    const input: GeneratorInput = { goals: ['muscle'], experience: '3y', days: 3, minutes: 45, focusPicks: ['lats', 'mobility'], scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') };
    const { plan, base } = plansOf(input);
    const added = addedBy(plan, base, 'lats');
    const trained = plan.days.map((d) => movesFor(d, 'lats').length > 0);
    // The extra is spread: at least two days got new lat moves, and a day holds more than two only when every other day that trains the lats got one too.
    expect(added.filter((x) => x.length > 0).length).toBeGreaterThanOrEqual(2);
    for (const [i, x] of added.entries()) if (x.length > 2) for (const [j, t] of trained.entries()) if (j !== i && t) expect(added[j]!.length, `day ${i + 1} has ${x.join(', ')} while day ${j + 1} has none`).toBeGreaterThan(0);
    for (const d of plan.days) expect(avoidable(d), d.name).toEqual([]);
  });
  it('every seeded intake: never a third new move for a pick on one day while another day that trains it has none; never two near identical small moves back to back when another small move of the day could go between', () => {
    let days = 0, crowded = 0, moved = 0, left = 0, fresh = 0;
    for (const s of samples()) {
      const { plan, base } = plansOf(s.input);
      for (const [i, d] of plan.days.entries()) { days++; expect(avoidable(d), `${d.name}: ${JSON.stringify(s.input.focusPicks)} ${s.days}d ${s.minutes}m`).toEqual([]); if (twins(d) > 0) left++; if (twins(d) > twins(base.days[i]!)) fresh++; }
      for (const id of s.served) {
        const added = addedBy(plan, base, id);
        if (added.some((a) => a.length)) moved++;
        for (const [i, a] of added.entries()) {
          if (a.length <= 2) continue;
          crowded++;
          // More than two on one day only when every other day that trains it got a new move too.
          for (const [j, d] of plan.days.entries()) if (j !== i && movesFor(d, id).length) expect(added[j]!.length, `${id} on day ${i + 1} (${a.join(', ')}) while day ${j + 1} has none: ${JSON.stringify(s.input.focusPicks)} ${s.days}d ${s.minutes}m`).toBeGreaterThan(0);
        }
      }
    }
    expect(days).toBeGreaterThan(1500);
    expect(moved).toBeGreaterThan(400);
    // Days left with such a pair are days whose small moves there are all of one pattern (a pick's own moves, with no other small move to go between).
    expect(left / days).toBeLessThan(0.2);
    console.log(`spread: ${days} days, ${moved} picks with new moves, ${crowded} days with more than two new moves for one pick (each beside other days that got one too); ${left} days where two near identical small moves stay back to back with no other small move to go between (${fresh} of them have more such pairs than the same day with no picks)`);
  });
});
