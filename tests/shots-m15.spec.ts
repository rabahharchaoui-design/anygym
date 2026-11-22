import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { openRun } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { pastIntake } from './helpers/quick';
import { bar185, seedFinished, usePlan } from './workout-helpers';

// PLAN M15: after shots of the shared sheets, toggles, toasts, errors and empty states on two
// screens each, at iPhone 15 Pro, iPhone SE and the 320 x 568 floor, into reports/monolith/m15/.
// On demand only: M15SHOTS=1 PW_NO_BUILD=1 npx playwright test tests/shots-m15.spec.ts --project "iPhone 15" --project "iPhone SE" --project "320 floor"
const DEV: Record<string, string> = { 'iPhone 15': '15pro', 'iPhone SE': 'se', '320 floor': '320' };
const DIR = 'reports/monolith/m15';
test.setTimeout(90_000);
test.beforeEach(() => {
  test.skip(!process.env.M15SHOTS || !DEV[test.info().project.name], 'M15 shots run only');
});

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}-${DEV[test.info().project.name]}.jpg`, type: 'jpeg', quality: 55 });
}

test('m15 shots toggles @matrix', async ({ page, context }) => {
  await stubTiles(page);
  await openRun(page, context);
  await page.getByTestId('run-settings').tap();
  await expect(page.getByTestId('run-settings-sheet')).toBeVisible();
  await shot(page, 'toggles-run-settings');
  await page.keyboard.press('Escape');
  await page.goto('./#/settings');
  await expect(page.getByTestId('settings-distance')).toBeVisible();
  await shot(page, 'toggles-you');
});

test('m15 shots today sheets @matrix', async ({ page }) => {
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
  await usePlan(page);
  await page.getByTestId('gym-pill').first().tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, 'sheet-gym');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change day', exact: true }).tap({ timeout: 3000 }).catch(() => undefined);
  if (await page.getByRole('dialog').isVisible().catch(() => false)) {
    await shot(page, 'sheet-change-day');
    await page.keyboard.press('Escape');
  }
  await page.getByTestId('day-card-time').tap({ timeout: 3000 }).catch(() => undefined);
  if (await page.getByRole('dialog').isVisible().catch(() => false)) await shot(page, 'sheet-time');
});

test('m15 shots errors and empty @matrix', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/history');
  await page.waitForTimeout(400);
  await shot(page, 'empty-history');
  await page.addInitScript(() => ((window as unknown as { __anygymFailReads: boolean }).__anygymFailReads = true));
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByTestId('load-error')).toBeVisible();
  await shot(page, 'error-history');
  await page.goto('./#/');
  await expect(page.getByTestId('load-error')).toBeVisible();
  await shot(page, 'error-today');
});
