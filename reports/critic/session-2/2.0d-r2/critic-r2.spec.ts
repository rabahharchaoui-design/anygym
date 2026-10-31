import { expect, test, type Page, type Browser } from '../../../../tests/fixtures';
import { quickWith } from '../../../../tests/workout-helpers';

const DIR = '/Users/rabah/projects/anygym/reports/critic/session-2/2.0d-r2';
const dev = () => test.info().project.name.replace(/ /g, '-');
const shot = async (page: Page, name: string, wait = 500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${DIR}/${dev()}-${name}.png` });
};
const notes: string[] = [];
const note = (s: string) => {
  notes.push(`[${dev()}] ${s}`);
  console.log(`NOTE [${dev()}] ${s}`);
};
const errs = (page: Page) => {
  const e: string[] = [];
  page.on('console', (m) => m.type() === 'error' && e.push(m.text()));
  page.on('pageerror', (x) => e.push(x.message));
  return e;
};

/** Samples the camera zoom every frame for ms after running act. */
async function sampleZoom(page: Page, act: () => Promise<void>, ms = 700) {
  await page.evaluate((ms) => {
    const w = window as unknown as { __z: Array<[number, string]> };
    w.__z = [];
    const t0 = performance.now();
    const tick = () => {
      const svg = document.querySelector('[data-testid="plate-svg"] [data-scene]');
      w.__z.push([Math.round(performance.now() - t0), svg?.getAttribute('transform') ?? '']);
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, ms);
  await act();
  await page.waitForTimeout(ms + 100);
  const z = await page.evaluate(() => (window as unknown as { __z: Array<[number, string]> }).__z);
  const sc = z.map(([t, tr]) => [t, Number(tr.match(/scale\(([\d.]+)/)?.[1] ?? NaN)] as const);
  const end = sc[sc.length - 1]![1];
  const start = sc[0]![1];
  const settle = sc.find(([, s]) => Math.abs(s - end) < Math.abs(end - start) * 0.02 + 1e-4)?.[0];
  const gaps = sc.slice(1).map(([t], i) => t - sc[i]![0]);
  return { start, end, settleMs: settle, frames: sc.length, maxGap: Math.max(...gaps) };
}

async function openBarbell(page: Page) {
  await quickWith(page, [['squat', 'Barbell Back Squat']]);
  await page.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('A barbell sheet: rest, hint, add from empty, sleeve removal, chips, Type it, Clear, Change bar', async ({ page }) => {
  const e = errs(page);
  await quickWith(page, [['squat', 'Barbell Back Squat']]);
  await shot(page, 'A00-exercise-view');
  await page.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, 'A01-sheet-open-hint', 600);
  const hint = page.getByTestId('hint');
  if (await hint.count()) note(`hint text: ${await hint.textContent()}`);
  const z0 = await page.getByTestId('plate-svg').getAttribute('data-zoom');
  note(`empty bar zoom ${z0}, total ${await sheet.getByTestId('plate-total').textContent()}`);
  // tap the drawing to dismiss hint? tap the title instead
  await sheet.getByTestId('plate-total').tap().catch(() => {});
  await shot(page, 'A02-sheet-empty-nohint');
  const seq = ['45', '45', '45', '35', '25', '10', '5', '2.5'];
  for (let i = 0; i < seq.length; i++) {
    const b = sheet.getByRole('button', { name: `Add ${seq[i]} lb plate to each side`, exact: true });
    const r = await sampleZoom(page, () => b.tap());
    note(`add ${seq[i]}: zoom ${r.start.toFixed(3)} -> ${r.end.toFixed(3)} settle ${r.settleMs}ms frames ${r.frames} maxGap ${r.maxGap}`);
    await shot(page, `A03-add-${i + 1}-${seq[i]}`, 50);
  }
  note(`chips: ${await sheet.getByTestId('plate-chips').textContent()}`);
  note(`total: ${await sheet.getByTestId('plate-total').textContent()}`);
  // more 45s to see zoom to full
  for (let i = 0; i < 6; i++) {
    const b = sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
    await b.tap();
    await page.waitForTimeout(350);
  }
  await shot(page, 'A04-heavy');
  note(`heavy total: ${await sheet.getByTestId('plate-total').textContent()} toast/full: ${await page.getByText('Sleeve is full').count()}`);
  // Sleeve removal
  for (let i = 0; i < 3; i++) {
    const hit = page.getByTestId('remove-right');
    const box = (await hit.boundingBox())!;
    note(`remove-right box ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${DIR}/${dev()}-A05-sleeve-pressed-${i}.png` });
    await page.mouse.up();
    await shot(page, `A05-sleeve-after-${i}`, 400);
  }
  note(`after removes: ${await sheet.getByTestId('plate-total').textContent()}`);
  // Type it
  await sheet.getByRole('button', { name: 'Type it' }).tap();
  const ty = page.getByRole('dialog', { name: 'Type a weight' });
  await expect(ty).toBeVisible();
  await shot(page, 'A06-typeit-open');
  for (const ch of '227') await ty.getByRole('button', { name: ch, exact: true }).tap();
  await shot(page, 'A06-typeit-227', 200);
  note(`typeit 227 result: ${await ty.getByTestId('solve-result').textContent().catch(() => '?')}`);
  await ty.getByRole('button', { name: /Delete|Backspace|⌫/ }).first().tap().catch(() => note('no delete key found'));
  await ty.getByRole('button', { name: '5', exact: true }).tap().catch(() => {});
  await shot(page, 'A06-typeit-225', 200);
  note(`typeit 225 result: ${await ty.getByTestId('solve-result').textContent().catch(() => '?')}`);
  await ty.getByRole('button', { name: 'Load it' }).tap().catch(() => note('Load it failed'));
  await shot(page, 'A07-after-typeit');
  note(`after type total ${await sheet.getByTestId('plate-total').textContent()}`);
  // Clear
  const r = await sampleZoom(page, () => sheet.getByRole('button', { name: 'Clear' }).tap());
  note(`clear: zoom ${r.start.toFixed(3)} -> ${r.end.toFixed(3)} settle ${r.settleMs}ms`);
  await shot(page, 'A08-cleared', 50);
  // Change bar
  await sheet.getByRole('button', { name: /^Bar: .*Change$/ }).first().tap();
  await shot(page, 'A09-change-bar');
  await page.keyboard.press('Escape');
  await shot(page, 'A10-after-escape');
  expect(e).toEqual([]);
});

test('B smith first use incl Count plates only', async ({ page }) => {
  const e = errs(page);
  await quickWith(page, [['smith', 'Smith Machine Upright Row']]);
  await page.locator('[data-testid^="exercise-"]').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, 'B01-smith-question', 600);
  await sheet.getByTestId('bar-question').getByRole('button', { name: 'Count plates only' }).tap();
  await shot(page, 'B02-smith-plates-only');
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }).tap();
  await shot(page, 'B03-smith-plates');
  note(`smith total ${await sheet.getByTestId('plate-total').textContent()} note ${await sheet.getByTestId('plate-note').textContent().catch(() => '-')}`);
  expect(e).toEqual([]);
});

test('C leg press horn', async ({ page }) => {
  const e = errs(page);
  await quickWith(page, [['leg press', 'Leg Press']]);
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, 'C01-horn-empty', 600);
  for (let i = 0; i < 6; i++) {
    const r = await sampleZoom(page, () => sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap(), 500);
    note(`horn add ${i + 1}: ${r.start.toFixed(3)} -> ${r.end.toFixed(3)} settle ${r.settleMs}`);
    if (i === 1 || i === 3 || i === 5) await shot(page, `C02-horn-${i + 1}`, 50);
  }
  note(`horn total ${await sheet.getByTestId('plate-total').textContent()} note ${await sheet.getByTestId('plate-note').textContent().catch(() => '-')}`);
  await sheet.getByTestId('start-question').getByRole('button', { name: 'Set starting weight' }).tap();
  await shot(page, 'C03-set-start');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await sheet.getByTestId('start-question').count()) {
    await sheet.getByTestId('start-question').getByRole('button', { name: 'Plates only', exact: true }).tap();
  }
  await shot(page, 'C04-horn-plates-only');
  await page.getByTestId('remove-right').tap().catch(() => note('no remove-right on horn'));
  await shot(page, 'C05-horn-removed');
  note(`horn after remove ${await sheet.getByTestId('plate-total').textContent()}`);
  expect(e).toEqual([]);
});

test('D dev presets lb and kg, default and color', async ({ page }) => {
  const e = errs(page);
  for (const [unit, loads] of [['lb', [45, 135, 225, 315, 400, 495, 700]], ['kg', [20, 60, 100, 140, 220]]] as const) {
    for (const load of loads) {
      await page.goto('about:blank');
      await page.goto(`./?dev#/dev/plates?dev&unit=${unit}&load=${load}&nohint`);
      await expect(page.getByTestId('plate-total')).toHaveText(`${load}${unit}`);
      const z = await page.getByTestId('plate-svg').getAttribute('data-zoom');
      note(`${load}${unit} zoom ${z} chips ${await page.getByTestId('plate-chips').textContent()}`);
      await shot(page, `D-${unit}-${load}`, 500);
    }
  }
  await page.goto('about:blank');
  await page.goto('./?dev#/dev/plates?dev');
  await shot(page, 'D00-harness-hint', 700);
  expect(e).toEqual([]);
});

