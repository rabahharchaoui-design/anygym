// The honest line when the extra focus work did not all fit, and the one tap that really fixes it
// (PLAN 3.6f: "4 focus areas fit best with 4 days or 60 min; we prioritized Back and Shoulders").
// A day or minutes is named as the fix only when a rebuild with it places every pick's share and gives
// no pick fewer extra sets than it has now. When no step does that, the step that helps most is
// offered if it helps anyone without lowering anyone, worded as exactly what it does ("With 45 min,
// Upper chest and Side shoulders get extra"). When nothing helps, one plain sentence says so. Pure.
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
  /** The step offered does not place everything: it is the one that helps most, and the line says exactly what it does. */
  partial?: true;
};

/**
 * No pick has less than before (extra sets, stretch minutes, and never newly without an exercise).
 * Sets a pick holds past its own share are a bonus from room nobody else could use, not a promise:
 * keeping its whole share is not "less".
 */
function lowersNone(now: FocusReport, next: FocusReport): boolean {
  return now.priorities.every((p) => {
    const q = next.priorities.find((x) => x.id === p.id);
    return !!q && q.extra >= Math.min(p.extra, Math.max(p.requested, 1)) && (q.minutes ?? 0) >= (p.minutes ?? 0) && (focusStateOf(q) !== 'no_move' || focusStateOf(p) === 'no_move');
  });
}

/** The picks that get more with `next` (extra sets, or stretch minutes), in rank order. Empty when it lowers anyone. */
export function helpsFocus(now: FocusReport, next: FocusReport | undefined): FocusReport['priorities'] {
  if (!next || !lowersNone(now, next)) return [];
  return next.priorities.filter((q) => {
    const p = now.priorities.find((x) => x.id === q.id)!;
    return q.extra > p.extra || (q.minutes ?? 0) > (p.minutes ?? 0);
  });
}

/**
 * True when `next` (the plan rebuilt with a day or minutes more) really fixes `now`: nothing is left
 * unplaced, and no pick has fewer extra sets or stretch minutes than before.
 */
export function fixesFocus(now: FocusReport, next: FocusReport | undefined): boolean {
  return !!next && !focusUnplaced(next).length && lowersNone(now, next);
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
    else {
      // Nothing places it all: the step that helps most (the most extra sets gained, then the most picks; minutes before a day before both), if any helps.
      const steps: Array<Pick<FocusFit, 'days' | 'minutes'>> = [...(moreMinutes ? [{ minutes: moreMinutes }] : []), ...(moreDays ? [{ days: moreDays }] : []), ...(moreDays && moreMinutes ? [{ days: moreDays, minutes: moreMinutes }] : [])];
      let best: { step: Pick<FocusFit, 'days' | 'minutes'>; gains: FocusReport['priorities']; sum: number } | null = null;
      for (const step of steps) {
        const next = rebuild({ ...a, ...step });
        const gains = helpsFocus(report, next);
        const sum = gains.reduce((k, q) => k + q.extra - report.priorities.find((p) => p.id === q.id)!.extra, 0) + gains.filter((q) => q.id === 'mobility').length;
        if (gains.length && (!best || sum > best.sum || (sum === best.sum && gains.length > best.gains.length))) best = { step, gains, sum };
      }
      if (best) {
        Object.assign(out, best.step, { partial: true as const }, best.step.days && best.step.minutes ? { both: true as const } : {});
        const names = best.gains.map((q) => focusName(q.id));
        const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : list(names);
        const fresh = best.gains.every((q) => report.priorities.find((p) => p.id === q.id)!.extra === 0 && q.id !== 'mobility');
        const what = best.gains.every((q) => q.id === 'mobility') ? 'gets its stretches' : `${names.length === 1 ? 'gets' : 'get'} ${fresh ? 'extra' : 'more'}`;
        parts.push(`With ${[best.step.days ? `${best.step.days} days` : null, best.step.minutes ? `${best.step.minutes} min` : null].filter(Boolean).join(' and ')}, ${who} ${what}.`);
      } else if (unplaced.every((p) => p.id === 'mobility')) parts.push('Your sessions are too short for stretches.');
      else if (!steps.length) parts.push(`This is all the extra work ${a.days ?? 3} days of ${a.minutes} min can hold.`);
      else parts.push(`Another day or more minutes would not add extra work for ${list(unplaced.filter((p) => p.id !== 'mobility').map((p) => focusName(p.id)), 'or')}.`);
    }
  }
  if (unfunded.length) parts.push(`Extra work stops at ${FOCUS_BUDGET_MAX} sets a week, so ${list(unfunded.map((p) => focusName(p.id)))} got none.`);
  if (none.length) parts.push(`No exercises for ${list(none.map((p) => focusName(p.id).toLowerCase()), 'or')} yet.`);
  out.line = parts.join(' ');
  return out;
}
