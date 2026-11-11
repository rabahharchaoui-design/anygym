// PLAN 3.5w: records the intake, the reveal, the welcome and Today as a clip (before and after the
// motion fixes). Runs only when asked: PW_REC=before|after npx playwright test tests/motion-3.5w-record.spec.ts
import { copyFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';

const REC = process.env.PW_REC;
test.skip(!REC, 'a recording run only (PW_REC=before|after)');
test.use({ intake: 'fresh', video: { mode: 'on', size: { width: 300, height: 510 } } });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const atStep = (page: Page, step: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', step);
const cta = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
const beat = (page: Page, ms = 450) => page.waitForTimeout(ms);

test('clip: intake to Today', async ({ page }, info) => {
  test.setTimeout(120_000);
  const pick = async (screen: string, id: string) => {
    await page.getByTestId(`q-${screen}-${id}`).tap();
    await beat(page);
  };
  const go = async (step: string) => {
    await cta(page).tap();
    await atStep(page, step);
    await beat(page);
  };
  await page.goto('./');
  await atStep(page, 'goal');
  await beat(page, 600);
  await pick('goal', 'muscle');
  await pick('goal', 'tone');
  await go('units');
  await go('focus');
  await pick('focus', 'balance');
  await go('experience');
  await pick('experience', 'break');
  await atStep(page, 'days');
  await pick('days', '5');
  await atStep(page, 'weekdays');
  await page.getByTestId('skip').tap();
  await atStep(page, 'minutes');
  await beat(page);
  await pick('minutes', '45');
  await atStep(page, 'place');
  await pick('place', 'mix');
  await atStep(page, 'equipment');
  await beat(page);
  await go('style');
  await pick('style', 'any');
  await atStep(page, 'cardio');
  await beat(page);
  await pick('cardio', 'love');
  await beat(page);
  await go('easyOn');
  await page.getByTestId('skip').tap();
  await atStep(page, 'exercises');
  await beat(page, 700);
  for (const id of ['ex-love', 'ex-skip', 'ex-love', 'ex-never']) {
    await page.getByTestId(id).tap();
    await beat(page, 700);
  }
  await go('about');
  await page.getByTestId('skip').tap();
  await atStep(page, 'reveal');
  await beat(page, 1400);
  await page.getByTestId('reveal-cta').locator('button[data-variant="primary"]').tap();
  await expect(page.getByTestId('welcome-tour')).toBeVisible();
  await beat(page, 900);
  await page.getByTestId('tour-next').tap();
  await beat(page, 900);
  await page.getByTestId('tour-next').tap();
  await beat(page, 900);
  await page.getByTestId('tour-next').tap();
  await beat(page, 900);
  const video = page.video();
  await page.close();
  if (video) {
    mkdirSync('reports/shots/3.5w', { recursive: true });
    copyFileSync(await video.path(), `reports/shots/3.5w/${REC}-${info.project.name.replace(/ /g, '-')}.webm`);
  }
});
