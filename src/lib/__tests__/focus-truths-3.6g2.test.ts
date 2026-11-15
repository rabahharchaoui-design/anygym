// PLAN 3.6g2, point 6: the small truths, each on the real generator.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import type { GeneratorInput } from '../generator';
import type { FocusPickId } from '../intake/options';
import { yourPlanWords } from '../intake/yourPlan';
import { focusHeadline, focusTop } from '../plan/focusPriority';
import { cap } from '../words';

const build = (picks: FocusPickId[], days: number, minutes: number) => {
  const input: GeneratorInput = { goals: ['muscle'], experience: '3y', days, minutes, focusPicks: picks, scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') };
  const r = generate(input);
  if (!r.ok) throw new Error(r.reason);
  return { r, report: r.applied.focusReport! };
};

describe('one story: the Plans card and the plan screen headline come from one function', () => {
  it('the critic\'s case (five picks on 4 days of 60 min: the card said "Extra lats and side shoulders work", the headline "extra lats work"): both say the picks with the most extra, all of them', () => {
    const { r, report } = build(['lats', 'side_delts', 'biceps', 'upper_chest', 'glutes'], 4, 60);
    const headline = focusHeadline(report)!;
    expect(headline).toMatch(/^extra .+ work|^extra work for \d focus areas$/);
    // The plan screen's headline carries exactly these words; the card shows them with a capital (screens/plans/PlanCard.tsx).
    expect(yourPlanWords(r.applied, { goals: ['muscle'], days: 4, minutes: 60 }, 4).reason).toContain(`, ${headline}`);
    expect(cap(headline).startsWith('Extra ')).toBe(true);
    const top = focusTop(report);
    if (top.length <= 3) expect(headline.replace(/^extra | work$/g, '').split(/, | and /)).toHaveLength(top.length);
  });
  it('never the first two by rank: a pick with less extra than the leader is not in the words, and no extra means no words', () => {
    const { report } = build(['lats', 'side_delts', 'biceps'], 4, 60);
    const top = focusTop(report).map((p) => p.id);
    const headline = focusHeadline(report)!;
    for (const p of report.priorities) expect(headline.includes(p.id === 'side_delts' ? 'side shoulders' : p.id), p.id).toBe(top.includes(p.id));
    expect(focusHeadline({ priorities: report.priorities.map((p) => ({ ...p, extra: 0 })) })).toBeNull();
  });
});
