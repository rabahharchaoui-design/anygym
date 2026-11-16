// PLAN 3.6f truth pass, point 1 (third critique, items 1 and 10): the rank and the words about it.
// The critic's two plans are rebuilt through the real generator; what is proved is why a lower pick
// came out ahead, and that every sentence about priority follows the final numbers.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { equipmentPreset } from '../../db/gyms';
import { focusFit } from '../intake/focusFit';
import type { IntakeAnswers } from '../intake/funnel';
import type { ExperienceId, FocusPickId, GoalId } from '../intake/options';
import { generatorInputOf, yourPlanWords } from '../intake/yourPlan';
import { focusName, type FocusReport } from '../plan/focus';
import { focusCompared, focusPassed, focusPrioritized, focusSummary, focusTop } from '../plan/focusPriority';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 1239 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
// PLAN 3.6p: the build is fast again; about four times the slowest test here on a laptop under load, never under 30 s.
viTimeout.setConfig({ testTimeout: 30_000 });

const base: IntakeAnswers = { goals: ['muscle'], experience: '3y', place: 'full', style: 'mix', cardio: 'little', scheduleStyle: 'flexible' };
function reveal(a: IntakeAnswers) {
  const r = generate(generatorInputOf(a));
  if (!r.ok) throw new Error(r.reason);
  const report = r.applied.focusReport!;
  const fit = focusFit(a, report, (x) => { const y = generate(generatorInputOf(x)); return y.ok ? y.applied.focusReport : undefined; });
  const plan = definitionPlan(r.plan)!;
  return { r, report, fit, plan, summary: focusSummary(report, !!fit?.named), reason: yourPlanWords(r.applied, a, plan.days.length).reason };
}
const extras = (report: FocusReport) => Object.fromEntries(report.priorities.map((p) => [p.id, p.extra]));

/** PLAN 3.6g2, the strict rank: no pick has more extra of its own than a pick ranked above it that can still take sets. */
function strict(report: FocusReport) {
  const open = report.priorities.filter((p) => p.id !== 'mobility' && p.state !== 'no_move' && !p.atLimit && p.held !== 'maxed');
  for (const [i, low] of open.entries()) for (const high of open.slice(0, i)) expect(low.extra - (low.rides?.extra ?? 0), `${low.id} above ${high.id}`).toBeLessThanOrEqual(high.extra);
}

describe('critic 1, then PLAN 3.6g2: a lower pick never comes out ahead of a higher one that has an exercise, whatever the room', () => {
  // PLAN 3.6g2 (the fourth critique): "no room on its days" is no longer a reason for a lower pick to get more. On these full 45 min days the #1 pick gets its +3 or more first; the #2 pick then has no room, so the picks below it get no more than it got, and every row says why.
  it('Lats, Side shoulders, Biceps, Upper chest, Glutes at 4 days, 45 min: Glutes (#5) is no longer ahead of Biceps (#3) and Upper chest (#4), and the words say why each got none', () => {
    const x = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts', 'biceps', 'upper_chest', 'glutes'] });
    expect(extras(x.report)).toEqual({ lats: 4, side_delts: 0, biceps: 0, upper_chest: 0, glutes: 0 });
    strict(x.report);
    expect(x.report.priorities.map((p) => [p.held, p.heldBy])).toEqual([['room', undefined], ['room', undefined], ['rank', 'side_delts'], ['rank', 'side_delts'], ['rank', 'side_delts']]);
    // The words: exactly the pick with the most is "prioritized", and no pick is said to be ahead of one above it.
    // PLAN 3.6g2: the fit line names the step with its numbers; who leads is the summary's to say.
    expect(x.fit!.line).toMatch(/^Make it 60 min: Lats 10 to 12, /);
    expect(x.summary).toBe('Most extra work: Lats.');
    expect(focusPassed(x.report)).toBeNull();
    expect(x.reason).toContain('extra lats work');
  });
  it('Upper chest, Lats, Side shoulders, Quads, Biceps at 4 days, 45 min: Quads (#4) is no longer ahead of Side shoulders (#3)', () => {
    const x = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['upper_chest', 'lats', 'side_delts', 'quads', 'biceps'] });
    expect(extras(x.report)).toEqual({ upper_chest: 4, lats: 0, side_delts: 0, quads: 0, biceps: 0 });
    strict(x.report);
    expect(x.fit!.line).toMatch(/^Make it /);
    expect(x.summary).toBe('Most extra work: Upper chest.');
    expect(focusPassed(x.report)).toBeNull();
    expect(x.reason).toContain('extra upper chest work');
  });
  it('with the last pick taken out of the list the picks above it get the same: nothing was given away out of order', () => {
    const without = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts', 'biceps', 'upper_chest'] });
    expect(extras(without.report)).toEqual({ lats: 4, side_delts: 0, biceps: 0, upper_chest: 0 });
    const noQuads = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['upper_chest', 'lats', 'side_delts', 'biceps'] });
    expect(extras(noQuads.report).lats).toBeLessThanOrEqual(2);
    expect(extras(noQuads.report).side_delts).toBe(0);
    strict(without.report); strict(noQuads.report);
  });
});

