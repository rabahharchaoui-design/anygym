// PLAN 3.6f round 3 (critic 3b): rank decides competition for the same room, and only that.
import { describe, expect, it } from 'vitest';
import { curateFocus, focusBudget, type FocusMove } from '../focus';
import type { FocusPickId } from '../../intake/options';

const PICK: Record<string, FocusPickId[]> = { back: ['back'], biceps: ['biceps'], quads: ['quads'], 'side delts': ['side_delts'], abs: ['abs'], glutes: ['glutes'], chest: [], calves: [] };
const move = (id: string, muscle: string, sets = 3, compound = false): FocusMove => ({ id, key: id, sets, compound, hard: true, muscles: [muscle], picks: PICK[muscle] ?? [] });
const mins = (d: FocusMove[]) => d.reduce((n, m) => n + m.sets * 2, 0);

describe('rank decides competition (critic 3b)', () => {
  it('two picks want the same single slot: the higher one gets it', () => {
    // One day, one spare accessory, no time for more: only one of the two can take its place.
    const day = [move('bench', 'chest', 3, true), move('calf', 'calves')];
    const candidates = [[move('curl', 'biceps'), move('raise', 'side delts')]];
    const run = (picks: string[]) => curateFocus({ picks, days: [day], candidates, cap: 3, budgetMinutes: 12, minutes: mins }).report.priorities.map((p) => [p.id, p.extra]);
    expect(run(['biceps', 'side_delts'])).toEqual([['biceps', 3], ['side_delts', 0]]);
    expect(run(['side_delts', 'biceps'])).toEqual([['side_delts', 3], ['biceps', 0]]);
  });
  it('a higher pick with no free day (its muscles rest on the days around the only free one) does not cap the pick below it', () => {
    // Back trains on days 1 and 3; day 2 has the room, but back work there would break the 48 hour rule. Biceps is trained nowhere, so it may join day 2.
    const days = [[move('row', 'back', 3, true), { ...move('fly', 'chest'), keep: true }], [move('squat', 'quads', 3, true), move('calf', 'calves')], [move('pull', 'back', 3, true), { ...move('press', 'chest'), keep: true }]];
    const candidates = days.map(() => [move('pulldown', 'back'), move('curl', 'biceps')]);
    const out = curateFocus({ picks: ['back', 'biceps'], days, candidates, cap: 3, budgetMinutes: 12, minutes: mins });
    expect(out.report.priorities.map((p) => [p.id, p.extra, p.state])).toEqual([['back', 0, 'short'], ['biceps', 3, 'extra']]);
    expect(out.days[1]!.map((m) => m.id)).toEqual(['squat', 'curl']);
  });
  it('a higher pick with plenty, or with no exercise, does not cap the picks below it', () => {
    const full = [...Array.from({ length: 5 }, (_, i) => [move(`back-${i}`, 'back', 4)]), [move('fly', 'chest'), move('press', 'chest')]];
    const out = curateFocus({ picks: ['back', 'grip', 'biceps'], days: full, candidates: full.map(() => [move('curl', 'biceps')]), cap: 4, budgetMinutes: 60, minutes: mins });
    expect(out.report.priorities.map((p) => [p.id, p.state])).toEqual([['back', 'plenty'], ['grip', 'no_move'], ['biceps', 'extra']]);
    expect(out.report.priorities[2]!.extra).toBeGreaterThanOrEqual(3);
  });
  it('shares nobody can use are offered again from the top, never past +4 for a pick or 12 in all', () => {
    const days = [...Array.from({ length: 5 }, (_, i) => [move(`back-${i}`, 'back', 4)]), [move('fly', 'chest'), move('press', 'chest')], [move('dip', 'chest'), move('push', 'chest')]];
    const candidates = days.map(() => [move('curl', 'biceps'), move('ext', 'quads'), move('raise', 'side delts'), move('crunch', 'abs')]);
    const out = curateFocus({ picks: ['back', 'biceps', 'quads', 'side_delts', 'abs'], days, candidates, cap: 4, budgetMinutes: 60, minutes: mins });
    const by = Object.fromEntries(out.report.priorities.map((p) => [p.id, p]));
    expect(by.back!.state).toBe('plenty');
    // Back's 3 go round again: biceps (second of the top two) up to 4, the rest toward 12 sets a week, never past 4.
    expect(by.biceps!.extra).toBe(4);
    for (const p of out.report.priorities) expect(p.extra).toBeLessThanOrEqual(4);
    expect(out.report.spent).toBeLessThanOrEqual(12);
    expect(out.report.spent).toBeGreaterThan(9);
  });
  it('property (400 seeded plans): a lower pick never got more than a higher pick that could have used the same room', () => {
    let seed = 11;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const muscles = ['back', 'biceps', 'quads', 'side delts', 'abs', 'glutes', 'chest', 'calves'];
    const ids: FocusPickId[] = ['back', 'biceps', 'quads', 'side_delts', 'abs', 'glutes'];
    let inversions = 0;
    for (let n = 0; n < 400; n++) {
      const days = Array.from({ length: 2 + rnd(4) }, (_, d) => Array.from({ length: 2 + rnd(4) }, (_, k) => ({ ...move(`d${d}m${k}`, muscles[rnd(muscles.length)]!, 2 + rnd(3), k === 0), ...(rnd(5) === 0 ? { keep: true } : {}) })));
      const candidates = days.map((_, d) => muscles.filter(() => rnd(3) > 0).map((m) => move(`c${d}-${m}`, m)));
      const picks = [...ids].sort(() => rnd(3) - 1).slice(0, 2 + rnd(5));
      const slack = rnd(12);
      const input = { picks, days, candidates, cap: 3 + rnd(2), budgetMinutes: Math.max(...days.map(mins)) + slack, minutes: mins };
      const all = curateFocus(input).report;
      const hard = all.priorities;
      expect(all.spent).toBeLessThanOrEqual(all.budget);
      for (const [j, low] of hard.entries()) for (const high of hard.slice(0, j)) {
        if (low.extra <= high.extra) continue;
        inversions++;
        // The higher pick is behind. Take the lower pick out of the way: it asks for nothing and its own share
        // goes with it, while the moves that train it stay protected as before. The higher pick still gets no more.
        const shares = focusBudget(picks);
        const own = shares.targets.find((t) => t.id === low.id)!.sets;
        const strip = (m: FocusMove): FocusMove => (m.picks.includes(low.id) ? { ...m, picks: m.picks.filter((x) => x !== low.id), keep: true } : m);
        const without = curateFocus({ ...input, days: days.map((d) => d.map(strip)), candidates: candidates.map((c) => c.filter((m) => !m.picks.includes(low.id))), shares: { total: shares.total - own, targets: shares.targets.filter((t) => t.id !== low.id) } }).report;
        const then = without.priorities.find((p) => p.id === high.id)!;
        if (then.extra > high.extra) console.log(JSON.stringify({ picks, cap: input.cap, slack, lim: input.budgetMinutes, days: days.map((d) => d.map((m) => `${m.muscles[0]}${m.sets}${m.compound ? 'C' : ''}${m.keep ? 'K' : ''}`)), cands: candidates.map((c) => c.map((m) => m.muscles[0])), A: all.priorities.map((p) => [p.id, p.requested, p.extra]), B: without.priorities.map((p) => [p.id, p.requested, p.extra]) }));
        expect(then.extra, `plan ${n}: ${high.id} could have used the room ${low.id} took`).toBeLessThanOrEqual(high.extra);
      }
    }
    // The property is not empty: lower picks do end up ahead, each time for a reason that is the higher pick's own.
    expect(inversions).toBeGreaterThan(50);
  });
});
