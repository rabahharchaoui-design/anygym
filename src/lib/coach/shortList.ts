// PLAN 3.5g: a coach card lists only what matters today. The lifts in today's workout first (a few at
// most), the rest one tap away in a sheet ("+9 more"), so the card never becomes a wall of rows. With
// none of them in today's workout, the first few show.
export const SHORT_LIST_MAX = 3;

export function shortList<T extends { exerciseId: string }>(list: readonly T[], todayIds: readonly string[], max = SHORT_LIST_MAX): { shown: T[]; more: number; today: boolean } {
  const today = new Set(todayIds);
  const mine = list.filter((c) => today.has(c.exerciseId));
  const shown = (mine.length ? mine : list).slice(0, max);
  return { shown, more: list.length - shown.length, today: mine.length > 0 };
}
