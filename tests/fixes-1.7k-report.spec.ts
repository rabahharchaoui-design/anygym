import { expect, test, type Page } from './fixtures';
import { mockReportApi } from './helpers/reportApi';

// PLAN 1.7k (5): the Report a problem sheet keeps a generation per opening. A Send from an earlier
// opening that completes late never marks a new, unsent report as Sent, never shows its error and
// never unlocks the new Send.

const SENT = 'Sent. Thanks, this goes straight to the builder.';

/** Holds the first /feedback request in the page until window.__releaseFirst() is called. */
async function holdFirstReport(page: Page) {
  await page.addInitScript(() => {
    const inner = window.fetch.bind(window);
    let held = false;
    const w = window as unknown as { __releaseFirst?: () => void; __heldFirst?: boolean };
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!held && url.endsWith('/feedback')) {
        held = true;
        await new Promise<void>((resolve) => {
          w.__releaseFirst = resolve;
          w.__heldFirst = true;
        });
      }
      return inner(input, init);
    };
  });
}

async function openReport(page: Page) {
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('an earlier Send finishing late never marks a new unsent report as Sent @matrix', async ({ page, context }) => {
  const sent = await mockReportApi(context);
  await holdFirstReport(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  await expect(page).toHaveURL(/#\/settings$/);

  // Report A: Send, and its request hangs.
  let sheet = await openReport(page);
  await sheet.getByTestId('report-text').fill('First report about the timer');
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByTestId('report-send')).toHaveText('Sending…');
  await page.waitForFunction(() => (window as unknown as { __heldFirst?: boolean }).__heldFirst === true);

  // Close while it waits, reopen, write report B.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Report a problem' })).toHaveCount(0);
  sheet = await openReport(page);
  await expect(sheet.getByTestId('report-text')).toHaveValue('');
  await sheet.getByTestId('report-text').fill('Second report about the plates');

  // A completes now.
  await page.evaluate(() => (window as unknown as { __releaseFirst: () => void }).__releaseFirst());
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(400);

  // B is still the unsent, editable report with its own Send.
  await expect(sheet.getByText(SENT, { exact: true })).toHaveCount(0);
  await expect(sheet.getByTestId('report-text')).toHaveValue('Second report about the plates');
  await expect(sheet.getByTestId('report-send')).toHaveText('Send');
  await expect(sheet.getByTestId('report-send')).toBeEnabled();
  await expect(sheet.getByTestId('report-error')).toHaveText('');

  // Sending B makes its own request.
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByText(SENT, { exact: true })).toBeVisible();
  expect(sent.map((s) => s.body.message)).toEqual(['First report about the timer', 'Second report about the plates']);
  expect(new Set(sent.map((s) => s.body.requestId)).size).toBe(2);
});

test('a late failure from an earlier opening never shows its error in the new sheet', async ({ page, context }) => {
  const sent = await mockReportApi(context, 400);
  await holdFirstReport(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  let sheet = await openReport(page);
  await sheet.getByTestId('report-text').fill('First report');
  await sheet.getByTestId('report-send').tap();
  await page.waitForFunction(() => (window as unknown as { __heldFirst?: boolean }).__heldFirst === true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Report a problem' })).toHaveCount(0);
  sheet = await openReport(page);
  await sheet.getByTestId('report-text').fill('Second report');
  await page.evaluate(() => (window as unknown as { __releaseFirst: () => void }).__releaseFirst());
  await expect.poll(() => sent.length).toBe(1);
  await page.waitForTimeout(400);
  await expect(sheet.getByTestId('report-error')).toHaveText('');
  await expect(sheet.getByTestId('report-text')).toHaveValue('Second report');
  await expect(sheet.getByTestId('report-send')).toBeEnabled();
});
