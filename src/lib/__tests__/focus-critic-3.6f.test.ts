// PLAN 3.6f round 2: the ux-critic's own cases (Nov 14), built through the real generator.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { equipmentPreset } from '../../db/gyms';
import type { GeneratorInput } from '../generator';
import { fixesFocus, focusFit } from '../intake/focusFit';
import type { FocusPickId } from '../intake/options';
import { focusUnplaced } from '../plan/focus';
import { focusLine, focusPeriod } from '../plan/focusWords';

const gym = equipmentPreset('full', 'lb');
const build = (days: number, minutes: number, focusPicks: FocusPickId[]) => {
  const input: GeneratorInput = { goals: ['muscle'], experience: '3y', days, minutes, focusPicks, scheduleStyle: 'flexible', gym };
  const r = generate(input);
  if (!r.ok) throw new Error(r.reason);
  const report = r.applied.focusReport!;
  const lines = report.priorities.map((p) => focusLine(p, focusPeriod('flexible', days)).join(': '));
  const fit = focusFit({ days: days as 3, minutes: minutes as 30 }, report, (a) => { const x = generate({ ...input, days: a.days!, minutes: a.minutes! }); return x.ok ? x.applied.focusReport : undefined; });
  return { input, report, lines, fit, plan: definitionPlan(r.plan)! };
};
/** Extras never rise down the ranking, except past a pick that says it has plenty or has no exercises. */
function ranked(report: ReturnType<typeof build>['report']) {
  let top = Infinity;
  for (const p of report.priorities.filter((x) => x.id !== 'mobility')) {
    expect(p.extra, p.id).toBeLessThanOrEqual(top);
    if (p.state !== 'plenty' && p.state !== 'no_move') top = Math.min(top, p.extra);
  }
}

describe('critic BLOCKER 1 and 4: ranking, the limit as shown, one meaning for the numbers', () => {
  it('Back first of five at 5 days, 75 min: Back says plenty (never "27 sets", never "nothing extra"), lower picks get their extra', () => {
    const { report, lines } = build(5, 75, ['back', 'side_delts', 'arms', 'quads', 'glutes']);
    ranked(report);
    const back = report.priorities[0]!;
    expect(back.state).toBe('plenty');
    expect(back.parts!.every((x) => x.sets <= 20)).toBe(true);
    expect(lines[0]).toMatch(/^Back: lats and upper back 20 and lower back \d+ sets every 5 workouts, already plenty$/);
    expect(lines.join(' ')).not.toMatch(/nothing extra|27 sets/);
    // Every set count a line shows is at most 20.
    for (const l of lines) for (const n of l.replace(/every \d+ workouts/, '').match(/\d+/g) ?? []) expect(Number(n), l).toBeLessThanOrEqual(20);
    expect(report.priorities.filter((p) => p.state === 'extra').map((p) => p.id)).toEqual(['side_delts', 'arms', 'glutes']);
    expect(lines[1]).toMatch(/^Side shoulders: \d+ sets every 5 workouts, 3 of them extra$/);
  });
  it('Lats, Side shoulders, Quads at 3 days, 30 min: #1 >= #2 >= #3, and a line never calls the same number total and extra', () => {
    const { report, lines } = build(3, 30, ['lats', 'side_delts', 'quads']);
    ranked(report);
    for (const [i, p] of report.priorities.entries()) if (p.extra > 0 && p.extra < p.total) expect(lines[i]).toBe(`${lines[i]!.split(':')[0]}: ${p.total} sets every 3 workouts, ${p.extra} of them extra`);
  });
});

describe('critic BLOCKER 2 and MAJOR 10: the fit line and its taps are true', () => {
  it('five picks at 3 days, 30 min: whatever is offered leaves no shortfall and takes nothing away', () => {
    const { input, report, fit } = build(3, 30, ['lats', 'side_delts', 'quads', 'biceps', 'glutes']);
    ranked(report);
    expect(fit).not.toBeNull();
    const taps = fit!.both ? [{ days: fit!.days!, minutes: fit!.minutes! }] : [...(fit!.days ? [{ days: fit!.days, minutes: 30 }] : []), ...(fit!.minutes ? [{ days: 3, minutes: fit!.minutes }] : [])];
    expect(fit!.line.includes('fit best with')).toBe(taps.length > 0);
    for (const tap of taps) {
      const next = generate({ ...input, ...tap });
      expect(next.ok && focusUnplaced(next.applied.focusReport)).toEqual([]);
      expect(next.ok && fixesFocus(report, next.applied.focusReport)).toBe(true);
    }
    if (!taps.length) expect(fit!.line).toMatch(/^(We fit what we could: .+ first\.|No extra work fits these days and minutes yet\.)/);
  });
  it('Chest, Back, Shoulders, Arms at 3 days, 45 min: Add a day is not offered, because with 4 days Chest would lose its extra', () => {
    const three = build(3, 45, ['chest', 'back', 'shoulders', 'arms']);
    const four = build(4, 45, ['chest', 'back', 'shoulders', 'arms']);
    ranked(three.report); ranked(four.report);
    const chest = (r: typeof three) => r.report.priorities[0]!.extra;
    if (chest(four) < chest(three) || focusUnplaced(four.report).length) expect(three.fit?.both ? undefined : three.fit?.days).toBeUndefined();
  });
  it('2 days, 30 min with Mobility, Grip, Forearms, Obliques, Back in a full gym: says what is true, never blames the equipment', () => {
    const { fit, lines } = build(2, 30, ['mobility', 'grip', 'forearms', 'obliques', 'back']);
    expect(fit!.line).toContain('No exercises for grip, forearms or obliques yet.');
    expect(fit!.line).not.toContain('equipment');
    expect(lines[0]).toMatch(/^Mobility: (\d+ min of stretches every 2 workouts|your sessions are too short for stretches)$/);
    if (fit!.minutes) expect(fit!.line).toContain('fit best with');
  });
});

describe('critic MAJOR 7: a day card why is about that day', () => {
  it('five picks, 4 days, 45 min: no two days say the same line unless both add the same, and a day that adds nothing says nothing', () => {
    const { plan, report } = build(4, 45, ['lats', 'upper_chest', 'side_delts', 'quads', 'biceps']);
    for (const [i, d] of plan.days.entries()) {
      const extras = report.dayExtra![i]!;
      expect(d.focusWhy?.length ?? 0).toBe(extras.length ? 1 : 0);
      for (const x of extras.slice(0, 2)) expect(d.focusWhy![0]).toContain(`${x.extra}`);
      expect(d.focusWhy?.[0] ?? '').not.toMatch(/every \d+ workouts|a week/);
    }
    const said = plan.days.flatMap((d) => d.focusWhy ?? []);
    for (const [i, a] of said.entries()) for (const b of said.slice(i + 1)) if (a === b) {
      const days = plan.days.map((d, k) => [d.focusWhy?.[0], JSON.stringify(report.dayExtra![k]!.slice(0, 2))] as const).filter(([w]) => w === a);
      expect(new Set(days.map(([, x]) => x)).size).toBe(1);
    }
  });
});
