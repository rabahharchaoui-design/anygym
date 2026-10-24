import { expect, test } from './fixtures';

test('1.7a verify: hints persist, tap targets, double tap, reload, offline', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  const card = page.getByTestId('exercise-barbell-back-squat');
  await expect(page.getByTestId('hint')).toHaveCount(1);
  await expect(page.getByTestId('hint')).toHaveText('Tap plates to load the bar. We add it up.');
  await page.screenshot({ path: `reports/shots/1.7a/v-hint-${info.project.name.replace(/ /g, '-')}.png` });
  // all buttons on the card at least 48pt
  for (const b of await page.locator('main button, [data-testid=action-bar] button').all()) {
    if (!(await b.isVisible())) continue;
    const bb = (await b.boundingBox())!;
    const n = (await b.getAttribute('aria-label')) ?? (await b.textContent());
    expect.soft(bb.width, `w ${n}`).toBeGreaterThanOrEqual(47.5);
    expect.soft(bb.height, `h ${n}`).toBeGreaterThanOrEqual(47.5);
  }
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await page.reload();
  await expect(page.getByTestId('hint')).not.toHaveText('Tap plates to load the bar. We add it up.');
  await page.reload();
  await expect(page.getByText('Tap plates to load the bar')).toHaveCount(0);
  // offline + double tap Log set
  await context.setOffline(true);
  const log = page.getByTestId('action-bar').getByRole('button', { name: /^Log set/ });
  await log.dblclick();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(1);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