describe('critic 10: the small words', () => {
  it('one pick is never "prioritized", and is named instead of counted', () => {
    const x = reveal({ ...base, days: 2, minutes: 30, focusPicks: ['side_delts'] });
    if (x.fit) { expect(x.fit.line).not.toMatch(/prioritized|1 focus area/); expect(x.fit.named).toBeUndefined(); }
    expect(x.summary).toBeNull();
  });
  it('two picks that are the only two are not "prioritized"; three with the same extra are all in the headline', () => {
    const p = (id: FocusPickId, extra: number, requested = 4) => ({ id, requested, extra, total: 8 + extra, shortfall: false });
    expect(focusPrioritized({ priorities: [p('lats', 4), p('biceps', 4)] })).toBeNull();
    expect(focusPrioritized({ priorities: [p('lats', 4), p('biceps', 2)] })).toBe('Lats');
    expect(focusPrioritized({ priorities: [p('lats', 4)] })).toBeNull();
    const three = reveal({ ...base, days: 3, minutes: 75, focusPicks: ['lats', 'side_delts', 'biceps'] });
    expect(new Set(Object.values(extras(three.report))).size).toBe(1);
    expect(three.reason).toContain('extra lats, side shoulders and biceps work');
    expect(three.summary).toMatch(/^Every pick gets the same extra work: \+\d\.$/);
  });
});