test('E kg gym tray and colors in a real workout', async ({ page }) => {
  const e = errs(page);
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await shot(page, 'E00-settings-kg');
  const sheet = await openBarbell(page);
  await shot(page, 'E01-kg-sheet', 600);
  for (const w of ['25', '20', '15', '10', '5', '2.5', '1.25']) {
    await sheet.getByRole('button', { name: `Add ${w} kg plate to each side`, exact: true }).tap().catch(() => note(`no ${w} kg tile`));
    await page.waitForTimeout(300);
  }
  await shot(page, 'E02-kg-all');
  const tray = page.getByRole('group', { name: 'Plates' });
  const m = await tray.evaluate((t) => ({ sc: t.scrollWidth - t.clientWidth, n: t.querySelectorAll('button').length, w: [...t.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width)) }));
  note(`kg tray: ${m.n} tiles, overflow ${m.sc}, widths ${m.w}`);
  note(`kg total ${await sheet.getByTestId('plate-total').textContent()} chips ${await sheet.getByTestId('plate-chips').textContent()}`);
  expect(e).toEqual([]);
});

const IMPORT_FILE = JSON.stringify({
  format: 'anygym-import-v1',
  unit: 'lb',
  exercises: [
    { name: 'Squats', planExercise: 'Barbell Back Squat', loadType: 'barbell_per_side', sessions: [{ sets: [{ reps: 5, weight: 45, uncertain: true, why: 'Hard to read' }, { reps: 5, weight: 225, uncertain: true, why: 'Hard to read' }] }] },
  ],
});

