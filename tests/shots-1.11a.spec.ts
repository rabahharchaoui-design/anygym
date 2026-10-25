import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { allowConsoleErrors, expect, test, type Page } from './fixtures';
import { mockReportApi } from './helpers/reportApi';

// PLAN 1.11a report: Settings Privacy and Help, the Report a problem sheet, sent, offline and the
// error screen, on SE and Pro Max. On demand only: SHOTS_111A=1 npx playwright test tests/shots-1.11a.spec.ts
const PROFILES = ['iPhone SE', 'iPhone 17 Pro Max'];

async function shot(page: Page, name: string) {
  const project = test.info().project.name.replace(/ /g, '-');
  const dir = 'reports/shots/1.11a';
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${dir}/${name}-${project}.png` });
}

test('1.11a report a problem screens', async ({ page, context }) => {
  test.skip(!process.env.SHOTS_111A || !PROFILES.includes(test.info().project.name), 'report run only');
  allowConsoleErrors(/Crash probe/);
  await mockReportApi(context);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: /Report a problem/ }).scrollIntoViewIfNeeded();
  await shot(page, 'settings-privacy-help');
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await shot(page, 'sheet-empty');
  await sheet.getByTestId('report-text').fill('The rest timer stopped when I locked the phone.');
  const png = await sharp({ create: { width: 1290, height: 2796, channels: 3, background: { r: 40, g: 40, b: 46 } } }).png().toBuffer();
  await sheet.getByTestId('report-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: png });
  await expect(sheet.getByRole('img', { name: 'Your screenshot' })).toBeVisible();
  await shot(page, 'sheet-filled');
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByTestId('report-done')).toBeVisible();
  await shot(page, 'sheet-sent');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await context.setOffline(true);
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  await sheet.getByTestId('report-text').fill('No signal here');
  await sheet.getByTestId('report-send').tap();
  await expect(sheet.getByTestId('report-done')).toBeVisible();
  await shot(page, 'sheet-queued');
  await context.setOffline(false);
  await page.goto('./?dev#/');
  await page.evaluate(() => window.dispatchEvent(new Event('anygym:crash-probe')));
  await expect(page.getByTestId('app-error')).toBeVisible();
  await shot(page, 'error-screen');
});
