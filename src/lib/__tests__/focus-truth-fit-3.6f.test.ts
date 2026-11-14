// PLAN 3.6f truth pass, point 2 (third critique, items 2 and 11): a one tap fix never moves the
// goalposts. Whatever the reveal offers is the last thing it asks for, and it lowers no pick.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { focusFit, type FocusFit } from '../intake/focusFit';
import type { IntakeAnswers } from '../intake/funnel';
import type { DaysPerWeek, FocusPickId, Minutes } from '../intake/options';
import { generatorInputOf } from '../intake/yourPlan';
import { focusUnplaced, type FocusReport } from '../plan/focus';
import { focusSummary } from '../plan/focusPriority';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 400 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
viTimeout.setConfig({ testTimeout: 30_000 });

const base: IntakeAnswers = { goals: ['muscle'], experience: '3y', place: 'full', style: 'mix', cardio: 'little', scheduleStyle: 'flexible' };
const built = new Map<string, FocusReport | undefined>();
/** The plan's focus report for these answers (each plan is built once for the whole file). */
function reportOf(a: IntakeAnswers): FocusReport | undefined {
  const key = JSON.stringify([a.goals, a.experience, a.place, a.days, a.minutes, a.focusPicks]);
  if (!built.has(key)) { const r = generate(generatorInputOf(a)); built.set(key, r.ok ? r.applied.focusReport : undefined); }
  return built.get(key);
}
const fitOf = (a: IntakeAnswers): FocusFit | null => focusFit(a, reportOf(a), reportOf);
/** The taps a fit shows: both together, or a day and minutes as two separate buttons. */
const tapsOf = (fit: FocusFit | null): Array<{ days?: DaysPerWeek; minutes?: Minutes }> => (!fit ? [] : fit.both ? [{ days: fit.days!, minutes: fit.minutes! }] : [...(fit.days ? [{ days: fit.days }] : []), ...(fit.minutes ? [{ minutes: fit.minutes }] : [])]);
const extras = (r: FocusReport) => Object.fromEntries(r.priorities.map((p) => [p.id, p.extra]));

describe('critic 2: Upper chest, Side shoulders, Biceps at 4 days, 30 min', () => {
  const a: IntakeAnswers = { ...base, days: 4, minutes: 30, focusPicks: ['upper_chest', 'side_delts', 'biceps'] };
  it('offers one step that ends the matter, and after it nothing more is asked', () => {
    const fit = fitOf(a)!;
    const taps = tapsOf(fit);
    expect(taps.length).toBeGreaterThan(0);
    // Before the truth pass: "With 5 days, Upper chest gets extra." and then, at 5 days, "fit best with 6 days and 45 min".
    expect(fit.line).not.toBe('With 5 days, Upper chest gets extra.');
    expect(fit.line).toMatch(fit.partial ? / That is the most that fits\.$/ : /^3 focus areas fit best with /);
    for (const tap of taps) {
      const after = { ...a, ...tap };
      expect(tapsOf(fitOf(after)), JSON.stringify(tap)).toEqual([]);
      const now = extras(reportOf(a)!), next = extras(reportOf(after)!);
      for (const id of Object.keys(now)) expect(next[id]!, id).toBeGreaterThanOrEqual(now[id]!);
      if (!fit.partial) expect(focusUnplaced(reportOf(after))).toEqual([]);
    }
  });
  it('the old second screen (5 days, 30 min) no longer says "prioritized … Side shoulders" over its +1, and its reason is composed from that plan', () => {
    const five = { ...a, days: 5 as const };
    const report = reportOf(five)!;
    expect(extras(report)).toEqual({ upper_chest: 2, side_delts: 1, biceps: 3 });
    const fit = fitOf(five);
    expect(fit?.line ?? '').not.toContain('Side shoulders');
    if (fit?.named) expect(fit.line).toContain('we prioritized Biceps.');
    // "Upper chest has less room…, so Biceps gets the most" read as stale beside Upper chest +2: both picks passed are named now.
    expect(focusSummary(report, !!fit?.named)).toBe('Upper chest and Side shoulders have no more room on their days, so Biceps gets the most.');
  });
});

