import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';

// PLAN M1 (SPEC 10, 23): the shared Monolith pieces on the dev preview (#/dev/monolith?dev) and in
// the app, on the iPhone 15 (the iPhone 15 Pro's size) and the iPhone SE. Screenshots land in
// reports/monolith/m1/ (small JPEGs) so the report shows them; the checks are the real test.
const PROFILES = ['iPhone 15', 'iPhone SE'];
const DIR = 'reports/monolith/m1';

test.beforeEach(() => {
  test.skip(!PROFILES.includes(test.info().project.name), 'M1 shots: iPhone 15 and iPhone SE');
});

const tag = () => test.info().project.name.replace(/ /g, '-');

async function shot(target: Page | Locator, name: string) {
  mkdirSync(DIR, { recursive: true });
  await (target as Page).waitForTimeout?.(300);
  await target.screenshot({ path: `${DIR}/${name}-${tag()}.jpg`, type: 'jpeg', quality: 80, animations: 'disabled' });
}

async function openPreview(page: Page) {
  await page.goto('./#/dev/monolith?dev');
  await expect(page.getByTestId('m1-buttons')).toBeVisible();
}

/** Nothing on the page is wider than the screen. */
async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

test('M1 button: primary, secondary, quiet, destructive, disabled; 44 pt targets; press feedback', async ({ page }) => {
  await openPreview(page);
  const section = page.getByTestId('m1-buttons');
  const buttons = section.locator('button');
  expect(await buttons.count()).toBeGreaterThanOrEqual(7);
  for (const b of await buttons.all()) {
    const box = (await b.boundingBox())!;
    expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.width, await b.innerText()).toBeGreaterThanOrEqual(44);
  }
  const look = (b: Locator) =>
    b.evaluate((el) => {
      const s = getComputedStyle(el);
      const bar = getComputedStyle(el, '::after');
      return { radius: s.borderTopLeftRadius, bg: s.backgroundColor, shadow: s.boxShadow, color: s.color, weight: s.fontWeight, bar: bar.height, barColor: bar.backgroundColor, h: el.getBoundingClientRect().height };
    });
  const primary = await look(buttons.nth(0));
  expect(primary).toMatchObject({ radius: '0px', bg: 'rgba(0, 0, 0, 0)', shadow: 'none', color: 'rgb(255, 255, 255)', weight: '900', bar: '4px', barColor: 'rgb(159, 211, 255)' });
  expect(primary.h).toBeGreaterThanOrEqual(56);
  const disabled = await look(buttons.nth(1));
  expect(disabled).toMatchObject({ color: 'rgb(85, 88, 93)', barColor: 'rgb(46, 48, 52)' });
  await expect(section.getByRole('note')).toHaveText('Pick a day first');
  const secondary = await look(buttons.nth(2));
  expect(secondary).toMatchObject({ bar: '1px', barColor: 'rgba(255, 255, 255, 0.35)', weight: '900' });
  const destructive = await look(section.getByRole('button', { name: 'Delete set' }));
  expect(destructive.color).toBe('rgb(255, 128, 128)');
  await noSideScroll(page);
  await shot(section, 'button');

  // Pressed: ice blue text and an 8 px bar on the first frame, without moving anything around it.
  const before = (await buttons.nth(2).boundingBox())!;
  const box = (await buttons.nth(0).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await look(buttons.nth(0));
  expect(pressed).toMatchObject({ color: 'rgb(159, 211, 255)', bar: '8px' });
  expect((await buttons.nth(2).boundingBox())!.y).toBeCloseTo(before.y, 0);
  await shot(section, 'button-pressed');
  await page.mouse.up();
});
