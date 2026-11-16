// PLAN 3.6g2, point 5 (the fourth critique): a pick's extra is spread over the days that train its
// muscle. Never more than two moves for the same pick added to one day, and two near identical small moves (the same movement pattern, the order
// rule's own notion: two curls, two lateral raises) are never back to back when another move of the
// day can go between. Counted on the built plans, beside the same answers
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
// PLAN 3.6p: the build is fast again; about four times the slowest test here on a laptop under load, never under 30 s.
viTimeout.setConfig({ testTimeout: 60_000 });

const plansOf = (input: GeneratorInput) => { const r = generate(input), b = generate({ ...input, focusPicks: [] }); if (!r.ok || !b.ok) throw new Error('no plan'); return { plan: definitionPlan(r.plan)!, base: definitionPlan(b.plan)! }; };
const lifts = (d: Plan['days'][number]) => d.blocks.filter((b) => !b.warmup && !b.mobility);
/** The exercises of a day that train the pick (the sure muscles, the same facts the plan is made from). */
const movesFor = (d: Plan['days'][number], id: FocusPickId) => lifts(d).flatMap((b) => b.items).map((it) => it.exerciseId).filter((x) => focusFacts(x, profileFor(x)).picks.includes(id));
type Block = Plan['days'][number]['blocks'][number];
const smallBlock = (b: Block) => b.items.every((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' && !isCompound(p); });
/** Two blocks of small moves where the last move of one and the first of the next have one movement pattern: two curls, two lateral raises, done back to back. */
const twin = (a: Block, b: Block) => { if (!smallBlock(a) || !smallBlock(b)) return false; const p = profileFor(b.items[0]!.exerciseId).pattern; return !!p && profileFor(a.items.at(-1)!.exerciseId).pattern === p; };
/**
 * The pairs of near identical small moves back to back that another move of the day could have
 * gone between: a later small move, or the next big lift (it only moves earlier, past small
 * moves), or the small move before the pair changing places with the pair's first, or a pair done
 * in turn starting with its other move, whenever that
 * leaves the day with fewer such pairs. None is ever left (lib/generator/focus.ts apart). What is
 * left when no such move exists is a day that ends on small moves of one pattern (three curls for a
 * Biceps pick and nothing else after them).
 */
const count = (all: Block[]) => all.filter((b, k) => k > 0 && twin(all[k - 1]!, b)).length;
const twins = (d: Plan['days'][number]) => count(lifts(d));
function avoidable(d: Plan['days'][number]): string[] {
  const all = lifts(d), now = count(all), out: string[] = [];
  for (let k = 1; k < all.length; k++) {
    if (!twin(all[k - 1]!, all[k]!)) continue;
    const big = all.findIndex((b, j) => j > k && !smallBlock(b));
    const later = all.some((b, j) => j > k && (big < 0 || j <= big) && count(all.toSpliced(j, 1).toSpliced(k, 0, b)) < now);
    const before = k >= 2 && smallBlock(all[k - 2]!) && count(all.with(k - 2, all[k - 1]!).with(k - 1, all[k - 2]!)) < now;
    const turned = [k - 1, k].some((j) => all[j]!.items.length === 2 && count(all.with(j, { ...all[j]!, items: [all[j]!.items[1]!, all[j]!.items[0]!] })) < now);
    if (later || before || turned) out.push(`${all[k - 1]!.items.at(-1)!.exerciseId} then ${all[k]!.items[0]!.exerciseId}`);
  }
  return out;
}
/** For each day: the moves for the pick that the same day has only with the picks. */
const addedBy = (plan: Plan, base: Plan, id: FocusPickId) => plan.days.map((d, i) => movesFor(d, id).filter((x) => !movesFor(base.days[i]!, id).includes(x)));

describe('5. spread', () => {
  it('the critic\'s case: Lats and Mobility on 3 days of 45 min (four lat moves on Day 1, none added on Day 2): no day gets a third new lat move or has four lat moves, two days get new ones, and no two near identical small moves stay in a row', () => {
    const input: GeneratorInput = { goals: ['muscle'], experience: '3y', days: 3, minutes: 45, focusPicks: ['lats', 'mobility'], scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') };
    const { plan, base } = plansOf(input);
    const added = addedBy(plan, base, 'lats');
    const trained = plan.days.map((d) => movesFor(d, 'lats').length > 0);
    // The extra is spread: at least two days got new lat moves, no day got more than two, and no day has four lat moves.
    expect(added.filter((x) => x.length > 0).length).toBeGreaterThanOrEqual(2);
    for (const [i, x] of added.entries()) expect(x.length, `day ${i + 1}: ${x.join(', ')}`).toBeLessThanOrEqual(2);
    for (const d of plan.days) expect(movesFor(d, 'lats').length, d.name).toBeLessThanOrEqual(3);
    expect(trained.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    for (const d of plan.days) expect(avoidable(d), d.name).toEqual([]);
  });
  it('the critic\'s case: Lats and Biceps (two near identical curls back to back): on 3 to 5 days of 45 and 60 min no two curls stay in a row where another move can go between, and no day gets more than two new moves for a pick', () => {
    for (const days of [3, 4, 5]) for (const minutes of [45, 60]) {
      const { plan, base } = plansOf({ goals: ['muscle'], experience: '3y', days, minutes, focusPicks: ['lats', 'biceps'], scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') });
      for (const d of plan.days) expect(avoidable(d), `${d.name} ${days}d ${minutes}m`).toEqual([]);
      for (const id of ['lats', 'biceps'] as const) for (const a of addedBy(plan, base, id)) expect(a.length, `${id} ${days}d ${minutes}m: ${a.join(', ')}`).toBeLessThanOrEqual(2);
    }
    // The very plan of the critique (3 days, 45 min): the day with three curls has another move between each two.
    const { plan } = plansOf({ goals: ['muscle'], experience: '3y', days: 3, minutes: 45, focusPicks: ['lats', 'biceps'], scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') });
    expect(plan.days.map(twins)).toEqual([0, 0, 0]);
  });
  it('every seeded intake: never a third new move for a pick on one day; never two near identical small moves back to back when another move of the day could go between', () => {
    let days = 0, crowded = 0, moved = 0, left = 0, fresh = 0;
    for (const s of samples()) {
      const { plan, base } = plansOf(s.input);
      for (const [i, d] of plan.days.entries()) { days++; expect(avoidable(d), `${d.name}: ${JSON.stringify(s.input.focusPicks)} ${s.days}d ${s.minutes}m`).toEqual([]); if (twins(d) > 0) left++; if (twins(d) > twins(base.days[i]!)) fresh++; }
      for (const id of s.served) {
        const added = addedBy(plan, base, id);
        if (added.some((a) => a.length)) moved++;
        for (const [i, a] of added.entries()) {
          if (a.length > 2) crowded++;
          expect(a.length, `${id} on day ${i + 1} (${a.join(', ')}): ${JSON.stringify(s.input.focusPicks)} ${s.days}d ${s.minutes}m`).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(days).toBeGreaterThan(1500);
    expect(moved).toBeGreaterThan(400);
    // Days left with such a pair end on small moves of one pattern (a pick's own moves, with nothing after them to go between).
    expect(left / days).toBeLessThan(0.1);
    console.log(`spread: ${days} days, ${moved} picks with new moves, ${crowded} days with more than two new moves for one pick; ${left} days where two near identical small moves stay back to back with no other move to go between (${fresh} of them have more such pairs than the same day with no picks)`);
  });
});
