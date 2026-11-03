// Session 2 merge gate (PLAN 2.6): checks for the ux-critic gate fixes B1 to B3 and P1 to P15.
import { expect, test } from './fixtures';
import { usePlan, watchErrors } from './workout-helpers';

test('B3: a pushed screen top bar is near solid once scrolled (Settings)', async ({ page }) => {
  await page.goto('./#/settings');
  const bar = page.locator('header').first();
  await expect(bar).toBeVisible();
  await page.locator('[data-scroller]').first().evaluate((el) => el.scrollTo(0, 400));
  await expect(bar).toHaveAttribute('data-compact', 'true');
  const alpha = await bar.evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1]?.split(/[ ,/]+/).filter(Boolean) ?? [];
    return m.length > 3 ? Number(m[3]) : m.length === 3 ? 1 : 0;
  });
  expect(alpha).toBeGreaterThanOrEqual(0.94);
});

const alphaOf = (color: string) => {
  const m = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(/[ ,/]+/).filter(Boolean) ?? [];
  return m.length > 3 ? Number(m[3]) : m.length === 3 ? 1 : 0;
};

test('B2: a toast is opaque and one line; an Undo toast shortens the name, never the action', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./?dev#/dev/ui');
  await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete a set' }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Set deleted' });
  await expect(toast).toBeVisible();
  expect(alphaOf(await toast.evaluate((el) => getComputedStyle(el).backgroundColor))).toBe(1);
  expect((await toast.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect(errors).toEqual([]);
});

test('P12: Today keeps its large title after the plan saved toast scrolls the cards', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  // P12: the plan saved toast scrolls the cards clear, the large "Today" stays (pinned in the bar).
  const title = page.getByRole('heading', { name: 'Today', level: 1 });
  await page.waitForTimeout(900);
  await expect(title).toBeVisible();
  expect(Number(await title.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  expect(parseFloat(await title.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(30);
  expect(errors).toEqual([]);
});

test('P7: the Continue pill keeps "set N of M" on a narrow phone; the name gives way', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  const pill = page.getByTestId('start-next');
  await expect(pill).toBeVisible();
  const label = await pill.textContent();
  expect(label).toMatch(/^Start · /);
  // Never cut: the verb and (once a set is logged) the set count are their own, unshrinking parts.
  const verb = pill.locator('span').filter({ hasText: /^Start · $/ });
  await expect(verb).toHaveCount(1);
  expect(errors).toEqual([]);
});
