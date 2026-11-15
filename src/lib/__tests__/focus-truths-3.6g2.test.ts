// PLAN 3.6g2, point 6: the small truths, each on the real generator.
import { describe, expect, it, vi as viTimeout } from 'vitest';
import { generate } from '../../data/generator';
import { equipmentPreset } from '../../db/gyms';
import type { GeneratorInput } from '../generator';
import type { FocusPickId } from '../intake/options';
import { yourPlanWords } from '../intake/yourPlan';
import { focusHeadline, focusTop } from '../plan/focusPriority';
import { cap } from '../words';
import { definitionPlan } from '../../data/plans';
import { focusDayLine } from '../plan/focusWords';
import { samples } from './focusMeasure36g';

// A heavy test file (the seeded plans are built once, then each rebuilt to read its day lines); an explicit limit sized for the GitHub runner, never a retry.
viTimeout.setConfig({ testTimeout: 240_000 });

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

describe('day cards never say "and more"', () => {
  it('the critic\'s line ("2 sets for upper chest, 2 for lats and more"): every add of the day is named, by rank', () => {
    expect(focusDayLine([{ id: 'upper_chest', extra: 2 }, { id: 'lats', extra: 2 }, { id: 'biceps', extra: 1 }, { id: 'mobility', extra: 0, minutes: 6 }])).toBe('Extra today: 2 sets for upper chest, 2 for lats, 1 for biceps and 6 min of stretches');
    expect(focusDayLine([{ id: 'upper_chest', extra: 2 }, { id: 'lats', extra: 2 }, { id: 'biceps', extra: 1 }], 'lats')).toBe('Lats first today. Extra: 2 sets for upper chest, 2 for lats and 1 for biceps');
  });
  it('every seeded plan: no day line says "and more", each names as many adds as the day has, and the longest (five adds) is three lines on the narrowest phone', () => {
    let lines = 0, longest = '';
    for (const s of samples()) {
      const r = generate(s.input);
      if (!r.ok) continue;
      for (const [i, d] of definitionPlan(r.plan)!.days.entries()) for (const line of d.focusWhy ?? []) {
        lines++;
        expect(line).not.toContain('and more');
        const adds = (s.report.dayExtra?.[i] ?? []).filter((x) => x.extra > 0 || (x.minutes ?? 0) >= 5);
        expect((line.match(/\d+ (?:sets? for|for|min of stretches)/g) ?? []).length, line).toBe(adds.length);
        if (line.length > longest.length) longest = line;
      }
    }
    expect(lines).toBeGreaterThan(1000);
    // About 45 characters fit a line of the day card at 320 pt: the fullest day's line (five adds) is three lines there, most are one or two.
    expect(longest.length, longest).toBeLessThanOrEqual(140);
  });
});
