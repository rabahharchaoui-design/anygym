import { expect, test, type Page } from './fixtures';
import { bar185, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7g + SPEC 13.4: with the phone's text at 130%, no heading or label on any screen is
// clipped, cut off with "…", or pushes the page sideways. Every computed font size (and line
// height) is scaled by 1.3, the way a larger iOS text size grows explicit px sizes too.

async function scaleText(page: Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(150);
}

/** Text that is clipped: inside an overflow hidden/clip box (or ellipsis) and bigger than it. */
async function clipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.closest('[aria-hidden="true"], [inert], [data-skeleton]')) continue;
      if (/_digit_/.test(el.className)) continue; // odometer faces: the strip is meant to overflow
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden') continue;
      const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim()) || /^H[1-6]$/.test(el.tagName);
      if (!hasText) continue;
      const hides = /(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis';
      if (!hides && !/^H[1-6]$/.test(el.tagName)) continue;
      if (el.scrollWidth > el.clientWidth + 1 || (/(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1)) {
        bad.push(`${el.tagName}.${el.className} "${(el.textContent ?? '').trim().slice(0, 40)}" ${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}`);
      }
    }
    if (document.documentElement.scrollWidth > innerWidth) bad.push(`page scrolls sideways ${document.documentElement.scrollWidth} > ${innerWidth}`);
    return bad;
  });
}

async function audit(page: Page, screen: string, found: string[]) {
  await page.waitForTimeout(500);
  await scaleText(page);
  for (const b of await clipped(page)) found.push(`${screen}: ${b}`);
  // Back to the phone's normal size for the next screen (the app re-renders most of it anyway).
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
    el.style.fontSize = '';
    el.style.lineHeight = '';
  }));
}

test('130% text: no clipped heading or label on any screen', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const found: string[] = [];
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await audit(page, 'Today', found);

  await page.getByRole('link', { name: 'Plans' }).tap();
  await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
  await audit(page, 'Plans', found);
  await page.getByTestId('plan-six-week-volume').tap();
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await audit(page, 'Plan viewer', found);

  await page.goto('./#/run');
  await expect(page.getByRole('heading', { level: 1, name: 'Run' })).toBeVisible();
  await audit(page, 'Run', found);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await audit(page, 'Settings', found);

  await page.goto('./');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await audit(page, 'Day list', found);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await audit(page, 'Exercise view with rest', found);
  await view.getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(weight).toBeVisible();
  await audit(page, 'Weight sheet', found);
  await weight.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(weight).toHaveCount(0);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(900);
  await audit(page, 'Finish', found);
  await page.getByRole('button', { name: 'Done' }).tap();

  await page.getByRole('link', { name: 'History' }).tap();
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  await audit(page, 'History', found);
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByTestId('history-meta')).toBeVisible();
  await audit(page, 'History detail', found);

  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const add = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(add).toBeVisible();
  await audit(page, 'Exercise picker', found);
  await add.getByRole('searchbox', { name: 'Search exercises' }).fill('leg press');
  await add.getByRole('button', { name: 'Leg Press', exact: true }).tap();
  await add.getByRole('button', { name: 'Add 1' }).tap();
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Set starting weight' }).tap();
  await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
  await expect(page.getByRole('dialog', { name: 'Plate loaded machine' })).toBeVisible();
  await audit(page, 'Info sheet', found);

  expect(found).toEqual([]);
  expect(errors).toEqual([]);
});
