import { expect, test, type Page, guardContext } from './fixtures';
import { solvePlates } from '../src/lib/load';

// Plate diagram (PLAN 1.5, SPEC 5.3 / 5.4) on the hidden dev harness.

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const open = async (page: Page) => {
  await page.goto('./?dev#/dev/plates');
  await expect(page.getByRole('heading', { level: 1, name: 'Plates' })).toBeVisible();
};

const tray = (page: Page, label: string) => page.getByRole('button', { name: `Add ${label} plate to each side` });
const plates = (page: Page, side: 'left' | 'right') => page.locator(`[data-plate][data-side="${side}"]`);
const math = (page: Page) => page.getByTestId('plate-math');

/** Every plate a side's drawing stands for (a fat "×3" plate stands for three, 2.0b). */
const covered = (page: Page, side: 'left' | 'right') =>
  plates(page, side).evaluateAll((els) => els.flatMap((e) => (e.getAttribute('data-weights') ?? '').split(',').filter(Boolean).map(Number)));
const plateCount = async (page: Page, side: 'left' | 'right') => (await covered(page, side)).length;

const expectPerSide = async (page: Page, weights: number[]) => {
  for (const side of ['left', 'right'] as const) {
    await expect.poll(() => covered(page, side)).toEqual(weights);
  }
};

const longPress = async (page: Page, label: string) => {
  await tray(page, label).scrollIntoViewIfNeeded();
  const box = (await tray(page, label).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
};

const typeIt = async (page: Page, text: string) => {
  await page.getByRole('button', { name: 'Type it' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Type a weight' });
  await expect(sheet).toBeVisible();
  for (const ch of text) await sheet.getByRole('button', { name: ch === '.' ? 'Decimal point' : ch, exact: true }).tap();
  await expect(sheet.getByTestId('typed')).toHaveText(text);
  return sheet;
};

const shot = async (page: Page, name: string, project: string) => {
  if (project === 'iPhone SE' || project === 'iPhone 17 Pro Max') {
    // PLAN 1.7a: the realistic bar on the smallest and largest phones.
    await page.waitForTimeout(450); // let the springs settle
    await page.getByTestId('hint').waitFor({ state: 'detached' }).catch(() => {});
    await page.screenshot({ path: `reports/shots/1.7a/bar-${name}-${project.replace(/ /g, '-')}.png` });
    return;
  }
  if (project !== 'iPhone 15') return;
  await page.waitForTimeout(450); // let the springs settle
  await page.screenshot({ path: `reports/shots/1.5/${name}.png` });
};

/** SPEC 5.6: every weight label is horizontal and upright, the bar has its real parts. */
const expectRealBar = async (page: Page) => {
  const svg = page.getByTestId('plate-svg');
  expect(await svg.locator('text[transform*="rotate"]').count()).toBe(0);
  expect(await svg.locator('pattern[id$="-knurl"]').count()).toBe(1);
  expect(await svg.locator('linearGradient[id$="-chrome"]').count()).toBe(1);
  // Every plate is named on its own face (2.0b fat numbered plates): no label row under the bar.
  expect(await svg.locator('[data-under-label]').count()).toBe(0);
  const naming = () =>
    page.evaluate(() => {
      const right = [...document.querySelectorAll('[data-plate][data-side="right"]')];
      return right.every((e) => {
        // The overflow marker prints every weight it stands for, stacked (2.0b round 3).
        if (e.hasAttribute('data-more')) return (e.getAttribute('aria-label') ?? '').startsWith('then ') && !!e.getAttribute('data-lines');
        const face = e.querySelector('[data-face]')?.textContent ?? '';
        const badge = e.querySelector('[data-badge]')?.textContent ?? '';
        return e.getAttribute('data-label') === (badge ? `${badge.slice(1)}×${face}` : face);
      })
        ? 'ok'
        : right.map((e) => e.getAttribute('data-label')).join();
    });
  await expect.poll(naming).toBe('ok');
};

// Note: the brief listed taps "45, 45, 25" with 3 plates per side, but a tap adds one plate to
// EACH side (SPEC 5.3), so 185 = 45 bar + 2 × (45 + 25) is two taps and two plates per side.
// The test follows the math, which is the non negotiable.
test('tap adds a pair, tap the bar removes the outermost, long press adds two per side', async ({ page }) => {
  const errors = watchErrors(page);
  const project = test.info().project.name;
  await open(page);
  await expect(page.getByTestId('plate-total')).toHaveText('45lb');
  await expect(math(page)).toHaveText('45 bar = 45 lb');

  await tray(page, '45 lb').tap();
  await expect(math(page)).toHaveText('45 bar + 2 × 45 = 135 lb');
  await tray(page, '25 lb').tap();
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 25) = 185 lb');
  await expect(page.getByTestId('plate-total')).toHaveText('185lb');
  await expectPerSide(page, [45, 25]);

  // A heavier plate added later goes innermost, identical on both sides.
  await tray(page, '45 lb').tap();
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 45 + 25) = 275 lb');
  await expectPerSide(page, [45, 45, 25]);

  // Tap the outermost plate on the bar: the 25 comes off both sides.
  await expect(page.getByTestId('remove-right')).toHaveAttribute('aria-label', 'Remove outermost 25 lb plate');
  await plates(page, 'right').last().tap();
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 45) = 225 lb');
  await expectPerSide(page, [45, 45]);
  await plates(page, 'left').first().tap(); // any plate on the bar takes the outermost off
  await expect(math(page)).toHaveText('45 bar + 2 × 45 = 135 lb');
  await expectPerSide(page, [45]);

  // Long press 10: two more per side.
  await longPress(page, '10 lb');
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 10 + 10) = 175 lb');
  await expectPerSide(page, [45, 10, 10]);

  // Clear empties the bar.
  await page.getByRole('button', { name: 'Clear' }).tap();
  await expectPerSide(page, []);
  await expect(math(page)).toHaveText('45 bar = 45 lb');

  // Plate buttons are big thumb targets.
  const box = (await tray(page, '2.5 lb').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(project).toBeTruthy();
  expect(errors).toEqual([]);
});

