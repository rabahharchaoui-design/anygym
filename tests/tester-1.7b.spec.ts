import { expect, test, type Page } from './fixtures';

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

test('tester: glossary entry shots + tap targets', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./?dev#/dev/info');
  await page.waitForTimeout(500);
  const entries = page.locator('[data-testid^="entry-"]');
  const n = await entries.count();
  for (let i = 0; i < n; i++) {
    const e = entries.nth(i);
    const id = (await e.getAttribute('data-testid'))!.replace('entry-', '');
    await e.scrollIntoViewIfNeeded();
    if (test.info().project.name === 'iPhone 15') await e.screenshot({ path: `reports/shots/1.7b/glossary/${id}.png` });
    const b = (await e.getByRole('button').first().boundingBox())!;
    expect(b.width, id).toBeGreaterThanOrEqual(48);
    expect(b.height, id).toBeGreaterThanOrEqual(48);
  }
  expect(errors).toEqual([]);
});

test('tester: info open/close x10 by scrim and Got it, double tap', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./?dev#/dev/info');
  const btn = page.getByTestId('entry-smith-machine').getByRole('button', { name: 'What is Smith machine?' });
  for (let i = 0; i < 10; i++) {
    await btn.scrollIntoViewIfNeeded();
    await btn.tap();
    const sheet = page.getByRole('dialog', { name: 'Smith machine', exact: true });
    await expect(sheet).toBeVisible();
    if (i % 2) await sheet.getByRole('button', { name: 'Got it' }).tap();
    else {
      const vp = page.viewportSize()!;
      await page.mouse.click(vp.width / 2, 20);
    }
    await expect(sheet).toHaveCount(0);
  }
  await btn.dblclick();
  await page.waitForTimeout(600);
  expect(await page.getByRole('dialog').count()).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('tester: plate labels under bar', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./?dev#/dev/plates');
  await page.waitForTimeout(500);
  console.log('PLATES TEXT:\n' + (await page.locator('body').innerText()).slice(0, 1500));
  expect(errors).toEqual([]);
});

test('tester: plates presets labels + math', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./?dev#/dev/plates');
  await page.waitForTimeout(400);
  for (const t of ['135 lb', '185 lb', '315 lb']) {
    await page.getByRole('button', { name: t, exact: true }).tap();
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => {
      const right = [...document.querySelectorAll('[data-testid="remove-right"] > *, [data-testid="remove-right"] g')];
      const under = [...document.querySelectorAll('[data-under-label]')].map((e) => `${e.getAttribute('data-count')}:${e.textContent}`);
      const svgText = [...document.querySelectorAll('[data-testid="plate-svg"] text')].map((e) => e.textContent);
      return { under, svgText, right: right.length };
    });
    const m = await page.getByTestId('plate-math').innerText();
    console.log(test.info().project.name, t, '| math:', m, '|', JSON.stringify(info));
    if (test.info().project.name === 'iPhone 15') await page.screenshot({ path: `reports/shots/1.7b/plates-${t.replace(' ', '-')}.png` });
  }
  expect(errors).toEqual([]);
});

test('tester: pickers, no held/stack labels, stretch, reload, double tap', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  // PLAN 1.7c: the empty quick workout opens the picker; "Add 1" opens the exercise view.
  const add = async (q: string, name: string) => {
    const sheet = page.getByRole('dialog', { name: 'Add exercise' });
    await expect(page.getByTestId('workout-title')).toBeVisible();
    if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
    await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(q);
    await sheet.getByRole('button', { name, exact: true }).tap();
    await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
  };
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await add('quadricep', 'Static Quadricep Stretch');
  if (await ask.isVisible().catch(() => false)) {
    console.log('STRETCH ASKED LOAD TYPE:', await ask.innerText());
    const b = await ask.getByRole('button').allInnerTexts();
    console.log('options', b);
  }
  await page.waitForTimeout(500);
  console.log('STRETCH SCREEN:\n' + (await page.locator('main').innerText()));
  console.log('timer-clock count', await page.getByTestId('timer-clock').count());
  const titles = await page.locator('[data-testid="picker-title"]:visible').allInnerTexts();
  console.log('titles', titles);
  if (test.info().project.name === 'iPhone 15') await page.screenshot({ path: 'reports/shots/1.7b/stretch.png' });
  // scan all text + aria for old labels
  const all = await page.evaluate(() => [...document.querySelectorAll('body *')].flatMap((e) => [e.children.length === 0 ? e.textContent ?? '' : '', e.getAttribute('aria-label') ?? '']).filter(Boolean));
  const bad = all.filter((t) => /^(held|stack|each hand|\+ added.*)$/i.test(t.trim()));
  expect(bad).toEqual([]);
  // reload mid workout
  await page.reload();
  await page.waitForTimeout(600);
  console.log('AFTER RELOAD main:', (await page.locator('main').innerText()).slice(0, 300));
  // The timed exercise view: the hold timer, no weight picker.
  await expect(page.getByTestId('exercise-static-quadricep-stretch').getByRole('button', { name: 'Start timer' })).toBeVisible();
  await expect(page.getByTestId('weight-cell')).toHaveCount(0);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
});