describe('every sentence about priority follows the final numbers (seeded intakes)', () => {
  const atomic: FocusPickId[] = ['upper_chest', 'lats', 'upper_back', 'lower_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'posture', 'grip', 'mobility'];
  const exp: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
  const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
  const seen = { prioritized: 0, most: 0, passed: 0, plans: 0 };
  /** The picks a sentence names, checked against the numbers: each got at least as much as every pick it leaves out. */
  const namesAreTop = (report: FocusReport, text: string, label: string) => {
    const hard = focusCompared(report);
    const named = text.split(/, | and /).map((t) => t.trim());
    const picks = named.map((n) => hard.find((p) => focusName(p.id) === n));
    expect(picks.every(Boolean), `${label}: every name is a pick (${text})`).toBe(true);
    const rest = hard.filter((p) => !picks.includes(p));
    const least = Math.min(...picks.map((p) => p!.extra));
    expect(least, `${label}: named picks got extra (${text})`).toBeGreaterThan(0);
    for (const p of rest) expect(p.extra, `${label}: ${p.id} is left out of "${text}" with more`).toBeLessThan(least);
    expect(rest.length, `${label}: never every pick (${text})`).toBeGreaterThan(0);
  };
  for (let count = 1; count <= 8; count++) for (const days of [2, 3, 4, 5, 6]) it(`${count} picks, ${days} days`, () => {
    for (const minutes of [20, 30, 45, 60, 75]) for (const limited of [false, true]) {
      const seed = count * 250 + days * 31 + minutes * 17 + Number(limited);
      let rng = seed + 1;
      const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
      const ranked = [...atomic];
      for (let i = ranked.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!]; }
      const input = { goals: [goals[seed % goals.length]!], experience: exp[seed % exp.length]!, days, minutes, focusPicks: ranked.slice(0, count), scheduleStyle: 'flexible' as const, gym: limited ? equipmentPreset(seed % 2 ? 'hotel' : 'none', 'lb') : equipmentPreset('full', 'lb') };
      const r = generate(input);
      if (!r.ok) continue;
      seen.plans++;
      const report = r.applied.focusReport!;
      const label = `seed ${seed}`;
      const fit = focusFit({ days: days as 3, minutes: minutes as 30 }, report, (a) => { const x = generate({ ...input, days: a.days!, minutes: a.minutes! }); return x.ok ? x.applied.focusReport : undefined; });
      const hard = focusCompared(report);
      const said = /we prioritized ([^.;]+)\./.exec(fit?.line ?? '')?.[1];
      expect(!!said, label).toBe(!!fit?.named);
      if (said) { seen.prioritized++; namesAreTop(report, said, label); expect(said).toBe(focusPrioritized(report)); }
      if (hard.length < 2) expect(fit?.line ?? '', label).not.toContain('prioritized');
      const summary = focusSummary(report, !!fit?.named) ?? '';
      const most = /Most extra work: ([^.]+)\./.exec(summary)?.[1] ?? / so (.+) gets? the most\./.exec(summary)?.[1];
      if (most) { seen.most++; namesAreTop(report, most, label); expect(most.split(/, | and /).length, label).toBe(focusTop(report).length); }
      // A pick ahead of one ranked above it always comes with the reason, naming that higher pick.
      // PLAN 3.6g2: extra that came with a higher pick's work (rides) passes nobody; only a pick that can take no more is ever passed.
      const inverted = hard.filter((h, i) => h.requested > 0 && hard.slice(i + 1).some((l) => l.extra - (l.rides?.extra ?? 0) > h.extra));
      for (const h of inverted) expect(h.state === 'no_move' || h.state === 'plenty' || !!h.atLimit || h.held === 'maxed', `${label}: ${h.id} passed while it could take more`).toBe(true);
      const passed = focusPassed(report);
      // PLAN 3.6g2, said once: a pick this gym has no equipment for is named in the fit line, and the summary gives the other reasons only.
      const told = focusPassed(report, true);
      expect(summary, label).not.toMatch(/equipment you do not have here|of (its|their) own here/);
      if (inverted.length) {
        seen.passed++; expect(passed, label).not.toBeNull();
        if (told) expect(summary, label).toContain(told);
        for (const h of inverted) {
          expect(passed!.split(', so ')[0], label).toContain(focusName(h.id));
          if (h.state === 'no_move' && (h.gear || h.helped)) expect(fit?.line ?? '', label).toContain(focusName(h.id));
          else expect(told!.split(', so ')[0], label).toContain(focusName(h.id));
        }
      }
      // The words after "so" name picks that really got more than a pick passed above them.
      const ahead = / so (.+) gets? (?:extra|more|the most)\./.exec(passed ?? '')?.[1];
      for (const name of ahead?.split(/, | and /) ?? []) {
        const at = hard.findIndex((p) => focusName(p.id) === name);
        expect(hard.slice(0, at).some((h) => h.extra < hard[at]!.extra), `${label}: ${name} is ahead of a pick above it`).toBe(true);
      }
      // The headline names the leaders, all of them (or counts them past three).
      const reason = yourPlanWords(r.applied, { goals: input.goals, days: days as 3, minutes: minutes as 30 }, days).reason;
      const top = focusTop(report);
      if (top.length && top.length <= 3) expect((reason.match(/extra (.+?) work/)?.[1] ?? '').split(/, | and /).length, `${label}: ${reason}`).toBe(top.length);
    }
  });
  it('met every kind of sentence', () => {
    expect(seen.plans).toBeGreaterThan(300);
    // PLAN 3.6g2: the fit line no longer says "we prioritized …" (it names the step with its numbers); who leads is said by the summary, counted under `most`.
    expect(seen.prioritized).toBe(0);
    expect(seen.most).toBeGreaterThan(50);
    expect(seen.passed).toBeGreaterThan(20);
  });
});