describe('critic 11: a step that lowers any pick is never offered', () => {
  const p = (id: FocusPickId, requested: number, extra: number) => ({ id, requested, extra, total: 8 + extra, shortfall: extra < Math.max(1, requested - 1) });
  const report = (...priorities: ReturnType<typeof p>[]): FocusReport => ({ budget: 12, spent: 0, priorities, days: [] });
  it('Lats +4 would become +3 with more minutes: not offered, though +3 is its whole share', () => {
    const now = report(p('lats', 3, 4), p('side_delts', 3, 0), p('biceps', 3, 0));
    const lower = report(p('lats', 3, 3), p('side_delts', 3, 3), p('biceps', 3, 3));
    // What is said instead is the truth about those steps: they would move extra work, not add to everyone's.
    expect(focusFit({ days: 3, minutes: 45 }, now, () => lower)).toEqual({ line: 'Another day or more minutes would only move extra work from one pick to another, so Side shoulders and Biceps stay as they are.' });
    expect(focusFit({ days: 3, minutes: 45 }, now, () => now)).toEqual({ line: 'Another day or more minutes would not add extra work for Side shoulders or Biceps.' });
    // The same step with Lats kept at +4 is the fix.
    const kept = report(p('lats', 3, 4), p('side_delts', 3, 3), p('biceps', 3, 3));
    expect(focusFit({ days: 3, minutes: 45 }, now, (x) => (x.minutes === 60 && x.days === 3 ? kept : lower))).toMatchObject({ minutes: 60, line: '3 focus areas fit best with 60 min; we prioritized Lats.' });
  });
  it('a fix two steps away is offered once, in full, and says how many days', () => {
    const now = report(p('lats', 3, 3), p('biceps', 3, 0));
    const all = report(p('lats', 3, 3), p('biceps', 3, 3));
    const fit = focusFit({ days: 4, minutes: 30 }, now, (x) => (x.days === 6 && x.minutes === 45 ? all : now));
    expect(fit).toEqual({ line: '2 focus areas fit best with 6 days and 45 min; we prioritized Lats.', days: 6, minutes: 45, both: true, addDays: 2, named: true });
  });
});

describe('applying any offered step yields no further offer and no pick lower (seeded intakes)', () => {
  const pool: FocusPickId[] = ['upper_chest', 'lats', 'side_delts', 'biceps', 'quads', 'glutes', 'abs', 'triceps', 'hamstrings', 'rear_delts', 'calves', 'upper_back', 'posture', 'front_delts', 'lower_back', 'obliques'];
  const seen = { offers: 0, partial: 0, full: 0, far: 0 };
  for (let count = 1; count <= 6; count++) for (const variant of [0, 1, 2]) it(`${count} picks, set ${variant}`, () => {
    // Three different pick lists for each count; every days and minutes choice is a starting point.
    const focusPicks = Array.from({ length: count }, (_, i) => pool[(variant * 4 + i * (variant * 2 + 1)) % pool.length]!);
    expect(new Set(focusPicks).size).toBe(count);
    for (const days of [2, 3, 4, 5, 6] as const) for (const minutes of [20, 30, 45, 60, 75] as const) {
      const a: IntakeAnswers = { ...base, experience: variant === 1 ? 'months' : '3y', days, minutes, focusPicks };
      const now = reportOf(a);
      if (!now) continue;
      const fit = fitOf(a);
      for (const tap of tapsOf(fit)) {
        seen.offers++; if (fit!.partial) seen.partial++; else seen.full++;
        if ((tap.days ?? days) - days + [20, 30, 45, 60, 75].indexOf(tap.minutes ?? minutes) - [20, 30, 45, 60, 75].indexOf(minutes) > 1) seen.far++;
        const label = `${focusPicks.join(',')} ${days}d ${minutes}m -> ${JSON.stringify(tap)}`;
        const after = { ...a, ...tap };
        const next = reportOf(after);
        expect(next, label).toBeDefined();
        // No further offer: the rebuilt reveal has no button.
        expect(tapsOf(fitOf(after)), label).toEqual([]);
        // No pick lower, not by one set.
        for (const p of now.priorities) { const q = next!.priorities.find((x) => x.id === p.id)!; expect(q.extra, `${p.id} ${label}`).toBeGreaterThanOrEqual(p.extra); expect(q.minutes ?? 0, `${p.id} ${label}`).toBeGreaterThanOrEqual(p.minutes ?? 0); }
        // A full fix leaves nothing unplaced; a partial one says it is partial and final, and does add something.
        if (!fit!.partial) expect(focusUnplaced(next), label).toEqual([]);
        else { expect(fit!.line, label).toContain('That is the most that fits.'); expect(next!.priorities.some((q) => q.extra > now.priorities.find((p) => p.id === q.id)!.extra || (q.minutes ?? 0) > (now.priorities.find((p) => p.id === q.id)!.minutes ?? 0)), label).toBe(true); }
      }
    }
  });
  it('met full fixes, partial steps and fixes more than one step away', () => {
    expect(seen.offers).toBeGreaterThan(40);
    expect(seen.full).toBeGreaterThan(10);
    expect(seen.partial).toBeGreaterThan(5);
    expect(seen.far).toBeGreaterThan(0);
    console.log(JSON.stringify(seen));
  });
});
