// PLAN 3.6f round 2: the ux-critic's own cases (Nov 14), built through the real generator.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { equipmentPreset } from '../../db/gyms';
import type { GeneratorInput } from '../generator';
import { fixesFocus, focusFit, helpsFocus } from '../intake/focusFit';
import type { FocusPickId } from '../intake/options';
import { focusUnplaced } from '../plan/focus';
import { estimateDayMinutes as estimate } from '../plans';
import { focusLine, focusPeriod, focusRow } from '../plan/focusWords';
import { focusSummary } from '../plan/focusPriority';

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
/**
 * Round 3 (critic 3b): rank decides competition, it is not a ceiling. Shares never rise down the
 * ranking and no pick takes more than +4; a pick ends up ahead of one above it only when that one
 * could not use the room (proved on the pure module, lib/plan/__tests__/focusRank.test.ts).
 */
function ranked(report: ReturnType<typeof build>['report']) {
  let share = Infinity;
  for (const p of report.priorities.filter((x) => x.id !== 'mobility')) {
    expect(p.requested, p.id).toBeLessThanOrEqual(share);
    share = p.requested;
    if (!p.coveredBy) expect(p.extra, p.id).toBeLessThanOrEqual(4);
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
    // Round 3 (critic 4): Back and Quads have plenty, so their shares go round again: Side shoulders and Glutes, both under 12 sets, get +4.
    expect(lines[1]).toBe('Side shoulders: 10 sets every 5 workouts, 4 of them extra');
    expect(lines[4]).toBe('Glutes: 12 sets every 5 workouts, 4 of them extra');
    expect(report.priorities.reduce((n, p) => n + p.extra, 0)).toBeGreaterThanOrEqual(10);
    // Truth pass: every pick that got less than one below it is named with its own reason.
    expect(focusSummary(report)).toBe('Back and Quads already get plenty and Arms already has its share, so Side shoulders and Glutes get the most.');
  });
  it('Lats, Side shoulders, Quads at 3 days, 30 min: #1 >= #2 >= #3, and a line never calls the same number total and extra', () => {
    const { report, lines } = build(3, 30, ['lats', 'side_delts', 'quads']);
    ranked(report);
    for (const [i, p] of report.priorities.entries()) if (p.extra > 0 && p.extra < p.total) expect(lines[i]).toBe(`${lines[i]!.split(':')[0]}: ${p.total} sets every 3 workouts, ${p.extra} of them extra`);
  });
});