test('Type it solves exact and closest', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);

  let sheet = await typeIt(page, '315');
  await expect(sheet.getByTestId('solve-result')).toContainText('Exact');
  await expect(sheet.getByTestId('solve-result')).toContainText('Each side: 45 + 45 + 45');
  await sheet.getByRole('button', { name: 'Load it' }).tap();
  await expect(sheet).toBeHidden();
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 45 + 45) = 315 lb');
  await expectPerSide(page, [45, 45, 45]);

  sheet = await typeIt(page, '137');
  await expect(sheet.getByTestId('solve-result')).toContainText('Closest: 135 or 140');
  await expect(sheet.getByRole('button', { name: 'Load it' })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Use 140 lb' }).tap();
  await expect(sheet).toBeHidden();
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 2.5) = 140 lb');

  // Delete key, and the scrim closes without changing the bar.
  sheet = await typeIt(page, '18');
  await sheet.getByRole('button', { name: 'Delete' }).tap();
  await expect(sheet.getByTestId('typed')).toHaveText('1');
  await page.getByTestId('sheet-scrim').click({ position: { x: 20, y: 20 } });
  await expect(sheet).toBeHidden();
  await expect(math(page)).toHaveText('45 bar + 2 × (45 + 2.5) = 140 lb');
  expect(errors).toEqual([]);
});

