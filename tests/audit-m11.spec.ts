import { expect, test, type Page } from './fixtures';
import { DEVICE, note, shot } from './helpers/auditShot';

// PLAN M11 (1): a screenshot of every screen and menu as the app is now, on the iPhone 15 Pro
// (the "iPhone 15" project, 393 x 852) and the iPhone SE (375 x 667). One test per screen group.
// On demand: M11=1 PW_NO_BUILD=1 PW_PORT=4195 npx playwright test tests/audit-m11.spec.ts -g <group>
test.beforeEach(() => {
  test.skip(!process.env.M11 || !DEVICE[test.info().project.name], 'audit run only');
});

const primary = (page: Page) => page.getByTestId('intake-cta').locator('button[data-variant="primary"]');

test.describe('fresh phone', () => {
  test.use({ intake: 'fresh' });
  test('onboarding', async ({ page }) => {
    const G = 'onboarding';
    const step = (s: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', s);
    const pick = (screen: string, v: string) => page.getByTestId(`q-${screen}-${v}`).tap();
    await page.goto('./');
    await step('goal');
    await shot(page, G, '01-goal', 'fresh phone, open #/: "What\'s your main goal?"');
    await pick('goal', 'muscle');
    await shot(page, G, '02-goal-picked', 'goal step, tap Build muscle');
    await primary(page).tap();
    await step('units');
    await shot(page, G, '03-units', 'tap Continue after goal');
    await page.getByTestId('units-weight').getByRole('radio', { name: 'lb', exact: true }).tap();
    await primary(page).tap();
    await step('focus');
    await shot(page, G, '04-focus', 'units, Continue: "What do you want to work on?"');
    await pick('focus', 'back');
    const sheet = page.getByRole('dialog', { name: / focus$/ });
    if (await sheet.isVisible().catch(() => false)) {
      await shot(page, G, '05-focus-parts-sheet', 'focus step, tap Back tile: body parts sheet');
      await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
      await expect(sheet).not.toBeVisible();
    } else note('onboarding/05-focus-parts-sheet not shown for back');
    await shot(page, G, '06-focus-picked', 'focus step with Back picked');
    await primary(page).tap();
    await step('experience');
    await shot(page, G, '07-experience', 'focus, Continue');
    await pick('experience', '3y');
    await step('days');
    await shot(page, G, '08-days', 'experience, tap 3 years: days per week');
    await pick('days', '5');
    await step('weekdays');
    await shot(page, G, '09-schedule', 'days, tap 5: schedule style');
    await pick('schedule', 'fixed');
    await shot(page, G, '10-weekdays-fixed', 'schedule, tap Same days each week: weekday chips');
    await pick('schedule', 'flexible');
    await primary(page).tap();
    await step('minutes');
    await shot(page, G, '11-minutes', 'schedule flexible, Continue');
    await pick('minutes', '60');
    await step('place');
    await shot(page, G, '12-place', 'minutes, tap 60');
    await pick('place', 'full');
    await step('equipment');
    await shot(page, G, '13-equipment', 'place, tap Full gym', true);
    await primary(page).tap();
    await step('style');
    await shot(page, G, '14-style', 'equipment, Continue');
    await pick('style', 'mix');
    await step('cardio');
    await shot(page, G, '15-cardio', 'style, tap mix');
    await pick('cardio', 'little');
    await primary(page).tap();
    await step('easyOn');
    await shot(page, G, '16-easy-on', 'cardio, Continue: easy on (joints)');
    await page.getByTestId('skip').tap();
    await step('exercises');
    await shot(page, G, '17-exercises-deck', 'easy on, Skip: exercises deck');
    await page.getByTestId('skip').tap();
    await step('about');
    await shot(page, G, '18-about-you', 'exercises, Skip: about you', true);
    await page.getByTestId('skip').tap();
    await step('reveal');
    await shot(page, G, '19-reveal', 'about, Skip: plan reveal', true);
    await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
    await expect(page).toHaveURL(/#\/$/);
    await shot(page, G, '20-first-today', 'reveal, Looks good: first Today with the welcome tour step 1');
    for (const n of [2, 3]) {
      const next = page.getByRole('button', { name: 'Next', exact: true });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.tap();
      await shot(page, G, `2${n - 1}-welcome-tour-${n}`, `first Today, tour Next x${n - 1}`);
    }
    note('onboarding: no separate welcome screen exists; the first screen is the goal question, and a 3 step welcome tour shows on first Today');
  });
});
