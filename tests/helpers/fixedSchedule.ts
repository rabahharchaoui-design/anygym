// PLAN 3.6f: a profile with saved weekdays is FIXED (the calendar works as before); one with none is
// flexible (a rotation: no missed days card). Specs that prove the calendar behaviour seed this.
import type { Page } from '../fixtures';
import { dbAll, dbPut } from '../workout-helpers';

const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = 86_400_000;

/**
 * Makes the profile fixed, training on the `count` days right after the day `daysAgo` days ago, so a
 * workout logged then has exactly `count` missed training days since, whatever today is.
 * `planDays` (round 3: a fixed schedule has one weekday for each plan day, or Today asks for the
 * rest): more weekdays are added up to that many, only from the days that add no missed day (today,
 * the day of that workout, the days after today), as far as the week has them.
 */
export async function fixedDaysAfter(page: Page, daysAgo: number, count: number, planDays = count): Promise<void> {
  const at = (offset: number) => NAMES[new Date(Date.now() + offset * DAY).getDay()]!;
  const weekdays = Array.from({ length: count }, (_, i) => at(i + 1 - daysAgo));
  // Between that workout and today (both left out) every other day is a day off.
  const between = new Set(Array.from({ length: Math.max(0, daysAgo - 1) }, (_, i) => at(i + 1 - daysAgo)));
  for (const offset of [0, -daysAgo, 1, 2, 3, 4, 5, 6]) {
    const d = at(offset);
    if (weekdays.length < planDays && !between.has(d) && !weekdays.includes(d)) weekdays.push(d);
  }
  const [profile] = await dbAll<{ intake?: Record<string, unknown> }>(page, 'profile');
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, ...profile, intake: { ...(profile?.intake ?? {}), days: weekdays.length, weekdays, scheduleStyle: 'fixed' } }] });
}
