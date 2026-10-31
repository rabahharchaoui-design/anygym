import { expect, test, type Page, type Browser, type Locator } from '../../../../tests/fixtures';
import { quickWith } from '../../../../tests/workout-helpers';

const DIR = '/Users/rabah/projects/anygym/reports/critic/session-2/2.0d-r3';
const dev = () => test.info().project.name.replace(/ /g, '-');
const shot = async (page: Page, name: string, wait = 500) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${DIR}/${dev()}-${name}.png` });
};
const note = (s: string) => console.log(`NOTE [${dev()}] ${s}`);
const errs = (page: Page) => {
  const e: string[] = [];
  page.on('console', (m) => m.type() === 'error' && e.push(m.text()));
  page.on('pageerror', (x) => e.push(x.message));
  return e;
};

async function sampleZoom(page: Page, act: () => Promise<void>, ms = 700) {
  await page.evaluate((ms) => {
    const w = window as unknown as { __z: Array<[number, string]> };
    w.__z = [];
    const t0 = performance.now();
    const tick = () => {
      const g = document.querySelector('[data-testid="plate-svg"] [data-scene]');
      w.__z.push([Math.round(performance.now() - t0), g?.getAttribute('transform') ?? '']);
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
  // overshoot
  const lo = Math.min(...sc.map(([, s]) => s));
  const hi = Math.max(...sc.map(([, s]) => s));
  return { start, end, settleMs: settle, frames: sc.length, maxGap: Math.max(...gaps), lo, hi, tr: z[z.length - 1]![1] };
}

/** On-screen symmetry: gap from svg box edge to each end cap (or frame), and plate extents per side. */
async function symmetry(page: Page) {
  return page.getByTestId('plate-svg').first().evaluate((svg) => {
    const b = svg.getBoundingClientRect();
    const caps = [...svg.querySelectorAll('[data-bar-part="cap"]')].map((c) => c.getBoundingClientRect());
    const sleeves = [...svg.querySelectorAll('[data-bar-part="sleeve"]')].map((c) => c.getBoundingClientRect());
    const out = (r: DOMRect[]) => r.map((x) => `${Math.round(x.left - b.left)}..${Math.round(x.right - b.left)}`).join(' | ');
    const l = caps.length ? Math.round(Math.min(...caps.map((c) => c.left)) - b.left) : NaN;
    const r = caps.length ? Math.round(b.right - Math.max(...caps.map((c) => c.right))) : NaN;
    return { w: Math.round(b.width), leftGap: l, rightGap: r, caps: out(caps), sleeves: out(sleeves), zoom: svg.getAttribute('data-zoom') };
  });
}

async function chipsMetrics(loc: Locator) {
  return loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const r = el.getBoundingClientRect();
    return { text: el.textContent, h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right), vw: innerWidth, lines: Math.round(r.height / lh), sw: el.scrollWidth, cw: el.clientWidth, fs: cs.fontSize, ws: cs.whiteSpace, ov: cs.textOverflow };
  });
}

async function openBarbell(page: Page) {
  await quickWith(page, [['squat', 'Barbell Back Squat']]);
  await page.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('A barbell sheet', async ({ page }) => {
  const e = errs(page);
  await quickWith(page, [['squat', 'Barbell Back Squat']]);
  await shot(page, 'A00-exercise-view');
  await page.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, 'A01-sheet-open', 700);
  note(`hint count on open ${await page.getByTestId('hint').count()} text ${await page.getByTestId('hint').first().textContent().catch(() => '-')}`);
  note(`empty: ${JSON.stringify(await symmetry(page))} total ${await sheet.getByTestId('plate-total').textContent()}`);
  const seq = ['45', '45', '45', '35', '25', '10', '5', '2.5'];
  for (let i = 0; i < seq.length; i++) {
    const b = sheet.getByRole('button', { name: `Add ${seq[i]} lb plate to each side`, exact: true });
    const r = await sampleZoom(page, () => b.tap());
    note(`add ${seq[i]}: zoom ${r.start.toFixed(3)} -> ${r.end.toFixed(3)} [${r.lo.toFixed(3)},${r.hi.toFixed(3)}] settle ${r.settleMs}ms frames ${r.frames} maxGap ${r.maxGap} sym ${JSON.stringify(await symmetry(page))}`);
    note(`  total ${await sheet.getByTestId('plate-total').textContent()} hint ${await page.getByTestId('hint').count()}`);
    await shot(page, `A03-add-${i + 1}-${seq[i]}`, 50);
  }
  note(`chips 297.5: ${JSON.stringify(await chipsMetrics(sheet.getByTestId('plate-chips')))}`);
  for (let i = 0; i < 6; i++) {
    await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
    await page.waitForTimeout(350);
  }
  await shot(page, 'A04-heavy');
  note(`heavy: ${await sheet.getByTestId('plate-total').textContent()} full ${await page.getByTestId('sleeve-full').count()} sym ${JSON.stringify(await symmetry(page))}`);
  for (const side of ['right', 'left', 'left'] as const) {
    const hit = page.getByTestId(`remove-${side}`);
    const box = (await hit.boundingBox())!;
    note(`remove-${side} box ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    const before = await sheet.getByTestId('plate-total').textContent();
    // tap near the outer end of that side (where a user aims at the outer plate)
    const x = side === 'left' ? box.x + 12 : box.x + box.width - 12;
    const r = await sampleZoom(page, async () => {
      await page.mouse.move(x, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.screenshot({ path: `${DIR}/${dev()}-A05-${side}-pressed.png` });
      await page.mouse.up();
    }, 600);
    note(`  ${side}: ${before} -> ${await sheet.getByTestId('plate-total').textContent()} zoom ${r.start.toFixed(3)}->${r.end.toFixed(3)} settle ${r.settleMs} sym ${JSON.stringify(await symmetry(page))}`);
    await shot(page, `A05-${side}-after`, 100);
  }
  await sheet.getByRole('button', { name: 'Type it' }).tap();
  const ty = page.getByRole('dialog', { name: 'Type a weight' });
  await expect(ty).toBeVisible();
  await shot(page, 'A06-typeit-open');
  for (const ch of '227') await ty.getByRole('button', { name: ch, exact: true }).tap();
  await shot(page, 'A06-typeit-227', 200);
  note(`typeit 227: ${(await ty.innerText()).replace(/\n+/g, ' | ').slice(0, 300)}`);
  await ty.getByRole('button', { name: /Delete|Backspace|⌫/ }).first().tap().catch(() => note('no delete key'));
  await ty.getByRole('button', { name: '5', exact: true }).tap().catch(() => {});
  await shot(page, 'A06-typeit-225', 200);
  await ty.getByRole('button', { name: 'Load it' }).tap().catch(() => note('Load it failed'));
  await shot(page, 'A07-after-typeit');
  note(`after type ${await sheet.getByTestId('plate-total').textContent()} sym ${JSON.stringify(await symmetry(page))}`);
  const r = await sampleZoom(page, () => sheet.getByRole('button', { name: 'Clear' }).tap());
  note(`clear: zoom ${r.start.toFixed(3)} -> ${r.end.toFixed(3)} settle ${r.settleMs}ms [${r.lo.toFixed(3)},${r.hi.toFixed(3)}]`);
  await shot(page, 'A08-cleared', 100);
  note(`after clear hint ${await page.getByTestId('hint').count()} ${await page.getByTestId('hint').first().textContent().catch(() => '-')}`);
  await sheet.getByRole('button', { name: /Change bar/ }).first().tap();
  await shot(page, 'A09-change-bar');
  await page.keyboard.press('Escape');
  await shot(page, 'A10-after-escape');
  expect(e).toEqual([]);
});

