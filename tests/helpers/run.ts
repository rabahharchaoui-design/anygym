// PLAN 4.3: shared moves for specs that start a run (the live run screen, SPEC 12.2).
import { expect, type Locator, type Page } from '../fixtures';

/** The pocket mode explainer (shown once before the first run) counts as already seen. Call before goto. */
export async function pocketSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('anygym.run.told.pocket', '1');
    } catch {
      // No storage yet on this document: the spec handles the sheet itself.
    }
  });
}

/** Presses a hold button for `ms` (a real press: pointer down, wait, pointer up). */
export async function holdFor(page: Page, button: Locator, ms: number) {
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Ends the live run with the one second hold and throws the (empty) run away: back on the start screen. */
export async function endAndDiscard(page: Page) {
  await holdFor(page, page.getByTestId('live-end'), 1250);
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await page.getByTestId('summary-discard').tap();
  await expect(page.getByTestId('run-summary')).toBeHidden();
  await expect(page.getByTestId('run-start')).toBeVisible();
}
