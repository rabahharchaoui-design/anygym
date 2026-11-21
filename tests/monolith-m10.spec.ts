import { expect, test, type Page } from './fixtures';
import { pastIntake } from './helpers/quick';
import { openRun, runRow } from './helpers/run';
import { bar185, dbPut, seedFinished, usePlan } from './workout-helpers';

// PLAN M10, SPEC 10: square corners everywhere. Every visible element (and its ::before and
// ::after) on every main screen and the common sheets has a computed corner of 4 px or less on all
// four corners. The only exemption is an element marked data-round="ok" (the GPS dot, the record
// dot, a progress ring) together with its own pseudo elements; its children are still checked.

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones');
});

type Offender = { what: string; corners: string };

/** Every visible element whose computed corner is over 4 px, in the page as it is now. */
function roundCorners(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const CORNERS = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'] as const;
    // A corner value is "x" or "x y" (elliptical), each in px or %.
    const size = (part: string, box: number) => (part.endsWith('%') ? (Number.parseFloat(part) / 100) * box : Number.parseFloat(part) || 0);
    const biggest = (style: CSSStyleDeclaration, w: number, h: number) =>
      Math.max(
        ...CORNERS.map((c) => {
          const [x = '0', y = x] = style[c].split(' ');
          // A corner can never be drawn bigger than half the box.
          return Math.min(size(x, w), size(y, h), w / 2, h / 2);
        }),
      );
    const label = (el: Element, pseudo = '') => {
      const id = el.getAttribute('data-testid');
      const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ''}${cls ? `.${cls}` : ''}${pseudo}`;
    };
    const out: { what: string; corners: string }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (el.closest('[aria-hidden="true"][inert]')) continue;
      const ok = el.getAttribute('data-round') === 'ok';
      const style = getComputedStyle(el);
      if (!ok) {
        const r = biggest(style, box.width, box.height);
        if (r > 4) out.push({ what: label(el), corners: `${r.toFixed(1)}px (${style.borderRadius})` });
      }
      for (const pseudo of ['::before', '::after']) {
        if (ok) break;
        const p = getComputedStyle(el, pseudo);
        if (p.content === 'none' || p.content === 'normal' || p.display === 'none') continue;
        const w = Number.parseFloat(p.width) || 0;
        const h = Number.parseFloat(p.height) || 0;
        if (w < 1 || h < 1 || p.visibility === 'hidden' || p.opacity === '0') continue;
        const r = biggest(p, w, h);
        if (r > 4) out.push({ what: label(el, pseudo), corners: `${r.toFixed(1)}px (${p.borderRadius})` });
      }
    }
    return out;
  });
}

/** Waits for springs to land, then records this screen's offenders (soft, so every screen reports). */
async function square(page: Page, screen: string) {
  await page.waitForTimeout(600);
  const found = await roundCorners(page);
  console.log(`M10COUNT ${test.info().project.name} | ${screen} | ${found.length}`);
  await test.info().attach(`${screen}.json`, { body: JSON.stringify(found, null, 2), contentType: 'application/json' });
  expect.soft(found.map((f) => `${f.what}: ${f.corners}`), `${screen}: corners over 4 px`).toEqual([]);
}

test('M10 Today with a plan, the gym picker and History with workouts and a run', async ({ page }) => {
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 3 }, () => ({ reps: 8, load: bar185 })) });
  await dbPut(page, { runs: [runRow('m10-run', 5000, Date.now() - 86_400_000)] });
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await square(page, 'today');
  await page.getByTestId('gym-pill').first().tap();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await square(page, 'gym picker');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).tap();
  await expect(page).toHaveURL(/#\/history/);
  await square(page, 'history');
});

test('M10 Plans and a plan', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/plans');
  await expect(page.getByTestId('plan-five-day-split')).toBeAttached();
  await square(page, 'plans');
  await page.goto('./#/plans/five-day-split');
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await square(page, 'a plan');
});

test('M10 a workout, the weight sheet and exercise info', async ({ page }) => {
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  await square(page, 'workout list');
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('check-current')).toBeEnabled();
  await square(page, 'workout exercise');
  await view.getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(weight).toBeVisible();
  await square(page, 'weight sheet');
  await weight.getByRole('button', { name: 'Done' }).tap();
  await expect(weight).toHaveCount(0);
  await view.getByRole('button', { name: /^How to do/ }).first().tap();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await square(page, 'exercise info');
});

test('M10 Quick: the ideas and a picked idea', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/quick?min=30');
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await square(page, 'quick');
  await page.locator('[data-concept]').first().tap();
  await expect(page.getByTestId('deck-card')).toBeVisible();
  await square(page, 'quick deck');
});

test('M10 Run', async ({ page, context }) => {
  await openRun(page, context);
  await square(page, 'run');
});

test('M10 Settings', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await square(page, 'settings');
  // PLAN M14: the same screen as the You tab, and its sub screens.
  await page.goto('./#/');
  await page.getByTestId('tab-you').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await square(page, 'you tab');
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Gyms' })).toBeVisible();
  await square(page, 'you gyms');
  await page.getByTestId('gyms-list').getByRole('button').first().tap();
  await expect(page.getByTestId('edit-equipment')).toBeVisible();
  await square(page, 'you gym detail');
});

test.describe('M10 onboarding', () => {
  test.use({ intake: 'fresh' });
  test('M10 onboarding: every intake step to the reveal', async ({ page }) => {
    const step = async (name: string) => {
      await expect(page.getByTestId('intake')).toHaveAttribute('data-step', name);
      await square(page, `onboarding ${name}`);
    };
    const pick = (screen: string, value: string) => page.getByTestId(`q-${screen}-${value}`).tap();
    const next = () => page.getByTestId('intake-cta').locator('button[data-variant="primary"]').tap();
    const skip = () => page.getByTestId('skip').tap();
    await page.goto('./');
    await step('goal');
    await pick('goal', 'muscle');
    await next();
    await step('units');
    await page.getByTestId('units-weight').getByRole('radio', { name: 'lb', exact: true }).tap();
    await next();
    await step('focus');
    await pick('focus', 'balance');
    await next();
    await step('experience');
    await pick('experience', '3y');
    await step('days');
    await pick('days', '5');
    await step('weekdays');
    await pick('schedule', 'flexible');
    await next();
    await step('minutes');
    await pick('minutes', '60');
    await step('place');
    await pick('place', 'full');
    await step('equipment');
    await next();
    await step('style');
    await pick('style', 'mix');
    await step('cardio');
    await pick('cardio', 'little');
    await next();
    await step('easyOn');
    await skip();
    await step('exercises');
    await skip();
    await step('about');
    await skip();
    await step('reveal');
  });
});