test('A2 chips at 470 lb and 177.5 kg plus edge loads', async ({ page }) => {
  const e = errs(page);
  for (const [unit, load] of [['lb', 470], ['kg', 177.5], ['lb', 297.5], ['kg', 143.75], ['lb', 47.5]] as const) {
    await page.goto('about:blank');
    await page.goto(`./?dev#/dev/plates?dev&unit=${unit}&load=${load}&nohint`);
    await expect(page.getByTestId('plate-total')).toBeVisible();
    await page.waitForTimeout(500);
    note(`${load}${unit}: total ${await page.getByTestId('plate-total').textContent()} chips ${JSON.stringify(await chipsMetrics(page.getByTestId('plate-chips')))} sym ${JSON.stringify(await symmetry(page))}`);
    await shot(page, `A2-${unit}-${load}`, 100);
  }
  expect(e).toEqual([]);
});

test('A3 real sheet at 470 lb via plates', async ({ page }) => {
  const e = errs(page);
  const sheet = await openBarbell(page);
  for (const w of ['45', '45', '45', '45', '25', '5', '2.5']) {
    await sheet.getByRole('button', { name: `Add ${w} lb plate to each side`, exact: true }).tap();
    await page.waitForTimeout(250);
  }
  // 45 + 2*(180+32.5)=470
  await page.waitForTimeout(500);
  note(`real 470: ${await sheet.getByTestId('plate-total').textContent()} chips ${JSON.stringify(await chipsMetrics(sheet.getByTestId('plate-chips')))}`);
  await shot(page, 'A3-real-470', 100);
  const foot = await sheet.evaluate((s) => [...s.querySelectorAll('button')].filter((b) => /Done|Use|Save|Log/.test(b.textContent ?? '')).map((b) => `${b.textContent}:${Math.round(b.getBoundingClientRect().bottom)}/${innerHeight}`));
  note(`footer buttons ${foot}`);
  expect(e).toEqual([]);
});