describe('critic BLOCKER 2 and MAJOR 10: the fit line and its taps are true', () => {
  it('five picks at 3 days, 30 min: whatever is offered is exactly what its line says, and takes nothing away', () => {
    const { input, report, fit } = build(3, 30, ['lats', 'side_delts', 'quads', 'biceps', 'glutes']);
    ranked(report);
    expect(fit).not.toBeNull();
    const taps = fit!.both ? [{ days: fit!.days!, minutes: fit!.minutes! }] : [...(fit!.days ? [{ days: fit!.days, minutes: 30 }] : []), ...(fit!.minutes ? [{ days: 3, minutes: fit!.minutes }] : [])];
    expect(fit!.line.includes('fit best with')).toBe(taps.length > 0 && !fit!.partial);
    for (const tap of taps) {
      const next = generate({ ...input, ...tap });
      // A full fix leaves no shortfall; the best partial step (round 3, critic 8) helps the picks it names and lowers nobody.
      if (!fit!.partial) expect(next.ok && focusUnplaced(next.applied.focusReport)).toEqual([]);
      if (!fit!.partial) expect(next.ok && fixesFocus(report, next.applied.focusReport)).toBe(true);
      if (fit!.partial) expect(next.ok ? helpsFocus(report, next.applied.focusReport).length : 0).toBeGreaterThan(0);
    }
    if (fit!.partial) expect(fit!.line).toMatch(/^With (\d days|\d+ min|\d days and \d+ min), .+ (gets?|get) (extra|more)\./);
    if (!taps.length) expect(fit!.line).toMatch(/^(Another day or more minutes would not add extra work for .+\.|This is all the extra work \d days of \d+ min can hold\.)/);
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

describe('round 3: the second critique\'s own cases (Nov 14), through the real generator', () => {
  it('critic 4: five parts on 5 days, 75 min: the chosen time is used, and no focused muscle is left where it started', () => {
    const { report, plan } = build(5, 75, ['lats', 'side_delts', 'biceps', 'quads', 'abs']);
    const by = Object.fromEntries(report.priorities.map((p) => [p.id, p]));
    // Lats (the back is at 20) and Quads (20) have plenty; what they could not use goes to the others, up to +4 each.
    expect(by.lats!.state).toBe('plenty'); expect(by.quads!.state).toBe('plenty');
    expect([by.side_delts!.extra, by.biceps!.extra, by.abs!.extra]).toEqual([4, 4, 4]);
    expect(by.biceps!.total).toBeGreaterThanOrEqual(12); expect(by.abs!.total).toBeGreaterThanOrEqual(12);
    // The budget counts each set once, net of the sets the 20 set limit took off the back: never past 12.
    expect(report.spent).toBeLessThanOrEqual(12);
    for (const d of plan.days) expect(estimate(d)).toBeLessThanOrEqual(75);
  });
  it('critic 4: five parts on 4 days, 45 min: more than one extra set for five picks, and the way to more is said', () => {
    const { report, fit } = build(4, 45, ['lats', 'upper_chest', 'side_delts', 'quads', 'biceps']);
    expect(report.priorities.reduce((n, p) => n + p.extra, 0)).toBeGreaterThanOrEqual(5);
    // The days are full at 45 min, so the picks that got nothing are told the step that helps, in its own words.
    expect(fit).toMatchObject({ partial: true });
    expect(fit!.line).toMatch(/^With (60 min|5 days|5 days and 60 min), .+ get (extra|more)\.$/);
    expect(fit!.line).not.toContain('yet');
  });
  it('critic 3 and 5: Back, Posture, Side shoulders, Glutes, Abs, Mobility on 6 days, 75 min: the summary names who got the most, and no row says two opposite things', () => {
    const { report } = build(6, 75, ['back', 'posture', 'side_delts', 'glutes', 'abs', 'mobility']);
    expect(report.priorities[0]!.state).toBe('plenty');
    expect(focusSummary(report)).toMatch(/^Back (and Posture )?already gets? plenty, so .+ gets? the most\.$/);
    for (const p of report.priorities) {
      const row = focusRow(p);
      const said = `${row.tag ?? ''} ${row.detail ?? ''}`;
      expect(/extra/.test(said) && /plenty/i.test(said), `${p.id}: ${said}`).toBe(false);
    }
    // Posture rides on back and rear shoulder work: the sets already shown under Back are said to be the same sets.
    const posture = report.priorities[1]!;
    expect(posture.coveredBy).toEqual(['back']);
    expect(posture.shared).toBeGreaterThan(0);
    expect(focusRow(posture).detail).toMatch(posture.shared === posture.total ? /^Covered by your back work: \d+ sets$/ : /\d+ of them also count for Back/);
    // Not every pick got the same any more.
    expect(new Set(report.priorities.filter((p) => p.id !== 'mobility').map((p) => p.extra)).size).toBeGreaterThan(1);
  });
  it('critic 10: five parts, 4 days, 45 min: a day that opens with a focused move says so, and a day names what it adds', () => {
    const { plan, report } = build(4, 45, ['lats', 'upper_chest', 'side_delts', 'quads', 'biceps']);
    const upperB = plan.days.findIndex((d) => d.name === 'Upper B');
    expect(report.dayLead![upperB]).toBe('upper_chest');
    expect(plan.days[upperB]!.focusWhy![0]).toMatch(/^Upper chest first today(\. Extra: .+)?$/);
    for (const [i, d] of plan.days.entries()) expect(!!d.focusWhy?.length, d.name).toBe(report.dayExtra![i]!.length > 0 || report.dayLead![i] !== null);
  });
});
