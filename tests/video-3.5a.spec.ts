import { mkdirSync, copyFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { pastIntake, swipe } from './helpers/quick';

// PLAN 3.5a proof (SPEC 23.4): the Quick workout flow on video, iPhone SE and 17 Pro Max.
// Runs only when asked: RECORD=1 npx playwright test tests/video-3.5a.spec.ts --project="iPhone SE" --project="iPhone 17 Pro Max"
test.skip(!process.env.RECORD, 'RECORD=1 to record');
test.use({ video: 'on' });

test('the flow on video (reports/videos/3.5a)', async ({ page }, info) => {
  test.skip(!['iPhone SE', 'iPhone 17 Pro Max'].includes(info.project.name), 'two phones');
  await pastIntake(page);
  await page.waitForTimeout(400);
  await page.getByTestId('build-card').tap();
  await page.waitForTimeout(600);
  await page.locator('[data-concept]').first().tap();
  await page.waitForTimeout(600);
  await swipe(page, 90, { steps: 20, slow: true });
  await page.waitForTimeout(500);
  await swipe(page, 260, { steps: 20 });
  await page.waitForTimeout(500);
  await swipe(page, -260, { steps: 20 });
  await page.waitForTimeout(600);
  await page.getByTestId('deck-keep').tap();
  await page.waitForTimeout(500);
  await page.getByTestId('quick-start').tap();
  await expect(page.getByTestId('check-current')).toBeVisible();
  await page.waitForTimeout(600);
  const path = await page.video()!.path();
  await page.close();
  mkdirSync('reports/videos/3.5a', { recursive: true });
  copyFileSync(path, `reports/videos/3.5a/3.5a-${info.project.name.replace(/ /g, '-')}-flow.webm`);
});