test('B smith first use', async ({ page }) => {
  const e = errs(page);
  await quickWith(page, [['smith', 'Smith Machine Upright Row']]);
  await page.locator('[data-testid^="exercise-"]').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, 'B01-smith-question', 700);
  note(`smith q: ${(await sheet.innerText()).replace(/\n+/g, ' | ').slice(0, 300)} hint ${await page.getByTestId('hint').count()}`);
  const btn = sheet.getByTestId('bar-question').getByRole('button', { name: 'Count plates only' });
  const bb = await btn.boundingBox();
  note(`count plates only btn ${JSON.stringify(bb)}`);
  await btn.tap();
  await shot(page, 'B02-smith-plates-only', 600);
  note(`after plates only hint ${await page.getByTestId('hint').count()} ${await page.getByTestId('hint').first().textContent().catch(() => '-')} sym ${JSON.stringify(await symmetry(page))}`);
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }).tap();
  await shot(page, 'B03-smith-plates', 600);
  note(`smith total ${await sheet.getByTestId('plate-total').textContent()} note ${await sheet.getByTestId('plate-note').textContent().catch(() => '-')} sym ${JSON.stringify(await symmetry(page))}`);
  expect(e).toEqual([]);
});

test('C leg press horn', async ({ page }) => {
  const e = errs(page);
  await quickWith(page, [['leg press', 'Leg Press']]);
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await shot(page, 'C01-horn-empty', 700);
  note(`horn empty zoom ${await page.getByTestId('plate-svg').getAttribute('data-zoom')} text ${(await sheet.innerText()).replace(/\n+/g, ' | ').slice(0, 300)}`);
  for (let i = 0; i < 8; i++) {
    const r = await sampleZoom(page, () => sheet.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap(), 600);
    note(`horn add ${i + 1}: ${r.start.toFixed(3)} -> ${r.end.toFixed(3)} [${r.lo.toFixed(3)},${r.hi.toFixed(3)}] settle ${r.settleMs} maxGap ${r.maxGap} tr ${r.tr}`);
    if ([0, 1, 3, 5, 7].includes(i)) await shot(page, `C02-horn-${i + 1}`, 50);
  }
  note(`horn total ${await sheet.getByTestId('plate-total').textContent()} note ${await sheet.getByTestId('plate-note').textContent().catch(() => '-')} full ${await page.getByTestId('sleeve-full').count()}`);
  await sheet.getByTestId('start-question').getByRole('button', { name: 'Set starting weight' }).tap().catch(() => note('no set starting weight'));
  await shot(page, 'C03-set-start');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await sheet.getByTestId('start-question').count()) {
    await sheet.getByTestId('start-question').getByRole('button', { name: 'Plates only', exact: true }).tap();
  }
  await shot(page, 'C04-horn-plates-only');
  note(`horn after plates only ${await sheet.getByTestId('plate-total').textContent()}`);
  await page.getByTestId('remove-right').tap().catch(() => note('no remove-right on horn'));
  await shot(page, 'C05-horn-removed');
  note(`horn after remove ${await sheet.getByTestId('plate-total').textContent()}`);
  expect(e).toEqual([]);
});

