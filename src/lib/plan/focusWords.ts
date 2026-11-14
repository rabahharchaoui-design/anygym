// PLAN 3.6f: what the plan says about each focus pick, the way a coach would say it in one short
// line. Words only: every number is data from the focus report ({ total, extra, period }, the state,
// the parts, what a day adds). One meaning each: "sets" is the total, "extra" is the extra. Pure.
import type { ScheduleStyle } from '../intake/options';
import { cap, list, plural } from '../words';
import { focusName, focusStateOf, type FocusDayExtra, type FocusResult } from './focus';

/**
 * How often the sets come round. A calendar plan (same days, or days picked each week) counts "a
 * week"; a flexible rotation has no week to promise, so it counts its own workouts.
 */
export const focusPeriod = (style: ScheduleStyle | undefined, workouts: number): string => (style === 'fixed' || style === 'weekly' ? 'a week' : `every ${workouts} workouts`);

/** A muscle of an area, as the line names it. */
const PART: Record<string, string> = { back: 'lats and upper back', 'front delts': 'front shoulders', 'side delts': 'side shoulders', 'rear delts': 'rear shoulders' };
/** A part of a wider muscle: when that muscle is at the limit, the line says which. */
const WIDER: Partial<Record<string, string>> = { upper_chest: 'chest', lats: 'back', upper_back: 'back' };
const minutes = (n: number): string => `${Math.round(n)} min`;

/**
 * One line for one pick: [what, how much]. "Back: 18 sets a week, 6 of them extra", "…, already
 * plenty", "no exercises for it yet". An area of several muscles says each muscle's own count (the
 * measure the 20 set limit uses). A pick that got nothing is never a zero: it says what is true.
 */
export function focusLine(p: FocusResult, period: string): [string, string] {
  const name = focusName(p.id);
  if (p.id === 'mobility') return (p.minutes ?? 0) > 0 ? [name, `${minutes(p.minutes!)} of stretches ${period}`] : [name, 'your sessions are too short for stretches'];
  const state = focusStateOf(p);
  if (state === 'no_move') return [name, 'no exercises for it yet'];
  if (p.total === 0) return [name, 'no room for it yet'];
  const amount = p.id === 'posture' ? `${plural(p.total, 'set', 'sets')} of back and rear shoulder work`
    : p.parts && p.parts.length > 1 ? `${list(p.parts.map((x) => `${PART[x.muscle] ?? x.muscle} ${x.sets}`))} sets`
    : plural(p.total, 'set', 'sets');
  const extra = p.extra <= 0 ? '' : p.extra >= p.total ? ', all of them extra' : `, ${p.extra} of them extra`;
  const tail = state === 'plenty' ? (WIDER[p.id] ? `, your ${WIDER[p.id]} already has plenty` : ', already plenty') : p.extra <= 0 ? ', no room for extra yet' : '';
  return [name, `${amount} ${period}${extra}${tail}`];
}

/** The caption over the reveal's rows: the period is said once, never on every row. */
export const focusCaption = (period: string): string => `Sets ${period}`;

export type FocusRow = {
  name: string;
  /** "18 sets", "6 min". Null for an area of several muscles (its muscles are in the detail) and for a pick that got nothing. */
  amount: string | null;
  /** The quiet state: "+6 extra", "plenty", "no extra yet", "no room yet", "no exercises yet". Null when the amount says it all. */
  tag: string | null;
  /** One more quiet line when there is more to say (an area's muscles, what posture work is). */
  detail: string | null;
};

/**
 * The same facts as focusLine, in pieces a row can lay out for a glance: the name, its number, a
 * quiet state, and one more line only when there is more to say. The period is in focusCaption.
 */
export function focusRow(p: FocusResult): FocusRow {
  const name = focusName(p.id);
  if (p.id === 'mobility') return (p.minutes ?? 0) > 0 ? { name, amount: minutes(p.minutes!), tag: null, detail: 'Stretches' } : { name, amount: null, tag: 'no room yet', detail: 'Your sessions are too short for stretches' };
  const state = focusStateOf(p);
  if (state === 'no_move') return { name, amount: null, tag: 'no exercises yet', detail: null };
  if (p.total === 0) return { name, amount: null, tag: 'no room yet', detail: null };
  const several = !!p.parts && p.parts.length > 1;
  const tag = p.extra > 0 ? `+${p.extra} extra` : state === 'plenty' ? 'plenty' : 'no extra yet';
  const more = [
    p.id === 'posture' ? 'Back and rear shoulder work' : several ? p.parts!.map((x) => `${cap(PART[x.muscle] ?? x.muscle)} ${x.sets}`).join(' · ') : null,
    state !== 'plenty' ? null : WIDER[p.id] ? `Your ${WIDER[p.id]} already has plenty` : p.extra > 0 ? 'Already plenty' : null,
  ].filter((x): x is string => !!x);
  return { name, amount: several ? null : plural(p.total, 'set', 'sets'), tag, detail: more.length ? more.join(' · ') : null };
}

/**
 * A day card's why: what this day adds for the person's picks, up to two, in their order. "Extra
 * today: 2 sets for upper chest and 2 for side shoulders". Null when the day adds nothing.
 */
export function focusDayLine(extras: readonly FocusDayExtra[] | undefined): string | null {
  const two = (extras ?? []).filter((x) => x.extra > 0 || (x.minutes ?? 0) > 0).slice(0, 2);
  if (!two.length) return null;
  const firstSets = two.findIndex((x) => x.id !== 'mobility');
  const said = two.map((x, i) => {
    if (x.id === 'mobility') return `${minutes(x.minutes!)} of stretches`;
    const name = focusName(x.id).toLowerCase();
    return i === firstSets ? `${plural(x.extra, 'set', 'sets')} for ${name}` : `${x.extra} for ${name}`;
  });
  return `Extra today: ${list(said)}`;
}
