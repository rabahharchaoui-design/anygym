// Calendar helpers for the coach (local time). A training week runs Monday to Sunday.

export const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfDay = (t: number): number => new Date(t).setHours(0, 0, 0, 0);

/** Whole calendar days from `a` to `b` (local, so a daylight saving change is still one day). */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

/** Monday 00:00 of the week `t` falls in. */
export function weekStart(t: number): number {
  const d = new Date(startOfDay(t));
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** Monday 00:00 `n` weeks after the week of `t` (negative: before). */
export function weekStartFrom(t: number, n: number): number {
  const d = new Date(weekStart(t));
  d.setDate(d.getDate() + 7 * n);
  return d.getTime();
}

/** A week's id: its Monday as YYYY-MM-DD (local). */
export function weekKey(t: number): string {
  const d = new Date(weekStart(t));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The week before the one `now` is in: [start, end). */
export function lastWeek(now: number): { start: number; end: number; key: string } {
  const start = weekStartFrom(now, -1);
  return { start, end: weekStart(now), key: weekKey(start) };
}

/** One local weekday per date: 'mon' … 'sun' (the intake's weekday ids). */
export const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const weekdayOf = (t: number): (typeof WEEKDAY_IDS)[number] => WEEKDAY_IDS[new Date(t).getDay()]!;
