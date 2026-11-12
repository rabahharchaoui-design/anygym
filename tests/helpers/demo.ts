import { expect, type Locator, type Page } from '@playwright/test';
import { rootAtRest } from './controls';

/**
 * Under 600 pt tall (the 320 x 568 floor) the exercise page has no room for the demo hero above the
 * set rows (SPEC 13.5, gate s2 round 2): the compact header carries the photos as its tile, and the
 * tile opens the form sheet, whose photo opens the same full screen viewer.
 */
export const isShort = (page: Page) => page.viewportSize()!.height <= 600;

/** The exercise page's own moving picture: the hero, or on a short phone the compact header's tile. */
export const demoPicture = (page: Page, view: Locator) =>
  isShort(page) ? view.getByTestId('ex-head').getByTestId('demo-tile') : view.getByTestId('ex-hero');

/**
 * Opens the full screen demo the way a person can on this phone: the hero's tap, or on a short
 * phone the tile, then the photo in the form sheet (two taps, still reachable).
 */
export async function openDemoViewer(page: Page, name: string): Promise<Locator> {
  const sheet = page.getByTestId('exercise-sheet');
  if (isShort(page)) {
    if (!(await sheet.isVisible())) {
      await page.getByRole('button', { name: `How to do ${name}` }).tap();
      await expect(sheet).toBeVisible();
      await rootAtRest(page);
    }
    await sheet.getByRole('button', { name: `Show ${name} full screen` }).tap();
  } else {
    await page.getByRole('button', { name: `How to do ${name}` }).tap();
  }
  const viewer = page.getByTestId('demo-viewer');
  await expect(viewer).toBeVisible();
  return viewer;
}

/** On a short phone the form sheet stays under the closed viewer: close it too (a no-op elsewhere). */
export async function closeFormSheet(page: Page): Promise<void> {
  const sheet = page.getByTestId('exercise-sheet');
  if (!(await sheet.isVisible())) return;
  // The footer's Close lives in the sheet's pinned footer, outside its scrolling body.
  await page.getByRole('dialog').filter({ has: sheet }).getByRole('button', { name: 'Close', exact: true }).last().tap();
  await expect(sheet).toHaveCount(0);
}
