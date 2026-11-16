// PLAN 3.7b (gate critic 2 and 4): a brand new lifter who picks focus areas keeps a machines first
// plan, and the coach tip on a plan says only what is true and what Apply does.
import { test, expect, type Page } from './fixtures';
import { dbAll } from './workout-helpers';

const step = (page: Page, name: string) => expect(page.getByTestId('intake')).toHaveAttribute('data-step', name);
const next = (page: Page) => page.getByTestId('intake-cta').getByRole('button', { name: 'Continue', exact: true }).tap();
const pick = (page: Page, screen: string, value: string) => page.getByTestId(`q-${screen}-${value}`).tap();
const skip = (page: Page) => page.getByTestId('skip').tap();
async function part(page: Page, area: string, id: string) {
  await pick(page, 'focus', area);
  const sheet = page.getByRole('dialog', { name: / focus$/ });
  await expect(sheet).toBeVisible();
  await sheet.getByTestId(`focus-part-${id}`).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).not.toBeVisible();
}

test.describe('a new person', () => {
test.use({ intake: 'fresh' });
test('(2) brand new, full gym, 3 days, Lats and Biceps picked: machines first, none of the four barbell and bar moves, never two curls of one kind on a day', async ({ page }) => {
  await page.goto('./');
  await step(page, 'goal'); await pick(page, 'goal', 'muscle'); await next(page);
  await step(page, 'units'); await next(page); await step(page, 'focus');
  await part(page, 'back', 'lats');
  await part(page, 'arms', 'biceps');
  await next(page); await step(page, 'experience'); await pick(page, 'experience', 'new');
  await step(page, 'days'); await pick(page, 'days', '3'); await step(page, 'weekdays');
  await pick(page, 'schedule', 'flexible');
  await next(page); await step(page, 'minutes'); await pick(page, 'minutes', '45');
  await step(page, 'place'); await pick(page, 'place', 'full'); await step(page, 'equipment'); await next(page);
  await step(page, 'style'); await pick(page, 'style', 'mix'); await step(page, 'cardio'); await pick(page, 'cardio', 'little'); await next(page);
  await step(page, 'easyOn'); await skip(page); await step(page, 'about'); await skip(page); await step(page, 'reveal');
  await page.getByTestId('reveal-cta').getByRole('button', { name: 'Looks good', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const planId = await expect.poll(async () => (await dbAll<{ planId: string }>(page, 'planState'))[0]?.planId).toBeTruthy().then(async () => (await dbAll<{ planId: string }>(page, 'planState'))[0]!.planId);
  expect(planId).toMatch(/^mine-/);
  await page.goto(`./#/plans/${planId}`);
  const main = page.locator('main');
  await expect(main).toContainText('Smith Machine Squat');
  await expect(main).toContainText('Lat Machine Wide Grip Pulldown');
  for (const bad of ['Barbell Back Squat', 'Wide Grip Pull Up', 'Barbell Bent Over Row', 'Barbell Bicep Curl', 'EZ-Bar Curl']) await expect(main).not.toContainText(bad);
  // "Deadlift" alone (the Smith machine stiff legged one is the beginner's hinge).
  expect((await main.innerText()).split('\n').map((l) => l.trim())).not.toContain('Deadlift');
  // (4) on this plan: shoulders are trained on two days, so no tip says they get one session a week.
  const toggle = page.getByTestId('coach-tips-toggle');
  if (await toggle.count()) {
    await toggle.tap();
    await expect(page.getByTestId('coach-tips')).not.toContainText(/Shoulders get one session a week/);
  }
});
});

test('(4) the frequency tip says what is true and what Apply does', async ({ page }) => {
  await page.goto('./');
  await page.goto('./#/plans/five-day-split');
  await page.getByTestId('coach-tips-toggle').tap();
  const tip = page.getByTestId('tip-freq');
  // Other days train some of these lightly, so it is one full session, and the why says what full means.
  await expect(tip).toContainText('Chest, back, shoulders and hamstrings get one full session a week');
  await expect(tip).toContainText('Adds 3 sets of each on another day, same split.');
  // One move: "of it" (the six week plan adds one hamstring exercise).
  await page.goto('./#/plans/six-week-volume');
  await page.getByTestId('coach-tips-toggle').tap();
  await expect(page.getByTestId('tip-freq')).toContainText('Hamstrings get one session a week');
  await expect(page.getByTestId('tip-freq')).toContainText('of it on another day, same split.');
  await expect(page.getByTestId('tip-freq')).not.toContainText('of each');
});
