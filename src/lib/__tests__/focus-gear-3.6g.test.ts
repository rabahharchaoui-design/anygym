// PLAN 3.6g, point 5: "where equipment is missing say that". A pick the app has exercises for, in a
// gym with the equipment for none of them, is never told "no exercises yet": the plan, the reveal
// row, the reason and the fit line all say it needs equipment. A pick the app has no sure exercise
// for anywhere (Obliques; Grip and Forearms with nothing approved) keeps saying exactly that.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import { focusFit } from '../intake/focusFit';
import type { IntakeAnswers } from '../intake/funnel';
import type { FocusPickId } from '../intake/options';
import { readFocusReport } from '../plan/focusMetadata';
import { focusPassed, focusSummary } from '../plan/focusPriority';
import { focusFacts } from '../../data/focus';
import { profileFor } from '../../data/order';
import { definitionPlan } from '../../data/plans';
import { focusLine, focusRow } from '../plan/focusWords';

const build = (place: 'full' | 'none', picks: FocusPickId[]) => {
  const r = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, focusPicks: picks, scheduleStyle: 'flexible', gym: equipmentPreset(place, 'lb') });
  if (!r.ok) throw new Error(r.reason);
  return r.applied.focusReport!;
};
const answers = { days: 3, minutes: 45 } as IntakeAnswers;

