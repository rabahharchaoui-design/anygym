// PLAN 3.6f truth pass, point 2 (third critique, items 2 and 11): a one tap fix never moves the
// goalposts: what a step gives is what its line says, and it lowers no pick. PLAN 3.6g2: the line
// names the step with the rebuilt plan's real numbers, the button says its value, and a pick under
// 12 sets is always said (so a plan can ask again after a tap; each ask is checked the same way).
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { focusFit, type FocusFit } from '../intake/focusFit';
import { checkFit, tapsOf } from './focusFitCheck36g2';
import type { IntakeAnswers } from '../intake/funnel';
import type { FocusPickId } from '../intake/options';
import { generatorInputOf } from '../intake/yourPlan';
import { focusUnplaced, type FocusReport, type FocusResult } from '../plan/focus';
import { focusSummary } from '../plan/focusPriority';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 400 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
viTimeout.setConfig({ testTimeout: 120_000 });

const base: IntakeAnswers = { goals: ['muscle'], experience: '3y', place: 'full', style: 'mix', cardio: 'little', scheduleStyle: 'flexible' };
const built = new Map<string, FocusReport | undefined>();
/** The plan's focus report for these answers (each plan is built once for the whole file). */
function reportOf(a: IntakeAnswers): FocusReport | undefined {
  const key = JSON.stringify([a.goals, a.experience, a.place, a.days, a.minutes, a.focusPicks]);
  if (!built.has(key)) { const r = generate(generatorInputOf(a)); built.set(key, r.ok ? r.applied.focusReport : undefined); }
  return built.get(key);
}
const fitOf = (a: IntakeAnswers): FocusFit | null => focusFit(a, reportOf(a), reportOf);
const extras = (r: FocusReport) => Object.fromEntries(r.priorities.map((p) => [p.id, p.extra]));
/** PLAN 3.6g2: the fit of these answers, checked against this plan and the plans rebuilt with each step it offers (focusFitCheck36g2.ts). */
const checked = (a: IntakeAnswers, label: string) => { const fit = fitOf(a); return { fit, taps: checkFit(reportOf(a)!, fit, (tap) => reportOf({ ...a, ...tap }), label) }; };

describe('critic 2: Upper chest, Side shoulders, Biceps at 4 days, 30 min', () => {
  const a: IntakeAnswers = { ...base, days: 4, minutes: 30, focusPicks: ['upper_chest', 'side_delts', 'biceps'] };
  it('offers the nearest step with its real numbers, and what the step gives is exactly what its line says', () => {
    const { fit, taps } = checked(a, 'critic 2');
    expect(taps.length).toBeGreaterThan(0);
    // Before the truth pass: "With 5 days, Upper chest gets extra." and then, at 5 days, "fit best with 6 days and 45 min".
    expect(fit!.line).not.toBe('With 5 days, Upper chest gets extra.');
    // PLAN 3.6g2: the step is named with numbers ("Make it 45 min: Upper chest 4 to 6 …"), never "fit best with".
    expect(fit!.line).toMatch(/^Make it (\d days|\d+ min|\d days and \d+ min): /);
    for (const tap of taps) {
      const now = extras(reportOf(a)!), next = extras(reportOf({ ...a, ...tap })!);
      for (const id of Object.keys(now)) expect(next[id]!, id).toBeGreaterThanOrEqual(now[id]!);
      // PLAN 3.6g2: after the tap the plan may ask again (a pick still under 12 is always said); what it then offers is checked the same way.
      checked({ ...a, ...tap }, `critic 2 after ${JSON.stringify(tap)}`);
    }
  });
  it('the old second screen (5 days, 30 min) no longer says "prioritized … Side shoulders" over its +1, and its reason is composed from that plan', () => {
    const five = { ...a, days: 5 as const };
    const report = reportOf(five)!;
    // PLAN 3.6g2, the strict rank: Biceps (#3) no longer gets more than Side shoulders (#2) got; it stays at none and its row says its days are full.
    expect(extras(report)).toEqual({ upper_chest: 2, side_delts: 1, biceps: 0 });
    const { fit } = checked(five, 'second screen');
    expect(fit?.line ?? '').not.toContain('prioritized');
    expect(fit).toMatchObject({ minutes: 45, labels: { minutes: 'Make it 45 min' } });
    // The numbers follow the rank, so there is no pick passed to explain: the summary only says who leads.
    expect(focusSummary(report, !!fit?.named)).toBe('Most extra work: Upper chest.');
  });
});

