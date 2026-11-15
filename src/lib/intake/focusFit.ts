// The honest line when the extra focus work did not all fit, and the one tap that really fixes it
// (PLAN 3.6f: "4 focus areas fit best with 4 days or 60 min; we prioritized Back and Shoulders").
// A day or minutes is named as the fix only when a rebuild with it places every pick's share and gives
// no pick fewer extra sets than it has now.
//
// ONE TAP NEVER MOVES THE GOALPOSTS (truth pass, critic r3 2 and 11). Whatever is offered is the last
// thing the app asks for: after the tap the rebuilt plan offers nothing more. So the offer is the
// nearest step that places everything, however far ("fit best with 6 days and 45 min"), looked for
// over every larger choice of days and minutes. When none does, the step that adds the most extra
// work without lowering anyone is offered as partial and final ("With 5 days, Upper chest gets
// extra. That is the most that fits."): no larger choice adds more, so nothing is offered after it.
// When nothing helps, one plain sentence says so. Pure.
import { FOCUS_BUDGET_MAX, focusName, focusStateOf, focusUnplaced, stretchBlock, type FocusReport } from '../plan/focus';
import { focusPrioritized } from '../plan/focusPriority';
import { list } from '../words';
import type { IntakeAnswers } from './answers';
import { DAYS, MINUTES, type DaysPerWeek, type Minutes } from './options';

export type FocusFit = {
  line: string;
  /** One tap: rebuild with this many days. Absent when a day more would not fit everything. */
  days?: DaysPerWeek;
  /** One tap: rebuild with these minutes. Absent when more minutes would not fit everything. */
  minutes?: Minutes;
  /** One tap changes the days and the minutes together. */
  both?: true;
  /** How many days the tap adds, when more than one ("Add 2 days"). */
  addDays?: number;
  /** The line says who was prioritized (the picks with the most extra), so the summary under it does not say it again. */
  named?: true;
  /** The step offered does not place everything: it is the one that helps most, and the line says exactly what it does. */
  partial?: true;
};

/** No pick has less than before: extra sets, a stretch block, and never newly without an exercise. */
function lowersNone(now: FocusReport, next: FocusReport): boolean {
  return now.priorities.every((p) => {
    const q = next.priorities.find((x) => x.id === p.id);
    return !!q && q.extra >= p.extra && (q.minutes ?? 0) >= (p.minutes ?? 0) && (focusStateOf(q) !== 'no_move' || focusStateOf(p) === 'no_move');
  });
}

/** The picks that get more with `next` (extra sets, or stretch minutes), in rank order. Empty when it lowers anyone. */
export function helpsFocus(now: FocusReport, next: FocusReport | undefined): FocusReport['priorities'] {
  if (!next || !lowersNone(now, next)) return [];
  return next.priorities.filter((q) => {
    const p = now.priorities.find((x) => x.id === q.id)!;
    // Stretches count as more only when a real stretch block arrives (a minute more of them is not offered as a gain).
    return q.extra > p.extra || (q.id === 'mobility' && stretchBlock(q) && !stretchBlock(p));
  });
}

/**
 * True when `next` (the plan rebuilt with more days or minutes) really fixes `now`: nothing is left
 * unplaced, and no pick has fewer extra sets or stretch minutes than before. `noStretch`: no choice
 * of days and minutes has room for a stretch block, so Mobility is not something a step can fix.
 */
export function fixesFocus(now: FocusReport, next: FocusReport | undefined, noStretch = false): boolean {
  return !!next && !focusUnplaced(next).some((p) => !(noStretch && p.id === 'mobility')) && lowersNone(now, next);
}