test('D dev presets', async ({ page }) => {
  const e = errs(page);
  for (const [unit, loads] of [['lb', [45, 135, 225, 315, 400, 495, 700]], ['kg', [20, 60, 100, 140, 220]]] as const) {
    for (const load of loads) {
      await page.goto('about:blank');
      await page.goto(`./?dev#/dev/plates?dev&unit=${unit}&load=${load}&nohint`);
      await expect(page.getByTestId('plate-total')).toHaveText(`${load}${unit}`);
      note(`${load}${unit} chips ${await page.getByTestId('plate-chips').textContent()} sym ${JSON.stringify(await symmetry(page))}`);
      await shot(page, `D-${unit}-${load}`, 500);
    }
  }
  await page.goto('about:blank');
  await page.goto('./?dev#/dev/plates?dev');
  await shot(page, 'D00-harness-hint', 700);
  expect(e).toEqual([]);
});

test('E kg gym tray', async ({ page }) => {
  const e = errs(page);
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  const sheet = await openBarbell(page);
  await shot(page, 'E01-kg-sheet', 600);
  for (const w of ['25', '25', '25', '20', '15', '10', '5', '2.5', '1.25']) {
    await sheet.getByRole('button', { name: `Add ${w} kg plate to each side`, exact: true }).tap().catch(() => note(`no ${w} kg tile`));
    await page.waitForTimeout(300);
  }
  await shot(page, 'E02-kg-all');
  const tray = page.getByRole('group', { name: 'Plates' });
  const m = await tray.evaluate((t) => ({ sc: t.scrollWidth - t.clientWidth, n: t.querySelectorAll('button').length, w: [...t.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width)) }));
  note(`kg tray: ${m.n} tiles, overflow ${m.sc}, widths ${m.w}`);
  note(`kg total ${await sheet.getByTestId('plate-total').textContent()} chips ${JSON.stringify(await chipsMetrics(sheet.getByTestId('plate-chips')))}`);
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
    await shot(page, `F02-${gymUnit}-set1`, 600);
    note(`import ${gymUnit} set1 text: ${(await sheet.innerText()).replace(/\n+/g, ' | ').slice(0, 500)}`);
    const geo = await sheet.evaluate((s) => ({ vh: innerHeight, sheetTop: Math.round(s.getBoundingClientRect().top), sh: s.scrollHeight, ch: s.clientHeight, btns: [...s.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return `${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 18)}@${Math.round(r.top)}-${Math.round(r.bottom)}h${Math.round(r.height)}`; }) }));
    note(`import ${gymUnit} geo ${JSON.stringify(geo)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.getByTestId('import-set').nth(1).tap().catch(() => note('no second import set'));
    await shot(page, `F03-${gymUnit}-set2`, 600);
    if (await sheet.isVisible()) note(`import ${gymUnit} set2 text: ${(await sheet.innerText()).replace(/\n+/g, ' | ').slice(0, 500)}`);
    const other = sheet.getByRole('button', { name: /Pick another weight|Change|Edit weight/ });
    if (await other.count()) {
      await other.first().tap();
      await shot(page, `F04-${gymUnit}-picker`, 600);
    }
    expect(e).toEqual([]);
  });
}

async function recorded(browser: Browser, name: string, reduce: boolean, run: (page: Page) => Promise<void>) {
  const proj = test.info().project.use;
  const vp = proj.viewport!;
  const ctx = await browser.newContext({ ...proj, recordVideo: { dir: `/tmp/anygym-critic-r3-video/${name}-${dev()}`, size: vp }, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await run(page);
  const v = page.video();
  await ctx.close();
  if (v) await v.saveAs(`${DIR}/video-${name}-${dev()}.webm`);
}

test('V videos', async ({ browser }) => {
  test.setTimeout(600_000);
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
    await page.getByTestId('remove-left').tap();
    await page.waitForTimeout(700);
  });
});

test('R reduced motion crossfade frames', async ({ browser }) => {
  const proj = test.info().project.use;
  const ctx = await browser.newContext({ ...proj, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('./?dev#/dev/plates?dev&unit=lb&load=135&nohint');
  await expect(page.getByTestId('plate-total')).toHaveText('135lb');
  await page.waitForTimeout(400);
  note(`reduce attr ${await page.getByTestId('plate-svg').first().getAttribute('data-reduce')}`);
  await page.evaluate(() => {
    const w = window as unknown as { __f: string[] };
    w.__f = [];
    const t0 = performance.now();
    const tick = () => {
      const svgs = [...document.querySelectorAll('svg')].filter((s) => s.closest('[data-testid]') || s.getAttribute('data-testid'));
      const ghosts = document.querySelectorAll('[data-ghost], [data-crossfade]');
      const op = [...ghosts].map((g) => getComputedStyle(g as Element).opacity).join(',');
      const tr = document.querySelector('[data-testid="plate-svg"] [data-scene]')?.getAttribute('transform') ?? '';
      w.__f.push(`${Math.round(performance.now() - t0)} svgs${svgs.length} ghosts${ghosts.length}[${op}] ${tr.slice(0, 40)}`);
      if (performance.now() - t0 < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${DIR}/${dev()}-R01-reduced-mid.png` });
  await page.waitForTimeout(600);
  const f = await page.evaluate(() => (window as unknown as { __f: string[] }).__f);
  note(`reduced frames: ${f.filter((_, i) => i % 3 === 0).slice(0, 14).join(' ; ')}`);
  await page.screenshot({ path: `${DIR}/${dev()}-R02-reduced-end.png` });
  await ctx.close();
});

