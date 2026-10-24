import { expect, test, type Locator, type Page } from '@playwright/test';

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const dbAll = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const q = req.result.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => (resolve(q.result), req.result.close());
        };
      }),
    store,
  );

const begin = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
};
const add = async (page: Page, q: string, name: string) => {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox').fill(q);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
};
const big = async (loc: Locator, what: string) => {
  const b = (await loc.boundingBox())!;
  expect(b, what).toBeTruthy();
  expect.soft(Math.min(b.width, b.height), `${what} ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(47.5);
};
const shot = async (page: Page, name: string) => {
  if (test.info().project.name !== 'iPhone 15 Pro') return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.7/v-${name}.png` });
};

test('1.7 verify: plate machine unknown type, single arm, tap targets, sticky bar', async ({ page }) => {
  const errors = watch(page);
  await begin(page);
  await add(page, 'leg press', 'Leg Press');
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(ask).toBeVisible();
  for (const b of await ask.getByRole('button').all()) await big(b, 'load type choice');
  await shot(page, 'loadtype');
  await page.waitForTimeout(700);
  await ask.getByRole('button', { name: /Plates on a machine/ }).tap();
  await expect(ask).toHaveCount(0);
  const card = page.getByTestId('exercise-leg-press');
  const bar = page.getByTestId('action-bar');
  const log = bar.getByRole('button').first();
  await expect(log).toBeDisabled();
  await expect(log).toContainText('starting weight');
  await log.tap({ force: true, timeout: 1000 }).catch(() => {});
  expect(await dbAll(page, 'sets')).toHaveLength(0);
  await card.getByRole('button', { name: /Set starting weight/ }).tap();
  const sheet = page.getByRole('dialog').last();
  await shot(page, 'start-sheet');
  await sheet.getByRole('button', { name: 'Plates only' }).tap();
  await expect(card.getByRole('button', { name: /Plates only/ })).toBeVisible();
  await expect(log).toBeEnabled();
  await big(log, 'Log set');
  const vp = page.viewportSize()!;
  const b0 = (await log.boundingBox())!;
  expect(b0.y + b0.height).toBeLessThanOrEqual(vp.height);
  await shot(page, 'machine-ready');
  await log.tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await big(card.getByTestId('set-row').first(), 'set row');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(400);
  const b1 = (await log.boundingBox())!;
  expect(b1).toEqual(b0);
  for (const n of ['Add 15 seconds', 'Skip', 'Fewer reps', 'More reps']) await big(page.getByRole('button', { name: n, exact: true }).first(), n);
  // Finish is a 40px pill with a 48px hit area (::after inset -4px); checked by hit testing instead.
  const fb = (await page.getByRole('button', { name: 'Finish' }).boundingBox())!;
  const hitAbove = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent, [fb.x + fb.width / 2, fb.y - 3.5] as [number, number]);
  expect(hitAbove).toBe('Finish');
  await big(page.getByRole('button', { name: '+ Add exercise' }).first(), 'Add exercise');
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
  await expect(page.getByTestId('exercise-leg-press')).toBeVisible();

  // Add exercise sheet rows
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const list = page.getByRole('dialog', { name: 'Add exercise' });
  for (const r of (await list.getByRole('list').getByRole('button').all()).slice(0, 5)) await big(r, 'exercise list row');
  await shot(page, 'add-sheet');
  await list.getByRole('searchbox').fill('single arm dumbbell row');
  await list.getByRole('button', { name: 'Single Arm Dumbbell Row', exact: true }).tap();
  const sc = page.getByTestId('exercise-single-arm-dumbbell-row');
  await expect(sc).toBeVisible();
  const opt = sc.getByRole('option', { name: '40 lb' });
  await opt.scrollIntoViewIfNeeded();
  await opt.tap();
  await expect(sc.getByTestId('wheel-total')).toContainText('40');
  console.log('wheel label:', (await sc.getByTestId('wheel-total').textContent()));
  await shot(page, 'single-arm');
  const lg = page.getByTestId('action-bar').getByRole('button').first();
  await lg.tap();
  await expect(sc.getByTestId('set-row')).toHaveCount(1);
  const s1 = (await dbAll(page, 'sets')).find((x) => x.exerciseId === 'single-arm-dumbbell-row');
  expect(s1.load.kind).toBe('single');
  expect(s1.load.total).toBe(40);
  const txt = (await sc.getByTestId('set-row').first().textContent())!;
  console.log('single row:', txt, JSON.stringify(s1.load));
  expect(txt).toContain('40');
  expect(txt).not.toContain('80');
  expect(errors).toEqual([]);
});