type Step = { days?: DaysPerWeek; minutes?: Minutes };
/** Every larger choice of days and minutes, nearest first (fewest steps up; among equals, minutes before days). */
function largerChoices(a: IntakeAnswers): Array<Step & { cost: number }> {
  const days = DAYS.filter((d) => d >= (a.days ?? 3));
  const minutes = a.minutes === undefined ? [undefined] : MINUTES.filter((m) => m >= a.minutes!);
  const out: Array<Step & { cost: number; up: number }> = [];
  for (const [i, d] of days.entries()) for (const [j, m] of minutes.entries()) if (i + j > 0) out.push({ ...(i ? { days: d } : {}), ...(j && m !== undefined ? { minutes: m } : {}), cost: i + j, up: i });
  return out.sort((x, y) => x.cost - y.cost || x.up - y.up);
}
const stepWords = (s: Step, join = ' and '): string => [s.days ? `${s.days} days` : null, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(join);

/**
 * `rebuild` builds the plan for changed answers and returns its focus report (undefined when no plan
 * can be built). Null when every pick got its share.
 */
export function focusFit(a: IntakeAnswers, report: FocusReport | undefined, rebuild: (a: IntakeAnswers) => FocusReport | undefined): FocusFit | null {
  if (!report?.priorities.length) return null;
  const hard = report.priorities.filter((p) => p.id !== 'mobility');
  // The app has no exercise it is sure of for these: said on their own, never blamed on equipment.
  const none = hard.filter((p) => focusStateOf(p) === 'no_move');
  // Past the weekly budget a pick gets no share at all: said, never hidden.
  const unfunded = hard.filter((p) => focusStateOf(p) === 'no_share');
  const built = new Map<string, FocusReport | undefined>();
  const after = (s: Step) => { const k = `${s.days ?? ''}/${s.minutes ?? ''}`; if (!built.has(k)) built.set(k, rebuild({ ...a, ...s })); return built.get(k); };
  const choices = largerChoices(a);
  // Mobility with no stretch block is only part of this when some larger choice has room for one; otherwise its row says so and no step is blamed or offered for it.
  const stretch = report.priorities.find((p) => p.id === 'mobility' && !stretchBlock(p));
  const noStretch = !stretch || !choices.some((s) => after(s)?.priorities.some((q) => q.id === 'mobility' && stretchBlock(q)));
  const unplaced = focusUnplaced(report).filter((p) => !(noStretch && p.id === 'mobility'));
  // PLAN 3.6g: a pick can be under 12 sets a week with its whole share. When some larger choice
  // places everything AND brings every pick to 12, that is the one step named (for the picks that did
  // not fit, and for the ones under 12 alike): after it nothing is left to ask for. When none does,
  // the steps are judged as before, and being under 12 is not something a step is offered for.
  const settles = (s: Step) => { const r = after(s); return fixesFocus(report, r, noStretch) && !r!.priorities.some((q) => (q.under ?? 0) > 0); };
  // Only with one or two picks: from three on it is the weekly budget of 12 extra sets that keeps picks under 12, which no day or minute changes.
  const under = hard.length <= 2 ? hard.filter((p) => (p.under ?? 0) > 0) : [];
  const toFloor = hard.length <= 2 && (unplaced.length > 0 || under.length > 0) && choices.some(settles);
  const fixes = (s: Step) => (toFloor ? settles(s) : fixesFocus(report, after(s), noStretch));
  const lifts = !unplaced.length && toFloor;
  if (!unplaced.length && !unfunded.length && !none.length && !lifts) return null;
  const parts: string[] = [];
  const out: FocusFit = { line: '' };
  if (unplaced.length || lifts) {
    const took = (s: Step) => Object.assign(out, s.days ? { days: s.days } : {}, s.minutes ? { minutes: s.minutes } : {}, s.days && s.minutes ? { both: true as const } : {}, s.days && s.days - (a.days ?? 3) > 1 ? { addDays: s.days - (a.days ?? 3) } : {});
    // One step of days or of minutes that places everything: both are named when either does it.
    const near = choices.filter((s) => s.cost === 1 && fixes(s));
    for (const s of near) Object.assign(out, s.days ? { days: s.days } : { minutes: s.minutes });
    // Otherwise the nearest larger choice that places everything, once.
    const far = near.length ? undefined : choices.find((s) => s.cost > 1 && fixes(s));
    if (far) took(far);
    // Who was put first is read from the numbers (lib/plan/focusPriority.ts), never from the rank alone.
    const top = focusPrioritized(report);
    const n = report.priorities.length;
    const subject = n === 1 ? `${focusName(report.priorities[0]!.id)} fits` : `${n} focus areas fit`;
    if (out.days || out.minutes) {
      parts.push(`${subject} best with ${stepWords(out, out.both ? ' and ' : ' or ')}${top ? `; we prioritized ${top}` : ''}.`);
      if (top) out.named = true;
    } else if (unplaced.length) {
      // Nothing places it all: the choice that adds the most (the most extra sets, a stretch block as one; then the most picks; the nearest of equals), if any adds something and lowers nobody.
      let best: { step: Step; gains: FocusReport['priorities']; sum: number } | null = null;
      for (const step of choices) {
        const gains = helpsFocus(report, after(step));
        const sum = gains.reduce((k, q) => k + q.extra - report.priorities.find((p) => p.id === q.id)!.extra, 0) + gains.filter((q) => q.id === 'mobility').length;
        if (gains.length && (!best || sum > best.sum || (sum === best.sum && gains.length > best.gains.length))) best = { step, gains, sum };
      }
      if (best) {
        took(best.step);
        out.partial = true;
        const names = best.gains.map((q) => focusName(q.id));
        const fresh = best.gains.every((q) => report.priorities.find((p) => p.id === q.id)!.extra === 0 && q.id !== 'mobility');
        const what = best.gains.every((q) => q.id === 'mobility') ? 'gets its stretches' : `${names.length === 1 ? 'gets' : 'get'} ${fresh ? 'extra' : 'more'}`;
        parts.push(`With ${stepWords(best.step)}, ${list(names)} ${what}. That is the most that fits.`);
      } else if (unplaced.every((p) => p.id === 'mobility')) {
        // Only the stretch block is missing and no step brings it without lowering a pick: its row says so.
      } else if (!choices.length) parts.push(`This is all the extra work ${a.days ?? 3} days of ${a.minutes} min can hold.`);
      else {
        const short = unplaced.filter((p) => p.id !== 'mobility');
        // A larger choice that gives one of them more does it by lowering another pick (else it would be offered): said as that.
        const moves = choices.some((s) => after(s)?.priorities.some((q) => short.some((p) => p.id === q.id && q.extra > p.extra)));
        parts.push(moves ? `Another day or more minutes would only move extra work from one pick to another, so ${list(short.map((p) => focusName(p.id)))} ${short.length === 1 ? 'stays' : 'stay'} as ${short.length === 1 ? 'it is' : 'they are'}.` : `Another day or more minutes would not add extra work for ${list(short.map((p) => focusName(p.id)), 'or')}.`);
      }
    }
  }
  if (unfunded.length) parts.push(`Extra work stops at ${FOCUS_BUDGET_MAX} sets a week, so ${list(unfunded.map((p) => focusName(p.id)))} got none.`);
  if (none.length) parts.push(`No exercises for ${list(none.map((p) => focusName(p.id).toLowerCase()), 'or')} yet.`);
  if (!parts.length) return null;
  out.line = parts.join(' ');
  return out;
}
