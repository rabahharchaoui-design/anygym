// PLAN 3.6f truth pass: every sentence about priority is composed from the plan's final numbers,
// never from the rank the person gave or a promise made before the plan existed. One rule for all
// of them: a pick is only named as "prioritized" or "most" when no pick left unnamed got more. Pure.
import { list } from '../words';
import { focusName, focusStateOf, type FocusReport, type FocusResult } from './focus';

type Priorities = Pick<FocusReport, 'priorities'>;

/** A goal whose every set is shown under other picks of the list (lib/plan/focusShare.ts): it has no number of its own to compare. */
export const focusCovered = (p: FocusResult): boolean => !!p.coveredBy?.length && p.shared !== undefined && p.shared >= p.total && p.total > 0;

/** The picks that are compared: ranked for hard sets, each with its own number. In rank order. */
export const focusCompared = (report: Priorities): FocusResult[] => report.priorities.filter((p) => p.id !== 'mobility' && !focusCovered(p));

/** The picks tied for the most extra sets, in rank order. Empty when no pick got any. */
export function focusTop(report: Priorities): FocusResult[] {
  const hard = focusCompared(report);
  const best = Math.max(0, ...hard.map((p) => p.extra));
  return best === 0 ? [] : hard.filter((p) => p.extra === best);
}

/** "Lats", "Lats and Biceps", "Lats, Biceps and Glutes": every name, never "and 2 more" (a name left out could be read as a pick left out). */
const names = (ps: readonly FocusResult[]): string => list(ps.map((p) => focusName(p.id)));

/**
 * Who the plan put first, for "we prioritized …": exactly the picks tied for the most extra. Null
 * when that says nothing: one pick alone, no pick with extra, or every pick with the same.
 */
export function focusPrioritized(report: Priorities): string | null {
  const hard = focusCompared(report);
  const top = focusTop(report);
  return top.length && top.length < hard.length ? names(top) : null;
}

type Why = 'plenty' | 'no_move' | 'gear' | 'share' | 'room';
/** Why a pick got less than one ranked below it. A pick past the weekly budget is said in its own sentence (focusFit), never here. */
function whyOf(p: FocusResult): Why | null {
  const state = focusStateOf(p);
  if (state === 'no_share') return null;
  if (state === 'no_move') return p.gear ? 'gear' : state;
  if (state === 'plenty') return state;
  return p.requested > 0 && p.extra >= p.requested ? 'share' : 'room';
}
const WHY: Record<Why, (many: boolean) => string> = {
  plenty: (many) => (many ? 'already get plenty' : 'already gets plenty'),
  no_move: (many) => (many ? 'have no exercises yet' : 'has no exercises yet'),
  gear: (many) => (many ? 'need equipment you do not have here' : 'needs equipment you do not have here'),
  share: (many) => (many ? 'already have their share' : 'already has its share'),
  room: (many) => (many ? 'have no more room on their days' : 'has no more room on its days'),
};

/**
 * When a pick got more than one ranked above it, the honest reason, in one sentence: "Side shoulders
 * and Biceps have no more room on their days, so Glutes gets extra." The picks passed are named
 * with why (the limit, no exercise, their whole share, or no room: the curation serves picks in
 * rank order, so a lower pick only ever takes room every pick above it could not use); the picks
 * named after "so" are the ones that got more than every pick passed above them. Null when the
 * numbers follow the rank.
 */
export function focusPassed(report: Priorities): string | null {
  const hard = focusCompared(report);
  const passed = hard.filter((h, i) => whyOf(h) && hard.slice(i + 1).some((l) => l.extra > h.extra));
  if (!passed.length) return null;
  const below = (l: FocusResult, h: FocusResult) => hard.indexOf(l) > hard.indexOf(h);
  const top = focusTop(report);
  // The leaders all sit below a pick they passed, and every pick passed has a leader below it: "…, so A and B get the most".
  const most = top.every((t) => passed.some((h) => below(t, h))) && passed.every((h) => top.some((t) => below(t, h)));
  const ahead = most ? top : hard.filter((l) => !passed.includes(l) && passed.some((h) => below(l, h) && l.extra > h.extra));
  if (!ahead.length) return null;
  const groups = (['plenty', 'no_move', 'gear', 'share', 'room'] as const).map((why) => ({ why, picks: passed.filter((p) => whyOf(p) === why) })).filter((g) => g.picks.length);
  const reasons = list(groups.map((g) => `${names(g.picks)} ${WHY[g.why](g.picks.length > 1)}`));
  const what = most ? 'the most' : passed.every((p) => p.extra === 0) ? 'extra' : 'more';
  return `${reasons}, so ${names(ahead)} ${ahead.length === 1 ? 'gets' : 'get'} ${what}.`;
}

/**
 * The reveal's line on who got the most, from the result: "Most extra work: Back and Side
 * shoulders.", and when a pick got more than one ranked above it, why. `named`: the line above
 * already said who was prioritized (focusFit), so only the reason is left to say. Null when there
 * is nothing to compare (one pick, or no pick with extra).
 */
export function focusSummary(report: Priorities, named = false): string | null {
  const hard = focusCompared(report);
  const top = focusTop(report);
  if (!top.length || hard.length < 2) return null;
  if (top.length === hard.length) return `Every pick gets the same extra work: +${top[0]!.extra}.`;
  const passed = focusPassed(report);
  // "…, so Glutes gets the most." has already said who leads.
  const most = named || passed?.endsWith('the most.') ? null : `Most extra work: ${names(top)}.`;
  return [most, passed].filter(Boolean).join(' ') || null;
}
