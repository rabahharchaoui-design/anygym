// Session 2 merge gate (PLAN 2.6): checks for the ux-critic gate fixes B1 to B3 and P1 to P15.
import { expect, test, type Page } from './fixtures';
import { usePlan, watchErrors } from './workout-helpers';

test('B3: a pushed screen top bar is near solid once scrolled (Settings)', async ({ page }) => {
  await page.goto('./#/settings');
  const bar = page.locator('header').first();
  await expect(bar).toBeVisible();
  await page.locator('[data-scroller]').first().evaluate((el) => el.scrollTo(0, 400));
  await expect(bar).toHaveAttribute('data-compact', 'true');
  const alpha = await bar.evaluate((el) => {
    // 3.5t: WebKit reports a color-mix as `color(srgb r g b / a)`, others as rgb()/rgba().
    const m = getComputedStyle(el).backgroundColor.match(/(?:rgba?|color)\(([^)]+)\)/)?.[1]?.replace(/^srgb\s+/, '').split(/[ ,/]+/).filter(Boolean) ?? [];
    return m.length > 3 ? Number(m[3]) : m.length === 3 ? 1 : 0;
  });
  expect(alpha).toBeGreaterThanOrEqual(0.94);
});

/** Brightest pixel (0 to 255) in a page area, from a real screenshot: what the eye sees. */
async function brightest(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    return max;
  }, png);
}

for (const [name, url] of [
  ['Settings', './#/settings'],
  ['plan viewer', './#/plans/five-day-split'],
] as const) {
  test(`B3 round 2: scrolled text never reads through the ${name} top bar (pixels)`, async ({ page }) => {
    await page.goto(url);
    const bar = page.locator('header[data-compact]').first();
    await expect(bar).toBeVisible();
    // Scroll in small steps so some text sits right under the bar, whatever the page.
    const scroller = page.locator('[data-scroller]').first();
    let worst = 0;
    for (const y of [120, 180, 240, 300, 360]) {
      await scroller.evaluate((el, top) => el.scrollTo(0, top), y);
      await expect(bar).toHaveAttribute('data-compact', 'true');
      await page.waitForTimeout(150);
      const b = (await bar.boundingBox())!;
      const title = (await bar.locator('[class*="compact"]').first().boundingBox())!;
      // Between the compact title and the right edge, inside the bar's row: only the fill shows there.
      const x = title.x + title.width + 8;
      const clip = { x, y: b.y + b.height - 40, width: Math.max(8, b.x + b.width - 60 - x), height: 30 };
      worst = Math.max(worst, await brightest(page, clip));
    }
    // 3.5t: derived from the token, not a magic number. The fill's own brightness plus 20 (white text at 5%
    // through it adds about 11); read-through text was 100+ above the fill.
    const fill = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d')!;
      c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bar-solid').trim();
      c.fillRect(0, 0, 1, 1);
      const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    });
    expect(worst).toBeLessThan(fill + 20);
  });
}

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
