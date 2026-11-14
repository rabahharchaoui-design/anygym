// The honest line when the extra focus work did not all fit, and the one tap that really fixes it
// (PLAN 3.6f: "4 focus areas fit best with 4 days or 60 min; we prioritized Back and Shoulders").
// A day or minutes is only named, and only offered, when a rebuild with it places every pick's share
// and gives no pick fewer extra sets than it has now. Otherwise the plain truth, with no button. Pure.
import { FOCUS_BUDGET_MAX, focusName, focusStateOf, focusUnplaced, type FocusReport } from '../plan/focus';
import { list } from '../words';
import type { IntakeAnswers } from './answers';
import { DAYS, MINUTES, type DaysPerWeek, type Minutes } from './options';

export type FocusFit = {
  line: string;
  /** One tap: rebuild with this many days. Absent when a day more would not fit everything. */
  days?: DaysPerWeek;
  /** One tap: rebuild with these minutes. Absent when more minutes would not fit everything. */
  minutes?: Minutes;
  /** Neither alone fits everything, both together do: one tap adds the day and the minutes. */
  both?: true;
};

/**
 * True when `next` (the plan rebuilt with a day or minutes more) really fixes `now`: nothing is left
 * unplaced, and no pick has fewer extra sets or stretch minutes than before.
 */
export function fixesFocus(now: FocusReport, next: FocusReport | undefined): boolean {
  if (!next || focusUnplaced(next).length) return false;
  return now.priorities.every((p) => {
    const q = next.priorities.find((x) => x.id === p.id);
    return !!q && q.extra >= p.extra && (q.minutes ?? 0) >= (p.minutes ?? 0) && (focusStateOf(q) !== 'no_move' || focusStateOf(p) === 'no_move');
  });
}

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
  const unplaced = focusUnplaced(report);
  if (!unplaced.length && !unfunded.length && !none.length) return null;
  const parts: string[] = [];
  const out: FocusFit = { line: '' };
  if (unplaced.length) {
    const moreDays = DAYS.find((d) => d > (a.days ?? 3));
    const moreMinutes = a.minutes === undefined ? undefined : MINUTES.find((m) => m > a.minutes!);
    if (moreDays && fixesFocus(report, rebuild({ ...a, days: moreDays }))) out.days = moreDays;
    if (moreMinutes && fixesFocus(report, rebuild({ ...a, minutes: moreMinutes }))) out.minutes = moreMinutes;
    // No single step does it: the combined step, once.
    if (!out.days && !out.minutes && moreDays && moreMinutes && fixesFocus(report, rebuild({ ...a, days: moreDays, minutes: moreMinutes }))) Object.assign(out, { days: moreDays, minutes: moreMinutes, both: true as const });
    const served = report.priorities.filter((p) => p.extra > 0).slice(0, 2).map((p) => focusName(p.id));
    const n = report.priorities.length;
    const more = [out.days ? `${out.days} days` : null, out.minutes ? `${out.minutes} min` : null].filter((x): x is string => !!x);
    if (more.length) parts.push(`${n} focus ${n === 1 ? 'area fits' : 'areas fit'} best with ${more.join(out.both ? ' and ' : ' or ')}${served.length ? `; we prioritized ${list(served)}` : ''}.`);
    else if (served.length) parts.push(`We fit what we could: ${list(served)} first.`);
    else if (unplaced.every((p) => p.id === 'mobility')) parts.push('Your sessions are too short for stretches.');
    else parts.push('No extra work fits these days and minutes yet.');
  }
  if (unfunded.length) parts.push(`Extra work stops at ${FOCUS_BUDGET_MAX} sets a week, so ${list(unfunded.map((p) => focusName(p.id)))} got none.`);
  if (none.length) parts.push(`No exercises for ${list(none.map((p) => focusName(p.id).toLowerCase()), 'or')} yet.`);
  out.line = parts.join(' ');
  return out;
}
