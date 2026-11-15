// PLAN 3.6g2, point 4: one check of a fit line against the plans, shared by the fit tests and the
// 900 plan matrix. What a fit says must be true of the plan as it is and of the plan rebuilt with
// each step it offers.
import { expect } from 'vitest';
import type { FocusFit } from '../intake/focusFit';
import type { DaysPerWeek, Minutes } from '../intake/options';
import { focusName, focusStateOf, focusUnplaced, stretchBlock, type FocusReport } from '../plan/focus';

export type Tap = { days?: DaysPerWeek; minutes?: Minutes };
/** The taps a fit shows: both together, or a day and minutes as two separate buttons. */
export const tapsOf = (fit: FocusFit | null): Tap[] => (!fit ? [] : fit.both ? [{ days: fit.days!, minutes: fit.minutes! }] : [...(fit.days ? [{ days: fit.days }] : []), ...(fit.minutes ? [{ minutes: fit.minutes }] : [])]);
const wordsOf = (t: Tap) => [t.days ? `${t.days} days` : null, t.minutes ? `${t.minutes} min` : null].filter(Boolean).join(' and ');
const WHY = /^(its|their) exercises are at their most sets$|^extra work stops at 12 sets a week$|^(it gets|they get) no more than (.+), ranked above (it|them)$|^(its|their) days are full$/;

/**
 * Holds for every fit: (1) a pick with an exercise that is under 12 sets or short of its share is
 * named in the line; (2) each button says its value and has its own sentence, "Make it 4 days: Side
 * shoulders 6 to 12", whose numbers are the totals of this plan and of the plan rebuilt with that
 * step; (3) that rebuilt plan gives no pick fewer sets, fewer extra sets or fewer stretch minutes;
 * (4) a pick said to stay where it is carries that very reason in the report. Returns the taps.
 */
export function checkFit(now: FocusReport, fit: FocusFit | null, after: (tap: Tap) => FocusReport | undefined, label: string): Tap[] {
  const hard = now.priorities.filter((p) => p.id !== 'mobility');
  const wanting = hard.filter((p) => (p.under ?? 0) > 0 || focusUnplaced(now).includes(p) || focusStateOf(p) === 'no_share');
  if (wanting.some((p) => p.held || focusStateOf(p) === 'no_share')) expect(fit, label).not.toBeNull();
  if (!fit) return [];
  const taps = tapsOf(fit);
  const sentences = [...fit.line.matchAll(/(?:Or make|Make) it ([^:]+): ([^.]+)\./g)].map((m) => ({ step: m[1]!, gains: m[2]! }));
  expect(sentences.map((s) => s.step).sort(), `${label}: ${fit.line}`).toEqual(taps.map(wordsOf).sort());
  // The buttons carry their value: never "Add minutes".
  if (fit.both) expect(fit.labels, label).toEqual({ both: `Make it ${wordsOf(taps[0]!)}` });
  else if (taps.length) expect(fit.labels, label).toEqual({ ...(fit.days ? { days: `Make it ${fit.days} days` } : {}), ...(fit.minutes ? { minutes: `Make it ${fit.minutes} min` } : {}) });
  else expect(fit.labels, label).toBeUndefined();
  const named = new Set<string>();
  for (const tap of taps) {
    const next = after(tap), at = `${label} -> ${JSON.stringify(tap)}`;
    expect(next, at).toBeDefined();
    for (const p of now.priorities) {
      const q = next!.priorities.find((x) => x.id === p.id)!;
      expect(q.extra, `${p.id} extra ${at}`).toBeGreaterThanOrEqual(p.extra);
      expect(q.minutes ?? 0, `${p.id} stretches ${at}`).toBeGreaterThanOrEqual(p.minutes ?? 0);
      if (p.id !== 'mobility') expect(q.total, `${p.id} sets ${at}`).toBeGreaterThanOrEqual(p.total);
    }
    const said = sentences.find((x) => x.step === wordsOf(tap))!.gains.split(/, | and (?=[A-Z])/);
    expect(said.length, at).toBeGreaterThan(0);
    for (const g of said) {
      if (g === 'Mobility gets its stretches') { expect(stretchBlock(next!.priorities.find((p) => p.id === 'mobility')!) && !stretchBlock(now.priorities.find((p) => p.id === 'mobility')!), at).toBe(true); continue; }
      const m = /^(.+) (\d+) to (\d+)$/.exec(g);
      expect(m, `${g} ${at}`).not.toBeNull();
      const p = hard.find((x) => focusName(x.id) === m![1]);
      expect(p, `${g} ${at}`).toBeDefined();
      named.add(p!.id);
      expect(Number(m![2]), `${g} now ${at}`).toBe(p!.total);
      expect(Number(m![3]), `${g} after ${at}`).toBe(next!.priorities.find((x) => x.id === p!.id)!.total);
      expect(Number(m![3])).toBeGreaterThan(Number(m![2]));
    }
  }
  // The plain sentences: each pick named carries that reason, and is where the sentence says.
  for (const m of fit.line.matchAll(/(?<=^|\. )([A-Z][^.:]*?) (stays?|gets?) (under 12 sets|no extra|no more): ([^.]+)\./g)) {
    expect(m[4]!, `${label}: ${fit.line}`).toMatch(WHY);
    for (const name of m[1]!.split(/, | and /)) {
      const p = hard.find((x) => focusName(x.id) === name);
      expect(p, `${name} in ${fit.line} ${label}`).toBeDefined();
      named.add(p!.id);
      expect(p!.held === 'maxed' ? /exercises are at their most sets/ : p!.held === 'budget' ? /extra work stops/ : p!.held === 'rank' ? new RegExp(`no more than ${focusName(p!.heldBy!)},`) : /days are full/, `${name} ${label}`).toSatisfy((re: RegExp) => re.test(m[4]!));
      if (m[3] === 'under 12 sets') expect(p!.under ?? 0, `${name} ${label}`).toBeGreaterThan(0);
      else { expect(p!.under ?? 0, `${name} ${label}`).toBe(0); expect(p!.extra > 0, `${name} ${label}`).toBe(m[3] === 'no more'); }
    }
  }
  for (const m of fit.line.matchAll(/so ([^.]+) got none\./g)) for (const name of m[1]!.split(/, | and /)) named.add(hard.find((x) => focusName(x.id) === name)?.id ?? '');
  // (1) Nobody under 12 or short is passed over in silence (a pick with no reason on record is one a report saved before PLAN 3.6g2 has; the generator always gives one).
  for (const p of wanting) expect(named.has(p.id), `${p.id} is under 12 or short and not named: ${fit.line} ${label}`).toBe(true);
  return taps;
}