test('W press feedback', async ({ page }) => {
  await page.goto('./?dev#/dev/plates?dev&unit=lb&load=225&nohint');
  await expect(page.getByTestId('plate-total')).toHaveText('225lb');
  const tile = page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
  const b = (await tile.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(32);
  note(`tile pressed 32ms: ${await tile.evaluate((el) => getComputedStyle(el).transform + ' / ' + getComputedStyle(el).opacity)}`);
  await page.screenshot({ path: `${DIR}/${dev()}-W01-tile-pressed.png` });
  await page.mouse.up();
  for (const side of ['left', 'right']) {
    const h = (await page.getByTestId(`remove-${side}`).boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(32);
    note(`${side} pressed 32ms: ${await page.getByTestId(`remove-${side}`).getAttribute('data-pressed')}`);
    await page.screenshot({ path: `${DIR}/${dev()}-W01-${side}-pressed.png` });
    await page.mouse.up();
    await page.waitForTimeout(500);
  }
  await page.goto('about:blank');
  await page.goto('./?dev#/dev/plates?dev&unit=lb&load=700&nohint');
  await expect(page.getByTestId('plate-total')).toHaveText('700lb');
  await page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${DIR}/${dev()}-W02-sleeve-full.png` });
  note(`at 700 add45: ${await page.getByTestId('plate-total').textContent()} full ${await page.getByTestId('sleeve-full').textContent().catch(() => '-')}`);
  await page.waitForTimeout(2500);
  note(`full msg after 2.6s: ${await page.getByTestId('sleeve-full').count()}`);
  await page.getByRole('button', { name: 'Add 2.5 lb plate to each side', exact: true }).tap();
  await page.waitForTimeout(300);
  note(`at 700 add2.5: ${await page.getByTestId('plate-total').textContent()} full ${await page.getByTestId('sleeve-full').count()}`);
  await page.screenshot({ path: `${DIR}/${dev()}-W03-700-plus-2.5.png` });
});

test('A4 change bar', async ({ page }) => {
  const e = errs(page);
  const sheet = await openBarbell(page);
  const link = sheet.getByTestId('bar-link');
  note(`bar-link aria ${await link.getAttribute('aria-label')} text ${await link.textContent()}`);
  await link.tap();
  await shot(page, 'A09-change-bar', 600);
  note(`change bar ui: ${(await page.locator('[role="dialog"]').last().innerText()).replace(/\n+/g, ' | ').slice(0, 400)}`);
  await page.keyboard.press('Escape');
  await shot(page, 'A10-after-escape');
  expect(e).toEqual([]);
});

test('C2 horn tray geometry', async ({ page }) => {
  await quickWith(page, [['leg press', 'Leg Press']]);
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(700);
  const g = await sheet.evaluate((s) => {
    const tile = [...s.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.startsWith('Add 45'))!;
    const done = [...s.querySelectorAll('button')].find((b) => /Done/.test(b.textContent ?? ''))!;
    const sc = [...s.querySelectorAll('*')].filter((el) => { const c = getComputedStyle(el); return /auto|scroll/.test(c.overflowY) && el.scrollHeight > el.clientHeight + 1; }).map((el) => `${el.className}:${el.scrollHeight}/${el.clientHeight}`);
    return { vh: innerHeight, tile: [Math.round(tile.getBoundingClientRect().top), Math.round(tile.getBoundingClientRect().bottom)], done: [Math.round(done.getBoundingClientRect().top), Math.round(done.getBoundingClientRect().bottom)], scrollers: sc };
  });
  note(`horn tray geo ${JSON.stringify(g)}`);
});

test('VH horn video', async ({ browser }) => {
  test.setTimeout(600_000);
  await recorded(browser, 'horn', false, async (page) => {
    const t0 = Date.now();
    await quickWith(page, [['leg press', 'Leg Press']]);
    note(`quickWith ${Date.now() - t0}ms`);
    await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().click();
    note(`opened ${Date.now() - t0}ms`);
    await page.waitForTimeout(800);
    const add = page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
    note(`add count ${await add.count()} dialogs ${await page.getByRole('dialog').count()}`);
    await add.click({ timeout: 8000 }).catch((e) => note(`tap fail ${String(e).slice(0, 600)}`));
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).click();
      await page.waitForTimeout(550);
    }
    await page.getByTestId('remove-left').click().catch(() => {});
    await page.waitForTimeout(800);
  });
});

for (const vid of [false, true]) {
  test(`HZ horn freeze probe video=${vid}`, async ({ browser }) => {
    const proj = test.info().project.use;
    const ctx = await browser.newContext({ ...proj, ...(vid ? { recordVideo: { dir: '/tmp/anygym-critic-r3-video/probe', size: proj.viewport! } } : {}) });
    const page = await ctx.newPage();
    page.on('pageerror', (x) => note(`pageerror ${x.message}`));
    await quickWith(page, [['leg press', 'Leg Press']]);
    await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
    await page.waitForTimeout(800);
    const add = page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true });
    const t = Date.now();
    const r = await Promise.race([add.click({ timeout: 5000 }).then(() => 'clicked').catch((e) => 'err ' + String(e).slice(0, 200)), new Promise((res) => setTimeout(() => res('HUNG'), 10000))]);
    note(`video=${vid} click: ${r} in ${Date.now() - t}ms`);
    const ev = await Promise.race([page.evaluate(() => document.querySelector('[data-testid="plate-total"]')?.textContent), new Promise((res) => setTimeout(() => res('EVAL HUNG'), 5000))]);
    note(`video=${vid} total after: ${ev}`);
    await ctx.close().catch(() => {});
  });
}

test('HV2 horn video guarded', async ({ browser }) => {
  test.setTimeout(120_000);
  const proj = test.info().project.use;
  const ctx = await browser.newContext({ ...proj, recordVideo: { dir: `/tmp/anygym-critic-r3-video/hv2-${dev()}`, size: proj.viewport! }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const race = <T,>(p: Promise<T>, ms: number, label: string) => Promise.race([p.then(() => `${label} ok`).catch((e) => `${label} err ${String(e).slice(0, 120)}`), new Promise<string>((r) => setTimeout(() => r(`${label} HUNG`), ms))]);
  await quickWith(page, [['leg press', 'Leg Press']]);
  note(await race(page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap(), 5000, 'open'));
  await page.waitForTimeout(900);
  for (let i = 0; i < 6; i++) {
    note(await race(page.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).click({ timeout: 4000 }), 6000, `add${i}`));
    note(await race(page.evaluate(() => document.querySelector('[data-testid="plate-total"]')?.textContent ?? ''), 3000, `eval${i}`));
    await page.waitForTimeout(550);
  }
  note(await race(page.getByTestId('remove-left').click({ timeout: 4000 }), 6000, 'remove'));
  await page.waitForTimeout(900);
  const v = page.video();
  await race(ctx.close(), 20000, 'close');
  if (v) await race(v.saveAs(`${DIR}/video-horn-${dev()}.webm`), 20000, 'save');
});
