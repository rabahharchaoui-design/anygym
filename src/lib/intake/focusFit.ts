// The honest line when a pick got less than it should, and the one tap that really helps.
//
// PLAN 3.6g2, UNDER 12 IS SAID. Whenever a pick with an exercise ends under 12 sets a week, the line
// names the step with the real numbers of the rebuilt plan ("Make it 4 days: Side shoulders 6 to
// 12."), and the button carries its value ("Make it 60 min"): never a jump the person did not read.
// A step is only offered when the plan rebuilt with it lowers nobody (no pick with fewer sets, fewer
// extra sets or fewer stretch minutes) and gives the picks it names more. First choice: the nearest
// step after which nothing is left to ask for; then the one that brings the most picks to 12; then
// one that places every pick's share; last the one that adds the most. A pick under 12 that no
// offered step names gets one plain sentence with the true reason from the report (FocusResult.held).
// Pure: the rebuild is passed in.
import { FOCUS_BUDGET_MAX, FOCUS_MUSCLE_MIN, focusName, focusStateOf, focusUnplaced, stretchBlock, type FocusReport, type FocusResult } from '../plan/focus';
import { focusNoMoveWords, focusStayWords } from '../plan/focusWords';
import { list } from '../words';
import type { IntakeAnswers } from './answers';
import { DAYS, MINUTES, type DaysPerWeek, type Minutes } from './options';

export type FocusFit = {
  line: string;
  /** The buttons' words, each with its value: "Make it 4 days", "Make it 60 min", "Make it 5 days and 60 min". */
  labels?: { days?: string; minutes?: string; both?: string };
  /** One tap: rebuild with this many days. Absent when a day more would not fit everything. */
  days?: DaysPerWeek;
  /** One tap: rebuild with these minutes. Absent when more minutes would not fit everything. */
  minutes?: Minutes;
  /** One tap changes the days and the minutes together. */
  both?: true;
  /** How many days the tap adds, when more than one ("Add 2 days"). */
  addDays?: number;
  /** Only in fits made before PLAN 3.6g2: the line said who was prioritized. */
  named?: true;
  /** After the step something is still short or under 12: the line says exactly what the step does. */
  partial?: true;
};

