import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from './fixtures';

// PLAN 1.11 report: the import review on the synthetic fixture (invented numbers), SE and Pro Max.
// On demand only: SHOTS_111=1 npx playwright test tests/shots-1.11.spec.ts
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json');
const PROFILES = ['iPhone SE', 'iPhone 17 Pro Max', 'iPhone 15'];

async function shot(page: Page, name: string) {
  const project = test.info().project.name.replace(/ /g, '-');
  const dir = 'reports/shots/1.11';
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${dir}/${name}-${project}.png` });
}

test('1.11 import review screens', async ({ page }) => {
  test.skip(!process.env.SHOTS_111 || !PROFILES.includes(test.info().project.name), 'report run only');
  await page.goto('./#/settings');
  await shot(page, 'settings');
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('import-summary')).toBeVisible();
  await shot(page, 'review-top');
  await page.getByRole('region', { name: 'Wide Lunge' }).scrollIntoViewIfNeeded();
  await shot(page, 'review-questions');
  await page.getByTestId('import-confirm').tap();
  await shot(page, 'load-type-sheet');
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Dumbbells/ }).tap();
  await page.getByTestId('import-confirm').tap();
  await shot(page, 'pick-sheet');
  await page.getByRole('dialog', { name: 'Pick the exercise' }).getByRole('button', { name: 'Skip these' }).tap();
  await page.locator('[data-testid="import-set"][data-uncertain]').first().tap();
  await shot(page, 'set-sheet');
  await page.getByRole('dialog', { name: 'Check this set' }).getByRole('button', { name: 'Looks right' }).tap();
  await page.getByTestId('import-confirm').tap();
  await expect(page.getByRole('status').filter({ hasText: /Imported/ })).toBeVisible();
  await shot(page, 'imported-toast');
  await page.goto('./#/history');
  await shot(page, 'history');
});
