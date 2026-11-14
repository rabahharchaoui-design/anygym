// PLAN 3.6f: the two intake answers whose controls changed. A focus area with parts opens a sheet,
// and the weekday chips only exist after "Same days each week" is chosen. Shared by the older specs.
import { expect, type Page } from '@playwright/test';
import { rootAtRest } from './controls';

const WITH_PARTS = new Set(['chest', 'back', 'shoulders', 'arms', 'core', 'legs']);

/** Taps a focus tile; an area with parts opens its sheet, where the whole area is picked and Done closes it. */
export async function pickFocusArea(page: Page, area: string, part: string = area): Promise<void> {
  await page.getByTestId(`q-focus-${area}`).tap();
  if (!WITH_PARTS.has(area)) return;
  const sheet = page.getByRole('dialog', { name: / focus$/ });
  await expect(sheet).toBeVisible();
  await rootAtRest(page);
  await sheet.getByTestId(`focus-part-${part}`).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).not.toBeVisible();
  await rootAtRest(page);
}

/** Chooses one of the three schedule tiles on the schedule step (fixed, flexible, weekly). */
export const chooseSchedule = (page: Page, style: 'fixed' | 'flexible' | 'weekly') => page.getByTestId(`q-schedule-${style}`).tap();
