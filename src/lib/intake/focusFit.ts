// The honest line when the extra focus work did not all fit, and the one tap that really helps
// (PLAN 3.6f: "4 focus areas fit best with 4 days or 60 min; we prioritized Back and Shoulders").
// A day or minutes is only offered when a rebuild with it places more of the extra sets. Pure.
import { FOCUS_BUDGET_MAX, focusLabel, focusUnplaced, type FocusReport } from '../plan/focus';
import type { IntakeAnswers } from './answers';
import { DAYS, MINUTES, type DaysPerWeek, type FocusPickId, type Minutes } from './options';
import { list } from './yourPlan';

export type FocusFit = {
  line: string;
  /** One tap: rebuild with this many days. Absent when a day more would not help. */
  days?: DaysPerWeek;
  /** One tap: rebuild with these minutes. Absent when more minutes would not help. */
  minutes?: Minutes;
};

/** How much asked for work is still missing: sets, and one for stretches that did not fit. */
const missing = (r: FocusReport | undefined): number => (r ? focusUnplaced(r).reduce((n, p) => n + (p.id === 'mobility' ? 1 : p.requested - p.extra), 0) : Infinity);

/**
 * `rebuild` builds the plan for changed answers and returns its focus report (undefined when no plan
 * can be built). Null when every pick got its share.
 */
export function focusFit(a: IntakeAnswers, report: FocusReport | undefined, rebuild: (a: IntakeAnswers) => FocusReport | undefined): FocusFit | null {
  if (!report?.priorities.length) return null;
  const name = (p: { id: FocusPickId }) => focusLabel(p.id);
  const hard = report.priorities.filter((p) => p.id !== 'mobility');
  // No move the app is sure of trains it with this equipment: said plainly, never padded.
  const none = hard.filter((p) => p.noMove);
  const unplaced = focusUnplaced(report);
  // Past the weekly budget a pick gets no share at all: said, never hidden.
  const unfunded = hard.filter((p) => p.requested === 0 && !p.noMove);
  if (!unplaced.length && !unfunded.length && !none.length) return null;
  const served = report.priorities.filter((p) => p.extra > 0).slice(0, 2).map(name);
  const first = served.length ? `; we prioritized ${list(served)}` : '';
  const parts: string[] = [];
  const out: FocusFit = { line: '' };
  if (unplaced.length) {
    const now = missing(report);
    const moreDays = DAYS.find((d) => d > (a.days ?? 3));
    const moreMinutes = a.minutes === undefined ? undefined : MINUTES.find((m) => m > a.minutes!);
    if (moreDays && missing(rebuild({ ...a, days: moreDays })) < now) out.days = moreDays;
    if (moreMinutes && missing(rebuild({ ...a, minutes: moreMinutes })) < now) out.minutes = moreMinutes;
    const n = report.priorities.length;
    const more = [out.days ? `${out.days} days` : null, out.minutes ? `${out.minutes} min` : null].filter((x): x is string => !!x);
    const head = more.length
      ? `${n} focus ${n === 1 ? 'area fits' : 'areas fit'} best with ${more.join(' or ')}`
      : `Not all the extra ${list(unplaced.map((p) => name(p).toLowerCase()))} work fits here`;
    parts.push(`${head}${first}.`);
  }
  if (unfunded.length) parts.push(`Extra work stops at ${FOCUS_BUDGET_MAX} sets a week, so ${list(unfunded.map(name))} got none${unplaced.length ? '' : first}.`);
  if (none.length) parts.push(`Nothing sure for ${list(none.map((p) => name(p).toLowerCase()))} with your equipment yet.`);
  out.line = parts.join(' ');
  return out;
}
