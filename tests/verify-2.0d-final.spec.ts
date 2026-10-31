import { expect, test, type Page } from './fixtures';
import { exerciseView, quickWith } from './workout-helpers';

// Tester audit, 2.0d final round: the six claimed fixes, independent of the builder's spec.
const SHOTS = 'reports/shots/2.0d/verify';
const NAMES: Record<string, string> = { 'leg-press': 'Leg Press', 'smith-machine-upright-row': 'Smith Machine Upright Row', 'barbell-back-squat': 'Barbell Back Squat' };
const errs = (page: Page) => {
  const e: string[] = [];
  page.on('console', (m) => m.type() === 'error' && e.push(m.text()));
  page.on('pageerror', (x) => e.push(x.message));
  return e;
};
const dev = () => test.info().project.name.replace(/ /g, '-');
const bodyFits = (page: Page) =>
  page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')!;
    const all = [dlg, ...dlg.querySelectorAll<HTMLElement>('*')].filter((e) => (e as HTMLElement).scrollHeight > (e as HTMLElement).clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
    return all.map((e) => `${e.className}:${(e as HTMLElement).scrollHeight}>${(e as HTMLElement).clientHeight}`);
  });
const tray = (page: Page) => page.getByRole('dialog').getByRole('group', { name: 'Plates' });
const trayVisible = async (page: Page) => {
  const b = (await tray(page).boundingBox())!;
  const done = (await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).boundingBox())!;
  expect(b.y + b.height, 'tray bottom above Done').toBeLessThanOrEqual(done.y + 0.5);
  expect(done.y + done.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
};