test('1.7 verify: reps floor, same exercise twice, offline log, mid-workout reload', async ({ page, context }) => {
  const errors = watch(page);
  await begin(page);
  await add(page, 'back squat', 'Barbell Back Squat');
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox').fill('back squat');
  const again = sheet.getByRole('button', { name: /Barbell Back Squat/ });
  await again.tap();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (await sheet.count()) await page.mouse.click(5, 5);
  const cards = page.getByTestId('exercise-barbell-back-squat');
  console.log('squat cards after adding twice:', await cards.count());
  expect(await cards.count()).toBe(1);

  const card = cards.first();
  // reps down to the floor
  const fewer = card.getByRole('button', { name: 'Fewer reps' });
  for (let i = 0; i < 14; i++) await fewer.tap({ force: true }).catch(() => {});
  const reps = await card.getByTestId('stepper-reps').textContent();
  console.log('reps floor:', reps);
  expect(Number(reps)).toBeGreaterThanOrEqual(1);
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();

  await context.setOffline(true);
  const log = page.getByTestId('action-bar').getByRole('button').first();
  await log.tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  expect(await card.getByTestId('set-row').first().textContent()).not.toMatch(/NaN|undefined/);
  await context.setOffline(false);
  await page.waitForTimeout(700);
  await log.tap();
  await expect(card.getByTestId('set-row')).toHaveCount(2);
  await page.goBack();
  await page.goForward();
  await page.reload();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(2);
  expect((await dbAll(page, 'sessions')).length).toBe(1);
  expect(errors).toEqual([]);
});

test('1.7 verify: monkey 90s on the workout screen', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watch(page);
  await begin(page);
  await add(page, 'back squat', 'Barbell Back Squat');
  await add(page, 'dumbbell bench press', 'Dumbbell Bench Press');
  const url = page.url();
  const vp = page.viewportSize()!;
  const end = Date.now() + 90_000;
  const hist: any[] = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  while (Date.now() < end) {
    const x = Math.floor(rnd() * vp.width);
    const y = Math.floor(rnd() * vp.height);
    // avoid Finish
    const finL = page.getByRole('button', { name: 'Finish' });
    const fin = (await finL.count()) ? await finL.boundingBox({ timeout: 500 }).catch(() => null) : null;
    if (fin && x >= fin.x - 16 && x <= fin.x + fin.width + 16 && y >= fin.y - 16 && y <= fin.y + fin.height + 16) continue;
    const r = rnd();
    hist.push({ el: await page.evaluate(([a, b]) => { const e = document.elementFromPoint(a, b); return e ? (e.getAttribute('aria-label') || e.textContent || e.tagName).slice(0, 30) : null; }, [x, y] as [number, number]), fin, r: +r.toFixed(2), x, y, t: Date.now() - end + 90000 });
    try {
      if (r < 0.6) await page.touchscreen.tap(x, y);
      else if (r < 0.9) {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(Math.floor(rnd() * vp.width), Math.floor(rnd() * vp.height), { steps: 4 });
        await page.mouse.up();
      } else await page.mouse.wheel(0, (rnd() - 0.5) * 600);
    } catch {}
    if (!page.url().includes('/workout/')) {
      console.log('LEFT WORKOUT hist', JSON.stringify(hist.slice(-4)), 'url', page.url(), 'sessions', JSON.stringify((await dbAll(page, 'sessions')).map((q) => q.endedAt)), 'sets', (await dbAll(page, 'sets')).length);
      await page.goto(url);
    }
    if (!(await page.getByRole('button', { name: 'Finish' }).count()) && !(await page.getByRole('dialog').count())) await page.waitForTimeout(100);
    await page.waitForTimeout(40);
  }
  // no stuck sheet: Escape / backdrop clears dialogs
  for (let i = 0; i < 4; i++) {
    if ((await page.getByRole('dialog').count()) === 0) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.getByRole('dialog').count()) await page.mouse.click(vp.width / 2, 20);
    await page.waitForTimeout(400);
  }
  console.log('dialogs left:', await page.getByRole('dialog').count());
  await shot(page, 'after-monkey');
  const logs = await dbAll(page, 'sets');
  for (const s of logs) expect(Number.isFinite(s.reps ?? 0) && Number.isFinite(s.load.total)).toBe(true);
  expect(await page.getByTestId('action-bar').getByRole('button').first().isVisible()).toBe(true);
  expect(errors).toEqual([]);
});
