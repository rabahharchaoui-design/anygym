// PLAN 3.6f truth pass, point 1 (third critique, items 1 and 10): the rank and the words about it.
// The critic's two plans are rebuilt through the real generator; what is proved is why a lower pick
// came out ahead, and that every sentence about priority follows the final numbers.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { profileFor } from '../../data/order';
import { equipmentPreset } from '../../db/gyms';
import { focusFit } from '../intake/focusFit';
import type { IntakeAnswers } from '../intake/funnel';
import type { ExperienceId, FocusPickId, GoalId } from '../intake/options';
import { generatorInputOf, yourPlanWords } from '../intake/yourPlan';
import { focusMuscles, focusName, type FocusReport } from '../plan/focus';
import { focusCompared, focusPassed, focusPrioritized, focusSummary, focusTop } from '../plan/focusPriority';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 1239 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
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

/** The muscles each day's lifts tire: what the 48 hour rule reads. */
const footprints = (plan: ReturnType<typeof reveal>['plan']) => plan.days.map((d) => new Set(d.blocks.filter((b) => !b.warmup).flatMap((b) => b.items).flatMap((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' ? p.targets : []; })));
/**
 * Why `higher` could not use the room `lower` took: on every day where `lower` gained, the muscles
 * of `higher` are not trained that day and are trained on a day next to it (new work there would
 * break the 48 hour rule); and every day that does train them is already at the minutes chosen.
 */
function couldNotUse(x: ReturnType<typeof reveal>, minutes: number, higher: FocusPickId, lower: FocusPickId) {
  const prints = footprints(x.plan);
  const n = prints.length;
  const muscles = focusMuscles([higher]);
  const gained = x.report.dayExtra!.map((d) => d.some((e) => e.id === lower && e.extra > 0));
  expect(gained.some(Boolean), `${lower} gained somewhere`).toBe(true);
  for (const [i, on] of gained.entries()) {
    if (!on) continue;
    for (const m of muscles) {
      expect(prints[i]!.has(m), `day ${i + 1} trains ${m}`).toBe(false);
      expect(prints[(i + 1) % n]!.has(m) || prints[(i + n - 1) % n]!.has(m), `a day next to day ${i + 1} trains ${m}`).toBe(true);
    }
  }
  const own = prints.map((p, i) => (muscles.some((m) => p.has(m)) ? i : -1)).filter((i) => i >= 0);
  expect(own.length).toBeGreaterThan(0);
  for (const i of own) expect(x.r.applied.minutes[i]!, `day ${i + 1} is full`).toBeGreaterThanOrEqual(minutes - 1);
}

describe('critic 1: a lower pick only comes out ahead when the higher one could not use that room', () => {
  // PLAN 3.6g: every pick gets to +2 before any pick goes past it, so on these full 45 min days the room is shared down the rank (Side shoulders is no longer left out), and it still runs out before Biceps and Upper chest.
  it('Lats, Side shoulders, Biceps, Upper chest, Glutes at 4 days, 45 min: Glutes (#5) is ahead of Biceps (#3) and Upper chest (#4) for the 48 hour rule, and the words say so', () => {
    const x = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts', 'biceps', 'upper_chest', 'glutes'] });
    expect(extras(x.report)).toEqual({ lats: 2, side_delts: 2, biceps: 0, upper_chest: 0, glutes: 2 });
    // The room Glutes took is on a lower body day, between two days that train the arms and chest.
    for (const higher of ['biceps', 'upper_chest'] as const) couldNotUse(x, 45, higher, 'glutes');
    // The words: exactly the picks tied for the most are "prioritized", and the reason Glutes is ahead is said.
    expect(x.fit!.line).toBe('5 focus areas fit best with 5 days or 60 min; we prioritized Lats, Side shoulders and Glutes.');
    expect(x.summary).toBe('Biceps and Upper chest have no more room on their days, so Glutes gets extra.');
    expect(x.reason).toContain('extra lats, side shoulders and glute work');
  });
  it('Upper chest, Lats, Side shoulders, Quads, Biceps at 4 days, 45 min: Quads (#4) is ahead of Side shoulders (#3) for the same reason, and Lats (#2) is no longer behind it', () => {
    const x = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['upper_chest', 'lats', 'side_delts', 'quads', 'biceps'] });
    expect(extras(x.report)).toEqual({ upper_chest: 2, lats: 2, side_delts: 0, quads: 2, biceps: 0 });
    couldNotUse(x, 45, 'side_delts', 'quads');
    expect(x.fit!.line).toBe('5 focus areas fit best with 5 days or 60 min; we prioritized Upper chest, Lats and Quads.');
    expect(x.summary).toBe('Side shoulders has no more room on its days, so Quads gets extra.');
    expect(x.reason).toContain('extra upper chest, lats and quads work');
  });
  it('served alone on the same days, the higher pick gets no more: the room was never given away out of order', () => {
    // With Glutes taken out of the list, Biceps and Upper chest still get nothing, and Lats and Side shoulders the same: Glutes took nothing from them.
    const without = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['lats', 'side_delts', 'biceps', 'upper_chest'] });
    expect(extras(without.report)).toEqual({ lats: 2, side_delts: 2, biceps: 0, upper_chest: 0 });
    const noQuads = reveal({ ...base, days: 4, minutes: 45, focusPicks: ['upper_chest', 'lats', 'side_delts', 'biceps'] });
    expect(extras(noQuads.report).lats).toBeLessThanOrEqual(2);
    expect(extras(noQuads.report).side_delts).toBe(0);
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
      const inverted = hard.filter((h, i) => h.requested > 0 && hard.slice(i + 1).some((l) => l.extra > h.extra));
      const passed = focusPassed(report);
      if (inverted.length) { seen.passed++; expect(passed, label).not.toBeNull(); expect(summary, label).toContain(passed!); for (const h of inverted) expect(passed!.split(', so ')[0], label).toContain(focusName(h.id)); }
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
    expect(seen.prioritized).toBeGreaterThan(20);
    expect(seen.most).toBeGreaterThan(50);
    expect(seen.passed).toBeGreaterThan(20);
  });
});