describe('3.6g: a pick with no exercise in this gym', () => {
  it('no equipment at all, Lats and Abs picked: Lats needs equipment (never "no exercises yet"), and Abs still gets its extra', () => {
    const report = build('none', ['lats', 'abs']);
    const [lats, abs] = report.priorities;
    expect(lats).toMatchObject({ id: 'lats', state: 'no_move', noMove: true, gear: true, extra: 0, total: 0 });
    expect(abs!.extra).toBeGreaterThan(0);
    expect(abs!.gear).toBeUndefined();
    expect(focusRow(lats!)).toEqual({ name: 'Lats', amount: null, tag: 'needs equipment', detail: null });
    expect(focusLine(lats!, 'every 3 workouts')).toEqual(['Lats', 'needs equipment you do not have here']);
    expect(focusPassed(report)).toBe('Lats needs equipment you do not have here, so Abs gets the most.');
    expect(focusFit(answers, report, () => undefined)?.line).toBe('Lats needs equipment you do not have here.');
    // Saved and read back like any report.
    expect(readFocusReport(structuredClone(report))).toEqual(report);
  });
  it('several at once, and both kinds side by side, each in its own sentence', () => {
    const report = build('none', ['lats', 'biceps', 'obliques', 'abs']);
    expect(report.priorities.map((p) => [p.id, p.state, p.gear])).toEqual([['lats', 'no_move', true], ['biceps', 'no_move', true], ['obliques', 'no_move', undefined], ['abs', 'extra', undefined]]);
    expect(focusPassed(report)).toBe('Obliques has no exercises yet and Lats and Biceps need equipment you do not have here, so Abs gets the most.');
    expect(focusFit(answers, report, () => undefined)?.line).toBe('No exercises for obliques yet. Lats and Biceps need equipment you do not have here.');
  });
  it('a full gym: the same picks are served, and a pick with no sure exercise anywhere is never blamed on equipment', () => {
    const report = build('full', ['lats', 'obliques', 'grip']);
    expect(report.priorities[0]).toMatchObject({ id: 'lats', state: 'extra' });
    for (const p of report.priorities.slice(1)) {
      expect(p).toMatchObject({ state: 'no_move' });
      expect(p.gear).toBeUndefined();
      expect(focusRow(p).tag).toBe('no exercises yet');
    }
  });
  it('a report saved before this has no mark and reads as it did', () => {
    const old = { id: 'grip' as const, requested: 4, extra: 0, total: 0, shortfall: false, state: 'no_move' as const, noMove: true as const };
    expect(focusRow(old).tag).toBe('no exercises yet');
    expect(readFocusReport({ budget: 4, spent: 0, priorities: [{ ...old, gear: 'yes' }], days: [[]] })).toBeUndefined();
  });

describe('3.6g2, the hotel line: said once, and only when nothing in the plan works the muscle', () => {
  const hotel = (picks: FocusPickId[]) => {
    const r = generate({ goals: ['muscle'], experience: '3y', days: 3, minutes: 45, focusPicks: picks, scheduleStyle: 'flexible', gym: equipmentPreset('hotel', 'lb') });
    if (!r.ok) throw new Error(r.reason);
    return r.applied.focusReport!;
  };
  it('the critic\'s case, a hotel gym with Lats and Biceps: the plan has rows, which work the lats, so nothing says Lats needs equipment; one sentence says what is true', () => {
    const report = hotel(['lats', 'biceps']);
    const [lats, biceps] = report.priorities;
    expect(lats).toMatchObject({ id: 'lats', state: 'no_move', helped: true, extra: 0 });
    expect(lats!.gear).toBeUndefined();
    expect(biceps!.extra).toBeGreaterThan(0);
    const fit = focusFit(answers, report, () => undefined)!.line, summary = focusSummary(report);
    expect(fit).toBe('Lats has no exercise of its own with this equipment; other exercises here still work it.');
    // Once: the summary under it does not say it again (one pick alone can take sets: nothing to compare).
    expect(summary).toBeNull();
    expect(focusRow(lats!)).toEqual({ name: 'Lats', amount: null, tag: 'no exercise of its own', detail: null });
    expect(focusLine(lats!, 'every 3 workouts')).toEqual(['Lats', 'no exercise of its own here']);
    expect(readFocusReport(structuredClone(report))).toEqual(report);
  });
  it('no equipment at all: nothing works the lats, so the line is said, and said once (the summary does not repeat it)', () => {
    const report = build('none', ['lats', 'abs', 'glutes']);
    expect(report.priorities[0]).toMatchObject({ id: 'lats', state: 'no_move', gear: true });
    const fit = focusFit(answers, report, () => undefined)!.line, summary = focusSummary(report) ?? '';
    expect(`${fit} ${summary}`.match(/equipment you do not have here/g)).toHaveLength(1);
    expect(fit).toContain('Lats needs equipment you do not have here.');
  });
  it('every place and pick: a pick is told it needs equipment only when no move of the plan works it, and the words are never said twice', () => {
    let gear = 0, helped = 0;
    for (const place of ['hotel', 'home', 'none', 'full'] as const) for (const pick of ['lats', 'biceps', 'side_delts', 'upper_chest', 'hamstrings', 'calves', 'triceps'] as const) {
      const r = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, focusPicks: [pick, 'abs'], scheduleStyle: 'flexible', gym: equipmentPreset(place as 'full', 'lb') });
      if (!r.ok) continue;
      const report = r.applied.focusReport!, p = report.priorities[0]!;
      const works = definitionPlan(r.plan)!.days.flatMap((d) => d.blocks.flatMap((b) => b.items)).some((it) => focusFacts(it.exerciseId, profileFor(it.exerciseId)).also?.includes(pick));
      if (p.gear) { gear++; expect(works, `${place} ${pick}`).toBe(false); }
      if (p.helped) { helped++; expect(works, `${place} ${pick}`).toBe(true); expect(p.gear).toBeUndefined(); }
      const said = `${focusFit(answers, report, () => undefined)?.line ?? ''} ${focusSummary(report) ?? ''}`;
      expect(said.match(/equipment you do not have here/g)?.length ?? 0, `${place} ${pick}: ${said}`).toBeLessThanOrEqual(1);
      expect(said.match(/no exercise of (its|their) own/g)?.length ?? 0, `${place} ${pick}: ${said}`).toBeLessThanOrEqual(1);
    }
    expect(gear).toBeGreaterThan(0);
    expect(helped).toBeGreaterThan(0);
  });
});
});