for (const gymUnit of ['lb', 'kg'] as const) {
  test(`F import editor ${gymUnit}`, async ({ page }) => {
    const e = errs(page);
    await page.goto('./#/settings');
    if (gymUnit === 'kg') await page.getByRole('radio', { name: 'kg', exact: true }).tap();
    await page.getByTestId('import-file').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(IMPORT_FILE) });
    await expect(page).toHaveURL(/#\/settings\/import$/);
    await shot(page, `F01-${gymUnit}-review`);
    await page.getByTestId('import-set').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Check this set' });
    await expect(sheet).toHaveAttribute('data-state', 'open');
    await shot(page, `F02-${gymUnit}-set1`);
    note(`import ${gymUnit} set1 text: ${(await sheet.innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.getByTestId('import-set').nth(1).tap().catch(() => note('no second import set'));
    await shot(page, `F03-${gymUnit}-set2`);
    if (await sheet.isVisible()) note(`import ${gymUnit} set2 text: ${(await sheet.innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`);
    if (gymUnit === 'kg' && (await sheet.getByRole('button', { name: 'Pick another weight' }).count())) {
      await sheet.getByRole('button', { name: 'Pick another weight' }).tap();
      await shot(page, `F04-kg-picker`);
    }
    expect(e).toEqual([]);
  });
}

async function recorded(browser: Browser, name: string, reduce: boolean, run: (page: Page) => Promise<void>) {
  const proj = test.info().project.use;
  const vp = proj.viewport!;
  const ctx = await browser.newContext({ ...proj, recordVideo: { dir: `/tmp/anygym-critic-r2-video/${name}`, size: vp }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await run(page);
  const v = page.video();
  await ctx.close();
  if (v) await v.saveAs(`${DIR}/video-${name}-${dev()}.webm`);
}

test('V videos: zoom from empty and sleeve removal', async ({ browser }) => {
  test.skip(test.info().project.name === 'iPhone SE' ? false : test.info().project.name !== 'iPhone 15' && test.info().project.name !== '320');
  await recorded(browser, 'zoom', false, async (page) => {
    await page.goto('./?dev#/dev/plates?dev&nohint');
    await expect(page.getByTestId('plate-total')).toBeVisible();
    await page.waitForTimeout(600);
    for (const w of ['45', '45', '45', '45', '45', '35', '25', '10', '5', '2.5']) {
      await page.getByRole('button', { name: `Add ${w} lb plate to each side`, exact: true }).tap();
      await page.waitForTimeout(550);
    }
    await page.waitForTimeout(600);
  });
  await recorded(browser, 'sleeve-remove', false, async (page) => {
    await page.goto('./?dev#/dev/plates?dev&unit=lb&load=400&nohint');
    await expect(page.getByTestId('plate-total')).toHaveText('400lb');
    await page.waitForTimeout(600);
    for (let i = 0; i < 8; i++) {
      await page.getByTestId(i % 2 ? 'remove-left' : 'remove-right').tap();
      await page.waitForTimeout(550);
    }
    await page.waitForTimeout(600);
  });
  await recorded(browser, 'zoom-reduced', true, async (page) => {
    await page.goto('./?dev#/dev/plates?dev&nohint');
    await page.waitForTimeout(600);
    for (const w of ['45', '45', '45', '25']) {
      await page.getByRole('button', { name: `Add ${w} lb plate to each side`, exact: true }).tap();
      await page.waitForTimeout(550);
    }
    await page.getByTestId('remove-right').tap();
    await page.waitForTimeout(700);
  });
});

test('W timing: press feedback on tray tile and sleeve', async ({ page }) => {
  await page.goto('./?dev#/dev/plates?dev&unit=lb&load=225&nohint');
  await expect(page.getByTestId('plate-total')).toHaveText('225lb');
  const tile = page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
  const b = (await tile.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(32);
  const t = await tile.evaluate((el) => getComputedStyle(el).transform + ' / ' + getComputedStyle(el).opacity);
  await page.screenshot({ path: `${DIR}/${dev()}-W01-tile-pressed.png` });
  await page.mouse.up();
  note(`tile pressed style after 32ms: ${t}`);
  const hit = page.getByTestId('remove-right');
  const h = (await hit.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(32);
  note(`sleeve pressed attr after 32ms: ${await hit.getAttribute('data-pressed')}`);
  await page.mouse.up();
  // full sleeve feedback
  await page.goto('about:blank');
  await page.goto('./?dev#/dev/plates?dev&unit=lb&load=700&nohint');
  await expect(page.getByTestId('plate-total')).toHaveText('700lb');
  await page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${DIR}/${dev()}-W02-sleeve-full.png` });
  note(`after add at 700: ${await page.getByTestId('plate-total').textContent()} full msg ${await page.getByText(/full/i).count()}`);
});
