// PLAN 3.6f: what the plan says about each focus pick, the way a coach would say it in one short
// line. Words only: every number is data from the focus report ({ total, extra, period }, the state,
// the parts, what a day adds). One meaning each: "sets" is the total, "extra" is the extra. Pure.
import type { ScheduleStyle } from '../intake/options';
import { cap, list, plural } from '../words';
import type { FocusPickId } from '../intake/options';
import { focusName, focusStateOf, type FocusDayExtra, type FocusResult } from './focus';
import { focusCovered } from './focusPriority';

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
/** "your back and rear shoulder work": the picks a goal rides on, as the kind of work they are. */
const WORK: Partial<Record<FocusPickId, string>> = { back: 'back', lats: 'lat', upper_back: 'upper back', lower_back: 'lower back', shoulders: 'shoulder', rear_delts: 'rear shoulder', arms: 'arm', forearms: 'forearm' };
const workOf = (ids: readonly FocusPickId[]): string => list(ids.map((id) => WORK[id] ?? focusName(id).toLowerCase()));

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
  if (p.total === 0) return [name, 'no room for it'];
  const amount = p.id === 'posture' ? `${plural(p.total, 'set', 'sets')} of back and rear shoulder work`
    : p.parts && p.parts.length > 1 ? `${list(p.parts.map((x) => `${PART[x.muscle] ?? x.muscle} ${x.sets}`))} sets`
    : plural(p.total, 'set', 'sets');
  // Every one of its sets is already shown under another pick: said in words, never as a second number (focusShare.ts).
  if (focusCovered(p)) return [name, `covered by your ${workOf(p.coveredBy!)} work, ${plural(p.total, 'set', 'sets')} ${period}`];
  const extra = p.extra <= 0 ? '' : p.extra >= p.total ? ', all of them extra' : `, ${p.extra} of them extra`;
  // "Plenty" and "extra" are never said together: a pick that got some and then reached the limit has "as much as is useful".
  const tail = state !== 'plenty' ? (p.extra <= 0 ? ', no room for extra' : '') : p.extra > 0 ? ', as much as is useful' : WIDER[p.id] ? `, your ${WIDER[p.id]} already has plenty` : ', already plenty';
  return [name, `${amount} ${period}${extra}${tail}`];
}

/** The caption over the reveal's rows: the period is said once, never on every row. */
export const focusCaption = (period: string): string => `Sets ${period}`;

export type FocusRow = {
  name: string;
  /** "18 sets", "6 min". Null for an area of several muscles (its muscles are in the detail) and for a pick that got nothing. */
  amount: string | null;
  /** The quiet state: "+6 extra", "plenty", "no extra", "no room", "no exercises yet". Null when the amount says it all. */
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
  if (p.id === 'mobility') return (p.minutes ?? 0) > 0 ? { name, amount: minutes(p.minutes!), tag: null, detail: 'Stretches' } : { name, amount: null, tag: 'no room', detail: 'Your sessions are too short for stretches' };
  const state = focusStateOf(p);
  if (state === 'no_move') return { name, amount: null, tag: 'no exercises yet', detail: null };
  if (p.total === 0) return { name, amount: null, tag: 'no room', detail: null };
  if (focusCovered(p)) return { name, amount: null, tag: null, detail: `Covered by your ${workOf(p.coveredBy!)} work: ${plural(p.total, 'set', 'sets')}` };
  const several = !!p.parts && p.parts.length > 1;
  const tag = p.extra > 0 ? `+${p.extra} extra` : state === 'plenty' ? 'plenty' : 'no extra';
  const more = [
    p.id === 'posture' ? 'Back and rear shoulder work' : several ? p.parts!.map((x) => `${cap(PART[x.muscle] ?? x.muscle)} ${x.sets}`).join(' · ') : null,
    // Some of its sets are shown under another pick too: said, so the same sets are never read as two lots.
    p.shared && p.coveredBy?.length ? `${p.shared} of them also count for ${list(p.coveredBy.map(focusName))}` : null,
    // Never "+2 extra" beside "plenty": a pick that got some and then reached the limit has as much as is useful.
    state !== 'plenty' ? null : p.extra > 0 ? 'As much as is useful now' : WIDER[p.id] ? `Your ${WIDER[p.id]} already has plenty` : null,
  ].filter((x): x is string => !!x);
  return { name, amount: several ? null : plural(p.total, 'set', 'sets'), tag, detail: more.length ? more.join(' · ') : null };
}

/** The reveal's rows: the picks that got extra first, then the rest, and "no exercises yet" last. Rank order inside each. */
export function focusRowOrder(priorities: readonly FocusResult[]): FocusResult[] {
  const group = (p: FocusResult) => (focusStateOf(p) === 'no_move' ? 2 : p.extra > 0 || (p.minutes ?? 0) > 0 ? 0 : 1);
  return [0, 1, 2].flatMap((g) => priorities.filter((p) => group(p) === g));
}

/**
 * A day card's why, from the report's own data: the pick the day's first lift trains ("Upper chest
 * first today"), and what the day adds, up to two picks by rank and then "and more" ("Extra today:
 * 2 sets for lats, 1 for biceps and more"). Null when the day does neither.
 */
export function focusDayLine(extras: readonly FocusDayExtra[] | undefined, lead?: FocusPickId | null): string | null {
  const adds = (extras ?? []).filter((x) => x.extra > 0 || (x.minutes ?? 0) > 0);
  const two = adds.slice(0, 2);
  const firstSets = two.findIndex((x) => x.id !== 'mobility');
  const said = two.map((x, i) => {
    if (x.id === 'mobility') return `${minutes(x.minutes!)} of stretches`;
    const name = focusName(x.id).toLowerCase();
    return i === firstSets ? `${plural(x.extra, 'set', 'sets')} for ${name}` : `${x.extra} for ${name}`;
  });
  const first = lead ? `${focusName(lead)} first today` : null;
  const extra = !two.length ? null : `${first ? 'Extra' : 'Extra today'}: ${adds.length > 2 ? `${said.join(', ')} and more` : list(said)}`;
  return first && extra ? `${first}. ${extra}` : first ?? extra;
}

/** Before the plan exists nothing is promised: the rank row and the rank sheet say what the plan will try. */
export const FOCUS_RANK_INTENT = 'We add extra where it fits, starting from the top.';

/**
 * The rank row's prompt counts what is ranked. Mobility is stretch time, never hard sets, so it has
 * no place in the order: when it is picked, the row says so instead of quietly leaving it out.
 */
export function focusRankWords(ranked: number, mobility: boolean): { prompt: string; note: string | null } {
  return { prompt: `Rank your ${ranked} picks`, note: mobility ? 'Mobility is stretch time, so it is not ranked.' : null };
}