test.describe('2.0d final verify @matrix', () => {
  test('1+2+5+6: horn, Smith, barbell sheets fit; horn total + start; chips label; bar link name', async ({ page }) => {
    test.skip(!['iPhone SE', '320 floor', 'iPhone 15'].includes(test.info().project.name));
    const e = errs(page);
    await quickWith(page, [['leg press', 'Leg Press'], ['smith', 'Smith Machine Upright Row'], ['back squat', 'Barbell Back Squat']]);
    const open = async (id: string) => {
      const back = page.getByRole('button', { name: 'Back to the list' });
      if (await back.isVisible()) await back.tap();
      await page.getByText(NAMES[id]!, { exact: true }).first().tap();
      await exerciseView(page, id).getByTestId('weight-cell').first().tap();
      const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
      await expect(sheet).toHaveAttribute('data-state', 'open');
      await page.waitForTimeout(450);
      return sheet;
    };
    const close = async () => {
      await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: 'Pick the weight' })).toHaveCount(0);
    };
    const ids = await page.locator('[data-testid^="exercise-"]').evaluateAll((els) => els.map((x) => x.getAttribute('data-testid')));
    console.log('exercise ids', JSON.stringify(ids));
    // Horn.
    let sheet = await open('leg-press');
    await expect(sheet.getByTestId('start-question')).toBeVisible();
    expect(await bodyFits(page), 'horn q scroll').toEqual([]);
    for (let i = 0; i < 4; i++) await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).dispatchEvent('click');
    await page.waitForTimeout(450);
    const total = sheet.getByTestId('plate-total');
    await expect(total).toHaveText('360lb');
    await expect(sheet.getByTestId('plate-note')).toHaveText('+ start');
    const aria0 = await total.getAttribute('aria-label');
    console.log('ARIA before', aria0, '| math', await total.getAttribute('data-math'));
    expect(aria0).toContain('360');
    expect(aria0).toMatch(/total not known|start/i);
    expect(await bodyFits(page), 'horn q plates scroll').toEqual([]);
    await trayVisible(page);
    await page.screenshot({ path: `${SHOTS}/horn-question-${dev()}.png` });
    // Answer with a real start weight.
    await sheet.getByRole('button', { name: 'Set starting weight' }).first().tap();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/horn-setstart-${dev()}.png` });
    const sd = page.getByRole('dialog', { name: 'Starting weight' });
    await expect(sd).toBeVisible();
    for (const ch of '50') await sd.getByRole('button', { name: ch, exact: true }).tap();
    await sd.getByRole('button', { name: 'Save starting weight' }).tap();
    await expect(sd).toHaveCount(0);
    await page.waitForTimeout(450);
    const total2 = sheet.getByTestId('plate-total');
    console.log('AFTER start total', JSON.stringify(await total2.innerText()), 'aria', await total2.getAttribute('aria-label'), 'math', await total2.getAttribute('data-math'), 'note count', await sheet.getByTestId('plate-note').count());
    await expect(total2).toHaveText('410lb');
    await expect(sheet.getByText('+ start')).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/horn-answered-${dev()}.png` });
    expect(await bodyFits(page), 'horn answered scroll').toEqual([]);
    await trayVisible(page);
    // Smith.
    await close();
    sheet = await open('smith-machine-upright-row');
    await expect(sheet.getByTestId('bar-question')).toBeVisible();
    expect(await bodyFits(page), 'smith scroll').toEqual([]);
    await page.screenshot({ path: `${SHOTS}/smith-${dev()}.png` });
    await close();
    // Barbell.
    sheet = await open('barbell-back-squat');
    await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).dispatchEvent('click');
    await page.waitForTimeout(450);
    expect(await bodyFits(page), 'barbell scroll').toEqual([]);
    await trayVisible(page);
    const link = sheet.getByRole('button', { name: 'Change bar, Olympic 45 lb', exact: true });
    await expect(link).toBeVisible();
    const lb = (await link.boundingBox())!;
    expect(lb.height, 'bar link height').toBeGreaterThanOrEqual(44);
    // Chips keep a label.
    const chipsText = await sheet.getByTestId('plate-chips').innerText();
    console.log('chips text', JSON.stringify(chipsText), dev());
    expect(chipsText).toMatch(/Each/);
    for (let i = 0; i < 6; i++) await sheet.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }).dispatchEvent('click');
    await page.waitForTimeout(450);
    const chips2 = await sheet.getByTestId('plate-chips').innerText();
    console.log('chips text full', JSON.stringify(chips2));
    expect(chips2).toMatch(/Each/);
    await page.screenshot({ path: `${SHOTS}/barbell-${dev()}.png` });
    expect(e).toEqual([]);
  });

  test('4: sleeve full hint hides after ~1.5s, at once on add / remove / Clear', async ({ page }) => {
    test.skip(!['iPhone SE', '320 floor'].includes(test.info().project.name));
    await page.goto('./?dev#/dev/plates?dev&unit=lb&load=700&nohint');
    await expect(page.getByTestId('plate-total')).toHaveText('700lb');
    const full = page.getByTestId('sleeve-full');
    const add = page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
    await add.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    const t0 = Date.now();
    await page.screenshot({ path: `${SHOTS}/sleeve-full-${dev()}.png` });
    await expect(full).toHaveText('', { timeout: 4000 });
    const dt = Date.now() - t0;
    console.log('sleeve-full visible ms', dt);
    expect(dt).toBeGreaterThan(1000);
    expect(dt).toBeLessThan(2600);
    // 45 again, then 2.5: a successful add hides it at once
    await add.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    await page.getByRole('button', { name: 'Add 2.5 lb plate to each side', exact: true }).dispatchEvent('click');
    console.log('after 2.5 add:', await full.innerText());
    // remove
    await add.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    await page.getByTestId('remove-right').dispatchEvent('click');
    await expect(full).toHaveText('', { timeout: 300 });
    // clear while shown
    await add.dispatchEvent('click');
    await add.dispatchEvent('click');
    await expect(full).toHaveText('Sleeve is full');
    await page.getByRole('button', { name: 'Clear', exact: true }).dispatchEvent('click');
    await expect(full).toHaveText('', { timeout: 300 });
  });

  for (const gym of ['lb', 'kg'] as const) {
    test(`3: import editor shows the file's own words in a ${gym} gym`, async ({ page }) => {
      test.skip(!['iPhone SE', '320 floor'].includes(test.info().project.name));
      const e = errs(page);
      const file = JSON.stringify({
        format: 'anygym-import-v1',
        unit: 'lb',
        exercises: [
          { name: 'Squats', planExercise: 'Barbell Back Squat', loadType: 'barbell_per_side', sessions: [{ sets: [{ reps: 5, weight: 225, uncertain: true }] }] },
          { name: 'Curl', planExercise: 'Barbell Bicep Curl', loadType: 'fixed_bar_total', sessions: [{ sets: [{ reps: 8, weight: 85 }] }] },
          { name: 'Leg press', planExercise: 'Leg Press', loadType: 'plate_machine_per_side', sessions: [{ sets: [{ reps: 10, weight: 90, uncertain: true }] }] },
        ],
      });
      await page.goto('./#/settings');
      if (gym === 'kg') {
        await page.getByRole('radio', { name: 'kg', exact: true }).tap();
        await expect(page.getByRole('radio', { name: 'kg', exact: true })).toBeChecked();
      }
      await page.getByTestId('import-file').setInputFiles({ name: 'v.json', mimeType: 'application/json', buffer: Buffer.from(file) });
      await expect(page).toHaveURL(/#\/settings\/import$/);
      const n = await page.getByTestId('import-set').count();
      console.log('import sets', n);
      const want = ['5 reps · 225 lb per side', '8 reps · 85 lb total', '10 reps · 90 lb per side'];
      for (let i = 0; i < n; i++) {
        if (i === 0) await page.waitForTimeout(100);
        console.log('import-set states', await page.getByTestId('import-set').evaluateAll((els) => els.map((e) => `${(e as HTMLButtonElement).disabled}|${e.getAttribute('data-uncertain')}|${(e.textContent ?? '').trim()}`)));
        await page.getByTestId('import-set').nth(i).tap(); await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/dbg-${gym}-${i}.png` }); console.log('dialogs', JSON.stringify(await page.getByRole('dialog').evaluateAll((d) => d.map((x) => x.getAttribute('aria-label') + '/' + x.getAttribute('data-state')))));
        const sheet = page.getByRole('dialog', { name: 'Check this set' });
        await expect(sheet).toHaveAttribute('data-state', 'open');
        await page.waitForTimeout(450);
        const txt = await sheet.getByTestId('import-file-reps').innerText();
        console.log(`${gym} set ${i}:`, JSON.stringify(txt));
        expect(txt.replace(/\s+/g, ' ')).toBe(`In your file: ${want[i]}`);
        if (test.info().project.name === '320 floor') console.log(`FIT ${gym} set ${i}:`, JSON.stringify(await bodyFits(page)));
        await page.screenshot({ path: `${SHOTS}/import-${gym}-${i}-${dev()}.png` });
        await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
        await expect(sheet).toHaveCount(0);
      }
      expect(e).toEqual([]);
    });
  }
});
