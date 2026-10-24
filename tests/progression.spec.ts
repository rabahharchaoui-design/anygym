import { expect, test, type Page } from './fixtures';

// "Last time" and "Next" on the set card from the progression engine (PLAN 1.9, SPEC 6).

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(450); // let springs settle
  await page.screenshot({ path: `reports/shots/1.9/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

/** SPEC 13.5: the set card never scrolls. */
const fits = async (page: Page) => {
  const { scrollHeight, clientHeight } = await page.getByRole('main').evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
};

const startQuick = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
};

const addSquat = async (page: Page) => {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  return page.getByTestId('exercise-barbell-back-squat');
};

test('last time and next: prefilled from the last workout, one tap to log', async ({ page }) => {
  const errors = watchErrors(page);
  await startQuick(page);
  let card = await addSquat(page);
  await expect(card.getByTestId('set-guide')).toHaveText('First time: pick a weight you could lift 2 more reps with');
  await expect(card.getByTestId('set-next')).toHaveCount(0);

  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await card.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  const log = page.getByTestId('action-bar').getByRole('button', { name: 'Log set · 10 × 185 lb' });
  await log.tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await expect(card.getByTestId('set-guide')).toHaveCount(0);
  await page.waitForTimeout(400); // a person, not a double tap
  await log.tap();
  await expect(card.getByTestId('set-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/#\/$/);

  await startQuick(page);
  card = await addSquat(page);
  await expect(card.getByTestId('set-guide')).toHaveText('Last time (today): 10 × 185 · 10 × 185 lb');
  await expect(card.getByTestId('set-next')).toHaveText('Next: 10 × 185 lb · Aim for 10, 10 or better');
  await expect(card.getByTestId('plate-total')).toHaveText('185lb');
  await expect(card.getByTestId('stepper-reps')).toHaveText('10');
  // Both lines stay one line each and the card still fits one screen (SPEC 13.5).
  for (const id of ['set-guide', 'set-next']) {
    expect((await card.getByTestId(id).boundingBox())!.height).toBeLessThanOrEqual(20);
  }
  await fits(page);
  await shot(page, 'last-time-next');

  // One tap logs the target.
  await page.getByTestId('action-bar').getByRole('button', { name: 'Log set · 10 × 185 lb' }).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await expect(card.getByTestId('set-row').first()).toContainText('10 × 185 lb');
  // The lines stay put after logging: no layout shift.
  await expect(card.getByTestId('set-guide')).toHaveText('Last time (today): 10 × 185 · 10 × 185 lb');
  await expect(card.getByTestId('set-next')).toBeVisible();
  await fits(page);
  await expect(page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ })).toBeInViewport({ ratio: 1 });
  await shot(page, 'after-log');
  expect(errors).toEqual([]);
});
