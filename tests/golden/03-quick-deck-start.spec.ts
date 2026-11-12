// GOLDEN 3: Quick workout. Today, the idea cards, the swipe deck (right keeps, left swaps), Start.
import { expect, test } from '../fixtures';
import { dbAll } from '../workout-helpers';
import { card, pastIntake, swipe } from '../helpers/quick';

test.describe.configure({ retries: 0 });

test('golden: Quick workout, swipe through the deck, Start workout', async ({ page }) => {
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  await page.getByTestId('min-30').tap();
  await expect(page.getByTestId('min-30')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await page.locator('[data-concept="strength"]').tap();
  await expect(card(page)).toBeVisible();
  const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i++) {
    await expect(card(page).locator('p').first()).toContainText(`${i + 1} of ${total}`);
    await swipe(page, 260);
  }
  await expect(page.getByRole('heading', { name: 'Ready to go' })).toBeVisible();
  await expect(page.getByTestId('ready-list').locator('li')).toHaveCount(total);
  await page.getByTestId('quick-start').tap();
  await expect(page.getByTestId('check-current')).toBeVisible();
  const open = (await dbAll<{ endedAt?: number; exerciseIds: string[] }>(page, 'sessions')).filter((s) => s.endedAt === undefined);
  expect(open).toHaveLength(1);
  expect(open[0]!.exerciseIds).toHaveLength(total);
});
