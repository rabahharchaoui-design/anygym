import { allowConsoleErrors, expect, test, type Locator, type Page } from './fixtures';

// Other load inputs (PLAN 1.6, SPEC 5.2 / 5.3 / 5.5) on the hidden dev harness #/dev/loads.

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const open = async (page: Page) => {
  await page.goto('./?dev#/dev/loads');
  await expect(page.getByRole('heading', { level: 1, name: 'Loads' })).toBeVisible();
  await expect(page.getByTestId('section-dumbbell')).toBeVisible();
};

const section = (page: Page, id: string) => page.getByTestId(`section-${id}`);
const json = async (page: Page, id: string) => JSON.parse((await page.getByTestId(`json-${id}`).textContent())!);
const expectJson = async (page: Page, id: string, expected: unknown) =>
  expect.poll(() => json(page, id)).toEqual(expected);

const shot = async (target: Locator, name: string) => {
  if (test.info().project.name !== 'iPhone 15') return;
  await target.page().waitForTimeout(400); // let springs settle
  await target.screenshot({ path: `reports/shots/1.6/${name}.png` });
};

const typeOnPad = async (scope: Locator, text: string) => {
  for (const ch of text) await scope.getByRole('button', { name: ch === '.' ? 'Decimal point' : ch, exact: true }).tap();
};

test('dumbbell wheel: tap, double tap, and swipe to pick', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'dumbbell');
  await expectJson(page, 'dumbbell', null);
  await expect(s.getByTestId('picker-title')).toHaveText('Dumbbells · weight of one');
  await expect(s.getByText('You hold one in each hand', { exact: true })).toBeVisible();
  await expect(s.locator('[data-picture]')).toHaveCount(1); // one clean dumbbell, no stacked icons
  await expect(s.locator('[data-picture="dumbbell"]')).toBeVisible();

  await s.getByRole('option', { name: '30 lb', exact: true }).tap();
  await expectJson(page, 'dumbbell', { kind: 'dumbbell_each', unit: 'lb', total: 60 });
  await expect(s.getByTestId('wheel-total')).toHaveText('30lb');
  await expect(s.getByRole('option', { name: '30 lb', exact: true })).toHaveAttribute('aria-selected', 'true');

  // A double tap on a neighbour lands once on it.
  await s.getByRole('option', { name: '35 lb', exact: true }).dblclick();
  await expectJson(page, 'dumbbell', { kind: 'dumbbell_each', unit: 'lb', total: 70 });
  await expect(s.getByRole('option', { selected: true })).toHaveCount(1);

  // Swipe: scroll the wheel to 50 and let it settle.
  await page.waitForTimeout(600);
  await s.getByRole('listbox').evaluate((el) => {
    el.scrollLeft = 9 * 68; // 5, 10, ... 50 is index 9
  });
  await expectJson(page, 'dumbbell', { kind: 'dumbbell_each', unit: 'lb', total: 100 });
  await expect(s.getByTestId('wheel-total')).toHaveText('50lb');

  await s.getByRole('option', { name: '30 lb', exact: true }).tap();
  await expectJson(page, 'dumbbell', { kind: 'dumbbell_each', unit: 'lb', total: 60 });
  await shot(s, 'dumbbells');

  const box = (await s.getByRole('option', { name: '30 lb', exact: true }).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(errors).toEqual([]);
});

test('single weight: one weight, both hands', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'single');
  await s.scrollIntoViewIfNeeded();
  await expect(s.getByTestId('picker-title')).toHaveText('One weight · both hands');
  await expect(s.getByText('Goblet squat, kettlebell swing', { exact: true })).toBeVisible();
  await expect(s.locator('[data-picture="upright dumbbell"]')).toBeVisible();
  await expect(section(page, 'kettlebell').locator('[data-picture="kettlebell"]')).toBeVisible();
  await s.getByRole('option', { name: '35 lb', exact: true }).tap();
  await expectJson(page, 'single', { kind: 'single', unit: 'lb', total: 35 });
  await expect(s.getByTestId('wheel-total')).toHaveText('35lb');
  await shot(s, 'single-weight');
  expect(errors).toEqual([]);
});