describe('critic 11: a step that lowers any pick is never offered', () => {
  const p = (id: FocusPickId, requested: number, extra: number): FocusResult => ({ id, requested, extra, total: 8 + extra, shortfall: extra < Math.max(1, requested - 1) });
  const report = (...priorities: ReturnType<typeof p>[]): FocusReport => ({ budget: 12, spent: 0, priorities, days: [] });
  it('Lats +4 would become +3 with more minutes: not offered, though +3 is its whole share', () => {
    const now = report(p('lats', 3, 4), p('side_delts', 3, 0), p('biceps', 3, 0));
    const lower = report(p('lats', 3, 3), p('side_delts', 3, 3), p('biceps', 3, 3));
    // No step is offered. (These hand made reports carry no reason, as reports saved before PLAN 3.6g2: with nothing true to add, nothing is said.)
    expect(focusFit({ days: 3, minutes: 45 }, now, () => lower)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, now, () => now)).toBeNull();
    // With the reason on record the picks are told why they stay.
    const why = report(p('lats', 3, 4), { ...p('side_delts', 3, 0), held: 'room' as const, under: 4 }, { ...p('biceps', 3, 0), held: 'rank' as const, heldBy: 'side_delts' as const, under: 4 });
    expect(focusFit({ days: 3, minutes: 45 }, why, () => lower)).toEqual({ line: 'Side shoulders stays under 12 sets: its days are full. Biceps stays under 12 sets: it gets no more than Side shoulders, ranked above it.' });
    // The same step with Lats kept at +4 is the fix, said with its numbers and on its button.
    const kept = report(p('lats', 3, 4), p('side_delts', 3, 3), p('biceps', 3, 3));
    expect(focusFit({ days: 3, minutes: 45 }, now, (x) => (x.minutes === 60 && x.days === 3 ? kept : lower))).toEqual({ line: 'Make it 60 min: Side shoulders 8 to 11 and Biceps 8 to 11.', minutes: 60, labels: { minutes: 'Make it 60 min' } });
  });
  it('a fix two steps away is offered once, in full, and its button says the days and the minutes', () => {
    const now = report(p('lats', 3, 3), p('biceps', 3, 0));
    const all = report(p('lats', 3, 3), p('biceps', 3, 3));
    const fit = focusFit({ days: 4, minutes: 30 }, now, (x) => (x.days === 6 && x.minutes === 45 ? all : now));
    expect(fit).toEqual({ line: 'Make it 6 days and 45 min: Biceps 8 to 11.', days: 6, minutes: 45, both: true, addDays: 2, labels: { both: 'Make it 6 days and 45 min' } });
  });
  it('PLAN 3.6g2: the button never jumps in silence: 20 minutes to 60 is said on the button and in the line (the critic\'s Upper chest and Calves at 20 min)', () => {
    const a: IntakeAnswers = { ...base, days: 3, minutes: 20, focusPicks: ['upper_chest', 'calves'] };
    const { fit, taps } = checked(a, '20 min');
    expect(taps.length).toBeGreaterThan(0);
    for (const label of Object.values(fit!.labels!)) expect(label).toMatch(/^Make it (\d days|\d+ min|\d days and \d+ min)$/);
    if (fit!.minutes) expect(JSON.stringify(fit!.labels)).toContain(`${fit!.minutes} min`);
  });
});

describe('PLAN 3.6g2: every offered step is true to its line and lowers no pick, and nobody under 12 is passed over in silence (seeded intakes)', () => {
  const pool: FocusPickId[] = ['upper_chest', 'lats', 'side_delts', 'biceps', 'quads', 'glutes', 'abs', 'triceps', 'hamstrings', 'rear_delts', 'calves', 'upper_back', 'posture', 'front_delts', 'lower_back', 'obliques'];
  const seen = { offers: 0, partial: 0, full: 0, far: 0, stays: 0, again: 0 };
  for (let count = 1; count <= 6; count++) for (const variant of [0, 1, 2]) it(`${count} picks, set ${variant}`, () => {
    // Three different pick lists for each count; every days and minutes choice is a starting point.
    const focusPicks = Array.from({ length: count }, (_, i) => pool[(variant * 4 + i * (variant * 2 + 1)) % pool.length]!);
    expect(new Set(focusPicks).size).toBe(count);
    for (const days of [2, 3, 4, 5, 6] as const) for (const minutes of [20, 30, 45, 60, 75] as const) {
      const a: IntakeAnswers = { ...base, experience: variant === 1 ? 'months' : '3y', days, minutes, focusPicks };
      const now = reportOf(a);
      if (!now) continue;
      const label = `${focusPicks.join(',')} ${days}d ${minutes}m`;
      const { fit, taps } = checked(a, label);
      if (fit && /(stays?|gets?) (under 12 sets|no extra|no more): /.test(fit.line)) seen.stays++;
      for (const tap of taps) {
        seen.offers++; if (fit!.partial) seen.partial++; else seen.full++;
        if ((tap.days ?? days) - days + [20, 30, 45, 60, 75].indexOf(tap.minutes ?? minutes) - [20, 30, 45, 60, 75].indexOf(minutes) > 1) seen.far++;
        const next = reportOf({ ...a, ...tap })!;
        // A step that is not partial leaves nothing to ask for: every share placed, nobody with an exercise under 12, and no further button.
        if (!fit!.partial) { expect(focusUnplaced(next).filter((p) => p.id !== 'mobility'), `${label} -> ${JSON.stringify(tap)}`).toEqual([]); expect(next.priorities.some((p) => (p.under ?? 0) > 0)).toBe(false); expect(tapsOf(fitOf({ ...a, ...tap })), `${label} -> ${JSON.stringify(tap)}`).toEqual([]); }
        else if (tapsOf(fitOf({ ...a, ...tap })).length) seen.again++;
      }
    }
  });
  it('met full fixes, partial steps, steps more than one away and plain sentences', () => {
    expect(seen.offers).toBeGreaterThan(40);
    expect(seen.full).toBeGreaterThan(10);
    expect(seen.partial).toBeGreaterThan(10);
    expect(seen.far).toBeGreaterThan(0);
    expect(seen.stays).toBeGreaterThan(20);
    console.log(JSON.stringify(seen));
  });
});