test('sleeve full blocks the add', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const full = page.getByText('Sleeve is full');
  let count = 0;
  for (let i = 0; i < 15; i++) {
    await tray(page, '45 lb').tap();
    if (await full.isVisible()) break;
    count++;
    await expect.poll(() => plateCount(page, 'right')).toBe(count);
  }
  await expect(full).toBeVisible();
  // 16.4 in sleeve / 1.81 in per 45 = 9 plates.
  expect(count).toBe(9);
  await tray(page, '45 lb').tap();
  await expect.poll(() => plateCount(page, 'right')).toBe(9);
  await expect.poll(() => plateCount(page, 'left')).toBe(9);
  // Nine 45s on a fat numbered bar: one plate with "45" and "×9".
  await expect(plates(page, 'right')).toHaveAttribute('data-label', '9×45');
  await expect(full).toBeHidden({ timeout: 4000 });
  expect(errors).toEqual([]);
});

test('kg bar, unknown bar, and the report screenshots', async ({ page }) => {
  const errors = watchErrors(page);
  const project = test.info().project.name;
  await open(page);

  for (const t of [135, 185, 315]) {
    await page.getByRole('button', { name: `${t} lb`, exact: true }).tap();
    await expect(page.getByTestId('plate-total')).toHaveText(`${t}lb`);
    await page.waitForTimeout(350);
    await expectRealBar(page);
    await shot(page, `${t}-lb`, project);
  }

  // Honest unknown bar: no total number ("— lb", 1.7e), the plates in the "+ bar" form under it.
  await page.getByRole('button', { name: 'Bar unknown' }).tap();
  await expect(page.getByTestId('plate-total')).toHaveText('—lb');
  await expect(math(page)).toHaveText('2 × (45 + 45 + 45) + bar');
  await expect(page.getByRole('button', { name: 'Type it' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bar unknown' }).tap();

  await page.getByRole('button', { name: 'kg', exact: true }).tap();
  await expectPerSide(page, []);
  await expect(math(page)).toHaveText('20 bar = 20 kg');

  const kgInventory = [25, 20, 15, 10, 5, 2.5, 1.25];
  for (const [t, line] of [
    [60, '20 bar + 2 × 20 = 60 kg'],
    [102.5, null],
  ] as const) {
    const solved = solvePlates(t, { bar: 20, inventory: kgInventory, unit: 'kg' });
    expect(solved.exact).toBe(true);
    if (!solved.exact) continue;
    await page.getByRole('button', { name: `${t} kg`, exact: true }).tap();
    const expected = line ?? `20 bar + 2 × (${solved.perSide.join(' + ')}) = ${t} kg`;
    await expect(math(page)).toHaveText(expected);
    await expectPerSide(page, solved.perSide);
    await page.waitForTimeout(350);
    await expectRealBar(page);
    await shot(page, `${t}-kg`, project);
  }
  // Heaviest first from the default kg inventory.
  await expect(math(page)).toHaveText('20 bar + 2 × (25 + 15 + 1.25) = 102.5 kg');
  expect(errors).toEqual([]);
});

test('first time hint on the plate diagram: shown once, gone on the first tap, never again', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const hint = page.getByTestId('hint');
  await expect(hint).toHaveText('Tap plates to load the bar. We add it up.');
  await expect(hint).toHaveCount(1); // never two at once
  // It never blocks the plate under it.
  await tray(page, '45 lb').tap();
  await expect(hint).toHaveCount(0);
  await expect(math(page)).toHaveText('45 bar + 2 × 45 = 135 lb');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('anygym-hints')))!)).toEqual({ plates: true });
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Plates' })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(hint).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('reduced motion: the hint still shows (as a fade) and plates still load', async ({ browser }) => {
  const context = await guardContext(await browser.newContext({ ...test.info().project.use, reducedMotion: 'reduce' }));
  const page = await context.newPage();
  const errors = watchErrors(page);
  await open(page);
  await expect(page.getByTestId('hint')).toBeVisible();
  await tray(page, '25 lb').tap();
  await expect(math(page)).toHaveText('45 bar + 2 × 25 = 95 lb');
  await expect.poll(() => plateCount(page, 'right')).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});