/** No pick has less than before: extra sets, a stretch block, and never newly without an exercise. */
function lowersNone(now: FocusReport, next: FocusReport): boolean {
  return now.priorities.every((p) => {
    const q = next.priorities.find((x) => x.id === p.id);
    return !!q && q.extra >= p.extra && (q.minutes ?? 0) >= (p.minutes ?? 0) && (focusStateOf(q) !== 'no_move' || focusStateOf(p) === 'no_move');
  });
}
/** PLAN 3.6g2: and no pick has fewer sets in all (a bigger choice can give a muscle fewer sets before any extra). */
const keepsAll = (now: FocusReport, next: FocusReport | undefined): next is FocusReport => !!next && lowersNone(now, next) && now.priorities.every((p) => p.id === 'mobility' || next.priorities.find((x) => x.id === p.id)!.total >= p.total);

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
const stepWords = (s: Step): string => [s.days ? `${s.days} days` : null, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(' and ');
/** The button's words: the step with its value, never a bare "Add minutes". */
export const fitLabel = (s: Step): string => `Make it ${stepWords(s)}`;
const under12 = (p: FocusResult) => (p.under ?? 0) > 0;

/**
 * `rebuild` builds the plan for changed answers and returns its focus report (undefined when no plan
 * can be built). Null when every pick got its share and none with an exercise is under 12 sets.
 */
export function focusFit(a: IntakeAnswers, report: FocusReport | undefined, rebuild: (a: IntakeAnswers) => FocusReport | undefined): FocusFit | null {
  if (!report?.priorities.length) return null;
  const hard = report.priorities.filter((p) => p.id !== 'mobility');
  // No exercise for these here: the app has none it is sure of (never blamed on equipment), or this gym has the equipment for none.
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
  const under = hard.filter(under12);
  if (!unplaced.length && !under.length && !unfunded.length && !none.length) return null;
  const parts: string[] = [];
  const out: FocusFit = { line: '' };
  const named = new Set<string>();
  if (unplaced.length || under.length) {
    /** What the picks get with the step, when it lowers nobody: the picks with more sets (or their stretch block), in rank order. */
    const gains = (s: Step) => {
      const r = after(s);
      if (!keepsAll(report, r)) return [];
      return r.priorities.flatMap((q) => {
        const p = report.priorities.find((x) => x.id === q.id)!;
        if (q.id === 'mobility') return stretchBlock(q) && !stretchBlock(p) ? [{ p, q, to12: false }] : [];
        return q.total > p.total ? [{ p, q, to12: under12(p) && !under12(q) }] : [];
      });
    };
    const reach = (s: Step) => gains(s).filter((g) => g.to12).length;
    /** After it nothing is left to ask for: every share placed, every pick with an exercise at 12 or more. */
    const settles = (s: Step) => gains(s).length > 0 && fixesFocus(report, after(s), noStretch) && !after(s)!.priorities.some(under12);
    const places = (s: Step) => gains(s).length > 0 && fixesFocus(report, after(s), noStretch);
    const sum = (s: Step) => gains(s).reduce((k, g) => k + (g.q.id === 'mobility' ? 1 : g.q.total - g.p.total), 0);
    // The nearest step first. One step of days or of minutes that leaves nothing to ask for (both are
    // offered when either does it), else that brings a pick to 12, else that places every share. Then
    // the same over the larger choices, nearest first, and last the choice that adds the most.
    const near = (ok: (s: Step) => boolean) => choices.filter((s) => s.cost === 1 && ok(s));
    const far = (ok: (s: Step) => boolean) => { const s = choices.find((x) => x.cost > 1 && ok(x)); return s ? [s] : []; };
    const reaches = (s: Step) => reach(s) > 0;
    let offered: Step[] = [];
    for (const find of [() => near(settles), () => near(reaches), () => near(places), () => far(settles), () => far(reaches), () => far(places)]) if (!offered.length) offered = find();
    if (!offered.length) { const best = Math.max(0, ...choices.map(sum)); if (best > 0) offered = [choices.find((s) => sum(s) === best)!]; }
    for (const [i, s] of offered.entries()) {
      const said = gains(s).map((g) => { named.add(g.p.id); return g.q.id === 'mobility' ? 'Mobility gets its stretches' : `${focusName(g.p.id)} ${g.p.total} to ${g.q.total}`; });
      parts.push(`${i ? 'Or make' : 'Make'} it ${stepWords(s)}: ${list(said)}.`);
      if (!settles(s)) out.partial = true;
      if (s.days && s.minutes) Object.assign(out, { days: s.days, minutes: s.minutes, both: true as const }, s.days - (a.days ?? 3) > 1 ? { addDays: s.days - (a.days ?? 3) } : {});
      else Object.assign(out, s.days ? { days: s.days } : { minutes: s.minutes }, s.days && s.days - (a.days ?? 3) > 1 ? { addDays: s.days - (a.days ?? 3) } : {});
    }
    if (out.both) out.labels = { both: fitLabel({ days: out.days!, minutes: out.minutes! }) };
    else if (out.days || out.minutes) out.labels = { ...(out.days ? { days: fitLabel({ days: out.days }) } : {}), ...(out.minutes ? { minutes: fitLabel({ minutes: out.minutes }) } : {}) };
    // The picks under 12 (or short of their share) that no offered step names: one plain sentence each kind, with the true reason.
    const stay = focusStayWords(hard.filter((p) => (under.includes(p) || unplaced.includes(p)) && !named.has(p.id)), FOCUS_MUSCLE_MIN);
    if (stay) parts.push(stay);
    else if (!offered.length && unplaced.some((p) => p.id !== 'mobility') && !choices.length) parts.push(`This is all the extra work ${a.days ?? 3} days of ${a.minutes} min can hold.`);
  }
  if (unfunded.length) parts.push(`Extra work stops at ${FOCUS_BUDGET_MAX} sets a week, so ${list(unfunded.map((p) => focusName(p.id)))} got none.`);
  // No exercise here: no exercises yet, equipment this gym lacks, or only helper work (PLAN 3.6g, 3.6g2), each said once.
  const noMove = focusNoMoveWords(none);
  if (noMove) parts.push(noMove);
  if (!parts.length) return null;
  out.line = parts.join(' ');
  return out;
}