test('stack: tap a pin, add weight, change the step', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'stack');
  await s.scrollIntoViewIfNeeded();
  const pins = s.getByRole('radio');
  await expect(pins.first()).toHaveAccessibleName('Pin at 5 lb');
  await pins.nth(2).tap();
  await expectJson(page, 'stack', { kind: 'stack', unit: 'lb', total: 15, stackValue: 15 });
  await expect(s.getByTestId('stack-total')).toHaveText('15lb');
  await expect(s.getByTestId('picker-title')).toHaveText('Machine · pick the pin');
  await expect(s.getByTestId('stack-sub')).toHaveText('Use the number next to the pin on the weight stack');
  await pins.nth(2).dblclick();
  await expectJson(page, 'stack', { kind: 'stack', unit: 'lb', total: 15, stackValue: 15 });
  await shot(s, 'stack');

  // "Add weight": a double tap leaves it on.
  const toggle = s.getByRole('button', { name: 'Add weight' });
  await toggle.dblclick();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await typeOnPad(s.getByRole('group', { name: 'Added weight on the pin' }), '5');
  await expectJson(page, 'stack', { kind: 'stack', unit: 'lb', total: 20, stackValue: 15, added: 5 });
  await expect(s.getByTestId('stack-sub')).toHaveText('15 pin + 5 added');
  await page.waitForTimeout(400); // past the double tap guard
  await toggle.tap();
  await expectJson(page, 'stack', { kind: 'stack', unit: 'lb', total: 15, stackValue: 15 });

  // First use step question: 10.
  await s.getByRole('button', { name: 'Steps of 5 · Change' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Weight steps' });
  await expect(sheet.getByText('Do the plates on this machine go up by 5, 10, or other?')).toBeVisible();
  await shot(sheet, 'stack-step-sheet');
  await sheet.getByRole('button', { name: 'Goes up by 10 lb' }).tap();
  await expect(sheet).toBeHidden();
  await expect(pins.first()).toHaveAccessibleName('Pin at 10 lb');
  await pins.nth(2).tap();
  await expectJson(page, 'stack', { kind: 'stack', unit: 'lb', total: 30, stackValue: 30 });
  await expect(s.getByRole('button', { name: 'Goes up by 10' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('plate machine: honest "+ start" until answered, then Plates only and a typed start', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'plate-machine');
  await s.scrollIntoViewIfNeeded();
  await expect(s.getByRole('img', { name: 'Machine horn' })).toBeVisible();
  await expect(s.getByTestId('picker-title')).toHaveText('Machine · plates per side');

  await s.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await s.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  // PLAN 2.0d: no math on screen; "— lb" and a plain note until the start is known.
  await expect(s.getByTestId('plate-total')).toHaveText('—lb');
  await expect(s.getByTestId('plate-total')).toHaveAttribute('data-math', '2 × (45 + 25) + start');
  await expect(s.getByTestId('plate-note')).toHaveText('Starting weight not set');
  await expectJson(page, 'plate-machine', null);
  await expect(s.locator('[data-plate]')).toHaveCount(2); // one horn, not two sleeves
  await shot(s, 'plate-machine-unknown');

  await s.getByRole('button', { name: 'Set starting weight' }).tap();
  let sheet = page.getByRole('dialog', { name: 'Starting weight' });
  await expect(sheet).toBeVisible();
  await shot(sheet, 'plate-machine-sheet');
  await sheet.getByRole('button', { name: 'Plates only' }).dblclick();
  await expect(sheet).toBeHidden();
  await expectJson(page, 'plate-machine', { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 0, perSide: [45, 25], collars: 0 });
  await expect(s.getByTestId('plate-total')).toHaveAttribute('data-math', '2 × (45 + 25) = 140 lb');
  await expect(s.getByTestId('plate-total')).toHaveText('140lb');
  await shot(s, 'plate-machine-plates-only');

  // Change it to a listed starting resistance of 110.
  await s.getByRole('button', { name: 'Plates only · Change' }).tap();
  sheet = page.getByRole('dialog', { name: 'Starting weight' });
  await typeOnPad(sheet, '110');
  await expect(sheet.getByTestId('equipment-typed')).toHaveText('110');
  await sheet.getByRole('button', { name: 'Save starting weight' }).tap();
  await expect(sheet).toBeHidden();
  await expect(s.getByTestId('plate-total')).toHaveAttribute('data-math', '110 start + 2 × (45 + 25) = 250 lb');
  await expectJson(page, 'plate-machine', { kind: 'plate_machine', unit: 'lb', total: 250, barWeight: 110, perSide: [45, 25], collars: 0 });
  await expect(s.getByRole('button', { name: 'Start 110 lb · Change' })).toBeVisible();

  // Saved to the gym: survives a reload.
  await page.reload();
  await expect(section(page, 'plate-machine').getByRole('button', { name: 'Start 110 lb · Change' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('bodyweight: your bodyweight, add weight 25', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'bodyweight');
  await s.scrollIntoViewIfNeeded();
  await expect(s.getByTestId('picker-title')).toHaveText('Your bodyweight');
  const toggle = s.getByRole('button', { name: 'Add weight' });
  await toggle.dblclick();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await typeOnPad(s.getByRole('group', { name: 'Added weight' }), '25');
  await expectJson(page, 'bodyweight', { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 });
  await expect(s.getByTestId('bodyweight-added')).toHaveText('+ 25 lb added');
  await shot(s, 'bodyweight-added');
  await page.waitForTimeout(400); // past the double tap guard
  await toggle.tap();
  await expectJson(page, 'bodyweight', { kind: 'bodyweight', unit: 'lb', total: 0 });
  await expect(s.getByTestId('bodyweight-added')).toHaveText('Just you');
  expect(errors).toEqual([]);
});

test('timed: start, hold 1.2 s, stop, reset; a double tap does not stop it', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'timed');
  await s.scrollIntoViewIfNeeded();
  await expect(s.getByTestId('timer-clock')).toHaveText('00:00');

  await s.getByRole('button', { name: 'Start timer' }).dblclick();
  await expect(s.getByRole('button', { name: 'Stop timer' })).toBeVisible();
  await page.waitForTimeout(1200);
  await s.getByRole('button', { name: 'Stop timer' }).tap();
  await expectJson(page, 'timed', { kind: 'timed', unit: 'lb', total: 0 });
  const { seconds } = JSON.parse((await page.getByTestId('json-timed-extra').textContent())!);
  expect(seconds).toBeGreaterThanOrEqual(1);
  await expect(s.getByTestId('timer-clock')).toHaveText(/^00:0[1-9]$/);
  await expect(s.getByRole('button', { name: 'Start again timer' })).toBeVisible();
  await shot(s, 'timed');

  await s.getByRole('button', { name: 'Reset' }).tap();
  await expect(s.getByTestId('timer-clock')).toHaveText('00:00');
  await expect.poll(async () => JSON.parse((await page.getByTestId('json-timed-extra').textContent())!).seconds).toBe(0);
  expect(errors).toEqual([]);
});

test('Smith first use: count plates only saves 0 to the gym', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const s = section(page, 'prompts');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: 'Smith' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Smith machine bar' });
  await expect(sheet.getByText('Enter the bar weight (usually on a sticker on the frame).')).toBeVisible();
  await shot(sheet, 'smith-sheet');
  await sheet.getByRole('button', { name: 'Count plates only' }).tap();
  await expect(sheet).toBeHidden();
  await expect.poll(async () => (await json(page, 'prompts')).bars.smith).toBe(0);
  expect((await json(page, 'prompts')).equipmentWeights.smith_machine).toEqual({ kind: 'plates_only', value: 0 });

  await s.getByRole('button', { name: 'EZ curl' }).tap();
  const ez = page.getByRole('dialog', { name: 'EZ curl bar' });
  await expect(ez.getByRole('button', { name: 'Save bar weight' })).toBeDisabled();
  await typeOnPad(ez, '25');
  await ez.getByRole('button', { name: 'Save bar weight' }).tap();
  await expect(ez).toBeHidden();
  await expect.poll(async () => (await json(page, 'prompts')).bars.ez_curl).toBe(25);
  expect(errors).toEqual([]);
});

test('no dumbbells at this gym: honest empty state', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('gyms', 'readwrite');
          const store = tx.objectStore('gyms');
          const all = store.getAll();
          all.onsuccess = () => {
            for (const g of all.result) store.put({ ...g, dumbbellRange: null });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  const s = section(page, 'dumbbell');
  await expect(s.getByText('No dumbbells set for this gym')).toBeVisible();
  await expect(s.getByRole('option')).toHaveCount(0);
  await expectJson(page, 'dumbbell', null);
  await shot(s, 'dumbbell-empty');
  await s.getByRole('link', { name: 'Set them in Settings' }).tap();
  await expect(page).toHaveURL(/#\/settings$/);
  expect(errors).toEqual([]);
});

// PLAN 1.7a: on G's iPhone the wheels showed an empty black box. The numbers must be painted
// from the first frame and the wheel must move with a swipe.
for (const id of ['dumbbell', 'single'] as const) {
  test(`${id} wheel shows its numbers and a swipe changes the pick`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page);
    const s = section(page, id);
    await s.scrollIntoViewIfNeeded();
    const list = s.getByRole('listbox');
    for (const w of ['5', '10', '15']) {
      const option = s.getByRole('option', { name: `${w} lb`, exact: true });
      await expect(option).toBeVisible();
      await expect(option).toHaveText(w);
      const box = (await option.boundingBox())!;
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      // Really painted: the label is inside the visible wheel, not clipped away.
      const wheel = (await list.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(wheel.x - 1);
    }
    // The visible text is not hidden by a mask or zero opacity.
    const style = await s.getByRole('option', { name: '5 lb', exact: true }).evaluate((el) => {
      const cs = getComputedStyle(el);
      const track = getComputedStyle(el.parentElement!);
      return { opacity: Number(cs.opacity), mask: track.maskImage || (track as unknown as { webkitMaskImage: string }).webkitMaskImage || 'none' };
    });
    expect(style.opacity).toBeGreaterThan(0.3);
    expect(style.mask).toBe('none');

    // Swipe: drag the wheel left by five weights; it picks the weight it settles on.
    await page.waitForTimeout(700); // let the first time hint settle
    const box = (await list.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 20 - 68 * 2.5, y, { steps: 6 });
    await page.mouse.move(box.x + box.width - 20 - 68 * 5, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => json(page, id), { timeout: 4000 }).not.toBeNull();
    const picked = await json(page, id);
    expect(picked.total).toBeGreaterThan(id === 'dumbbell' ? 10 : 5);
    await expect(s.getByRole('option', { selected: true })).toHaveCount(1);
    await expect(s.getByTestId('wheel-total')).not.toHaveText(/–/);
    expect(errors).toEqual([]);
  });
}

test('first time hints on the loads page: one at a time, each once', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const hint = page.getByTestId('hint');
  // Gate 2: an empty dumbbell wheel gives one instruction (the line under it), no bubble; the
  // wheel bubble waits until a weight is there.
  await expect(page.getByTestId('wheel-prompt').first()).toHaveText('Scroll to your dumbbell');
  await expect(hint).toHaveText('Tap the pin to pick the weight');
  await expect(hint).toHaveCount(1);
  await page.getByRole('heading', { level: 1, name: 'Loads' }).tap();
  await expect(hint).toHaveText('Tap plates to load the bar. Tap a sleeve to take one off.');
  await page.getByRole('heading', { level: 1, name: 'Loads' }).tap();
  await page.waitForTimeout(900);
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('section-dumbbell')).toBeVisible();
  await page.waitForTimeout(900);
  await expect(hint).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dev page error tools are there and quiet', async ({ page }) => {
  const errors = watchErrors(page);
  // The rejection below is provoked on purpose (documented allowlist, tests/fixtures.ts).
  allowConsoleErrors(/^(unhandledrejection|pageerror): (Error: )?test rejection$/);
  await open(page);
  await expect(page.getByTestId('dev-error-log')).toHaveText('No errors');
  await page.evaluate(() => setTimeout(() => Promise.reject(new Error('test rejection')), 0));
  await expect(page.getByTestId('dev-error-log')).toContainText('Unhandled rejection: Error: test rejection');
  // The deliberate rejection above is the only error.
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatch(/^pageerror: (Error: )?test rejection$/);
});
