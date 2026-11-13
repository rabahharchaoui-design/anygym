// PLAN 3.6f: a profile with saved weekdays is FIXED (the calendar works as before); one with none is
// flexible (a rotation: no missed days card). Specs that prove the calendar behaviour seed this.
import type { Page } from '../fixtures';
import { dbAll, dbPut } from '../workout-helpers';

const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = 86_400_000;

/**
 * Makes the profile fixed, training on the `count` days right after the day `daysAgo` days ago, so a
 * workout logged then has exactly `count` missed training days since, whatever today is.
 */
export async function fixedDaysAfter(page: Page, daysAgo: number, count: number): Promise<void> {
  const weekdays = Array.from({ length: count }, (_, i) => NAMES[new Date(Date.now() - daysAgo * DAY + (i + 1) * DAY).getDay()]!);
  const [profile] = await dbAll<{ intake?: Record<string, unknown> }>(page, 'profile');
  await dbPut(page, { profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, ...profile, intake: { ...(profile?.intake ?? {}), days: count, weekdays, scheduleStyle: 'fixed' } }] });
}
