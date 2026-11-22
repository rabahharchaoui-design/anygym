import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

// PLAN M13 (SPEC 10, 14, 23; M-TEST): the onboarding in Monolith. Walks every intake step and the
// first Today with its three step welcome, at the iPhone 15 (the iPhone 15 Pro's size), the iPhone SE
// and the 320 x 568 floor, at normal and at the largest text size. Each step: no sideways scroll,
// every answer row at least 44 pt tall, Continue (when the step has one) on screen. Small JPEGs land
// in reports/monolith/m13/.

const PROFILES = ['iPhone 15', 'iPhone SE', '320 floor'];
const DIR = 'reports/monolith/m13';

test.use({ serviceWorkers: 'block', locale: 'en-US', intake: 'fresh' });
test.setTimeout(120_000);
test.beforeEach(() => {
  test.skip(!PROFILES.includes(test.info().project.name), 'M13 shots: iPhone 15, iPhone SE and the 320 floor');
});

const tag = () => test.info().project.name.replace(/ /g, '-');
async function shot(page: Page, name: string, big: boolean) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}${big ? '-largest' : ''}-${tag()}.jpg`, type: 'jpeg', quality: 60, animations: 'disabled' });
}

/** The phone's largest text size, as the 130% specs do it: every size and line height x1.3. */
async function largestText(page: Page) {
  await page.evaluate(() => {
    // Each element once: the screens keep some elements from step to step.
    const w = window as unknown as { __m13Big?: WeakSet<Element> };
    const done = (w.__m13Big ??= new WeakSet());
    const all = Array.from(document.querySelectorAll<HTMLElement>('#root *')).filter((el) => !done.has(el) && (done.add(el), true)).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of all) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(250);
}

/** Problems on the screen as it is: sideways scroll, a short answer row, Continue off screen, a word cut at the side. */
async function problems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 0.5) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
    const main = document.querySelector('[data-testid="intake"]') ?? document.body;
    for (const b of Array.from(main.querySelectorAll<HTMLElement>('button[aria-pressed], [role="radio"], [role="switch"]'))) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5) out.push(`${b.dataset.testid ?? b.textContent?.trim().slice(0, 20)}: ${Math.round(r.height)} pt tall`);
      if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push(`${b.dataset.testid ?? b.textContent?.trim().slice(0, 20)}: off the side`);
    }
    const cta = document.querySelector('[data-testid="intake-cta"] button[data-variant="primary"]');
    if (cta) {
      const r = cta.getBoundingClientRect();
      if (r.bottom > innerHeight + 0.5 || r.top < 0) out.push('Continue is off screen');
    }
    return out;
  });
}

const primary = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');

async function walk(page: Page, big: boolean) {
  const seen: Record<string, string[]> = {};
  const step = (s: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', s);
  const pick = (screen: string, v: string) => page.getByTestId(`q-${screen}-${v}`).tap();
  const check = async (name: string) => {
    if (big) await largestText(page);
    await shot(page, name, big);
    seen[name] = await problems(page);
  };
  await page.goto('./');
  await step('goal');
  await check('01-goal');
  await pick('goal', 'muscle');
  await pick('goal', 'strength');
  await check('02-goal-picked');
  await primary(page).tap();
  await step('units');
  await check('03-units');
  await primary(page).tap();
  await step('focus');
  await check('04-focus');
  await pick('focus', 'back');
  const sheet = page.getByRole('dialog', { name: / focus$/ });
  if (await sheet.isVisible().catch(() => false)) {
    await check('05-focus-parts-sheet');
    await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(sheet).not.toBeVisible();
  }
  await check('06-focus-picked');
  await primary(page).tap();
  await step('experience');
  await check('07-experience');
  await pick('experience', '3y');
  await step('days');
  await check('08-days');
  await pick('days', '5');
  await step('weekdays');
  await check('09-schedule');
  await pick('schedule', 'fixed');
  await check('10-weekdays-fixed');
  await pick('schedule', 'flexible');
  await primary(page).tap();
  await step('minutes');
  await check('11-minutes');
  await pick('minutes', '60');
  await step('place');
  await check('12-place');
  await pick('place', 'full');
  await step('equipment');
  await check('13-equipment');
  await primary(page).tap();
  await step('style');
  await check('14-style');
  await pick('style', 'mix');
  await step('cardio');
  await check('15-cardio');
  await pick('cardio', 'little');
  await check('15b-cardio-kinds');
  await primary(page).tap();
  await step('easyOn');
  await check('16-easy-on');
  await page.getByTestId('skip').tap();
  await step('exercises');
  await check('17-exercises-deck');
  await page.getByTestId('skip').tap();
  await step('about');
  await check('18-about-you');
  await page.getByTestId('skip').tap();
  await step('reveal');
  await check('19-reveal');
  await page.locator('main[data-scroller]').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await check('19b-reveal-end');
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByTestId('tour-words').waitFor();
  await check('20-first-today');
  for (const n of [2, 3]) {
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await check(`2${n - 1}-welcome-tour-${n}`);
  }
  return seen;
}

for (const big of [false, true]) {
  test(`M13 onboarding: every step fits, rows 44 pt, Continue on screen${big ? ' (largest text)' : ''} @matrix`, async ({ page }) => {
    const seen = await walk(page, big);
    const bad = Object.entries(seen).filter(([, p]) => p.length);
    expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
  });
}
