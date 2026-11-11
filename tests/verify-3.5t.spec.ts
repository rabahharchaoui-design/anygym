import { appendFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';
import { card, pastIntake } from './helpers/quick';
import { bar185, exerciseView, quickWith, seedFinished, usePlan } from './workout-helpers';

// Tester PLAN 3.5t: walks every screen and records (to /tmp/v35t/<phone>.jsonl) every distinct drawn
// colour, backdrop-filter count, fonts, and pixel measured text contrast (text hidden, background
// sampled from a real screenshot). Screenshots go to reports/shots/3.5t-verify/.
const SHOTS = 'reports/shots/3.5t-verify';
const OUT = '/tmp/v35t';
const proj = () => test.info().project.name.replace(/ /g, '-');


async function collect(page: Page) {
  return page.evaluate(() => {
    const cs = new Set<string>();
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor'];
    let bf = 0;
    const bfEls: string[] = [];
    const items: Array<{ text: string; color: string; x: number; y: number; w: number; h: number; size: number; bold: boolean; op: number }> = [];
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      const bw: Record<string, string> = { borderTopColor: s.borderTopWidth, borderRightColor: s.borderRightWidth, borderBottomColor: s.borderBottomWidth, borderLeftColor: s.borderLeftWidth };
      for (const p of props) {
        if (p in bw && bw[p] === '0px') continue;
        if (p === 'outlineColor' && s.outlineStyle === 'none') continue;
        const v = s[p as 'color'];
        if (v) cs.add(`${p}|${v}`);
      }
      if (el instanceof SVGElement) {
        if (s.fill && s.fill !== 'none' && !s.fill.startsWith('url')) cs.add(`fill|${s.fill}`);
        if (s.stroke && s.stroke !== 'none' && !s.stroke.startsWith('url')) cs.add(`stroke|${s.stroke}`);
      }
      const b = s.backdropFilter || (s as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter;
      if (b && b !== 'none') {
        bf++;
        bfEls.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
      }
      // visible text elements: own non-empty text node
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
      if (!own || el instanceof SVGElement) continue;
      if (s.visibility === 'hidden' || s.display === 'none') continue;
      let op = 1;
      for (let a: Element | null = el; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity);
      if (op < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      if ((el as HTMLButtonElement).disabled || el.closest('[aria-disabled=true],:disabled')) continue;
      const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2)));
      if (!hit || !(el.contains(hit) || hit.contains(el))) continue; // covered by a bar, sheet or scrim
      items.push({ text: (el.textContent ?? '').trim().slice(0, 40), color: s.color, x: r.x, y: r.y, w: r.width, h: r.height, size: parseFloat(s.fontSize), bold: parseInt(s.fontWeight) >= 700, op });
    }
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const heads = [...document.querySelectorAll('h1,h2,h3')].slice(0, 3).map((h) => getComputedStyle(h).fontFamily);
    const interOk = document.fonts.check('16px Inter');
    const faces = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    const bgs = [...document.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).filter((v) => v !== 'none');
    return { colours: [...cs], bf, bfEls, items, bodyFont, heads, interOk, faces, bgImgSample: [...new Set(bgs)].slice(0, 30) };
  });
}

const rgbaOf = (css: string): [number, number, number, number] => {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (m) {
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  const c = /color\(srgb ([^)]+)\)/.exec(css);
  if (c) {
    const p = c[1]!.split(/[ /]+/).filter(Boolean).map(Number);
    return [Math.round(p[0]! * 255), Math.round(p[1]! * 255), Math.round(p[2]! * 255), p[3] ?? 1];
  }
  return [0, 0, 0, 1];
};
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

async function audit(page: Page, name: string, shot = true) {
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(700);
  const data = await collect(page);
  if (shot) await page.screenshot({ path: `${SHOTS}/${name}-${proj()}.png` });
  // Pixel contrast: hide text, screenshot, sample the background under each text box.
  await page.evaluate(() => {
    const sh = new CSSStyleSheet();
    sh.replaceSync('*{color:transparent !important;-webkit-text-fill-color:transparent !important;text-shadow:none !important;caret-color:transparent !important}');
    (window as unknown as { __hide: CSSStyleSheet }).__hide = sh;
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];
  });
  await page.waitForTimeout(100);
  const png = await page.screenshot({ scale: 'css' });
  const { data: px, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const contrast: Array<{ text: string; ratio: number; need: number; fg: number[]; bg: number[]; size: number }> = [];
  for (const it of data.items) {
    const x0 = Math.max(0, Math.floor(it.x)), y0 = Math.max(0, Math.floor(it.y));
    const x1 = Math.min(info.width, Math.ceil(it.x + it.w)), y1 = Math.min(info.height, Math.ceil(it.y + it.h));
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * info.width + x) * info.channels;
      rs.push(px[i]!); gs.push(px[i + 1]!); bs.push(px[i + 2]!);
    }
    const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]!;
    const bg = [med(rs), med(gs), med(bs)];
    const c = rgbaOf(it.color);
    const a = c[3] * it.op;
    const fg = [0, 1, 2].map((k) => c[k]! * a + bg[k]! * (1 - a));
    const large = it.size >= 24 || (it.size >= 18.66 && it.bold);
    contrast.push({ text: it.text, ratio: Math.round(ratio(fg, bg) * 100) / 100, need: large ? 3 : 4.5, fg: fg.map(Math.round), bg, size: it.size });
  }
  await page.evaluate(() => { const w = window as unknown as { __hide: CSSStyleSheet }; document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== w.__hide); });
  const low = contrast.filter((c) => c.ratio < c.need);
  appendFileSync(
    `${OUT}/${proj()}.jsonl`,
    JSON.stringify({ name, bf: data.bf, bfEls: data.bfEls, bodyFont: data.bodyFont, heads: data.heads, interOk: data.interOk, faces: data.faces, colours: data.colours, nText: contrast.length, minRatio: Math.min(...contrast.map((c) => c.ratio), 99), low, sample: contrast.slice(0, 6) }) + '\n',
  );
  return { data, contrast, low };
}

/** Run one screen step; a navigation failure is logged, never hides the other screens. */
async function step(page: Page, name: string, fn: () => Promise<void>, shot = true) {
  try {
    await fn();
    await audit(page, name, shot);
  } catch (e) {
    appendFileSync(`${OUT}/${proj()}.jsonl`, JSON.stringify({ name, error: String(e).slice(0, 200) }) + '\n');
  }
}

test.beforeEach(async ({ page }) => simulateSafeAreas(page));

test('walk 1: Today, plans, viewer, day list, time sheet, history, settings, gyms, run, dev', async ({ page }) => {
  test.setTimeout(280_000);
  page.setDefaultTimeout(6000);
  await page.goto('./');
  await step(page, 'today-no-plan', async () => { await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible(); });
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }, { reps: 8, load: bar185 }] });
  await step(page, 'plans', async () => { await page.getByRole('button', { name: 'See plans' }).tap(); await expect(page.getByTestId('plan-five-day-split')).toBeVisible(); });
  await step(page, 'plan-viewer', async () => { await page.getByTestId('plan-five-day-split').tap(); await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible(); });
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await step(page, 'today-plan', async () => { await page.goto('./'); await expect(page.getByTestId('day-card-title')).toBeVisible(); });
  await step(page, 'day-list', async () => {
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
  });
  await step(page, 'time-budget-sheet', async () => {
    await page.getByTestId('time-estimate').tap();
    const sheet = page.getByRole('dialog', { name: 'How much time today?' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio', { name: '30', exact: true }).tap();
  });
  await step(page, 'history', async () => { await page.goto('./#/history'); await page.waitForTimeout(300); });
  await step(page, 'history-detail', async () => { await page.locator('a[href*="history/"]').first().tap(); await page.waitForTimeout(300); });
  await step(page, 'run', async () => { await page.goto('./#/run'); });
  await step(page, 'settings', async () => { await page.goto('./#/settings'); await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible(); });
  await step(page, 'settings-coach', async () => { await page.getByTestId('settings-coach').scrollIntoViewIfNeeded(); });
  await step(page, 'gyms', async () => { await page.goto('./#/settings/gyms'); });
  await step(page, 'gym-detail', async () => { await page.locator('[data-testid^="gym"]').first().tap(); });
  await step(page, 'gym-equipment', async () => { const l = page.locator('a[href*="/equipment"], [data-testid*="equipment"]').first(); await l.tap(); });
  await step(page, 'settings-import', async () => { await page.goto('./#/settings/import'); });
  await step(page, 'quick-ideas', async () => { await page.goto('./#/quick?min=30'); await expect(page.locator('[data-concept]').first()).toBeVisible(); });
  await step(page, 'review', async () => { await page.goto('./#/review'); });
  await step(page, 'review-new-grid', async () => { await page.goto('./#/review/new'); });
  for (const d of ['ui', 'plates', 'loads', 'info', 'muscles']) {
    await step(page, `dev-${d}`, async () => { await page.goto(`./?dev#/dev/${d}`); await page.waitForTimeout(500); });
  }
  await step(page, 'dev-viewport', async () => { await page.goto('./?dev#/dev/viewport'); });
});

test('walk 2: workout exercise view, weight sheet, set logged, rest bar, menu, Replace, finish', async ({ page }) => {
  test.setTimeout(200_000);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await step(page, 'exercise-view', async () => { await expect(view).toBeVisible(); });
  await step(page, 'weight-sheet', async () => {
    await view.getByRole('button', { name: 'Set 1: set the weight' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  });
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Done' }).tap();
  await view.getByTestId('check-current').tap();
  await view.getByTestId('check-current').tap();
  await step(page, 'set-logged-rest-bar', async () => { await expect(view.getByTestId('set-row').first()).toBeVisible(); });
  await step(page, 'more-menu', async () => { await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap(); });
  await step(page, 'replace-sheet', async () => { await page.getByTestId('replace-row').tap(); await expect(page.getByRole('dialog', { name: 'Replace Barbell Back Squat' })).toBeVisible(); });
  await page.reload();
  await step(page, 'workout-after-reload', async () => { await page.waitForTimeout(1200); appendFileSync(`${OUT}/${proj()}.jsonl`, JSON.stringify({ name: 'reload-url', url: page.url() }) + '\n'); });
  await step(page, 'finish', async () => {
    await page.getByRole('button', { name: 'Finish' }).first().tap();
    await expect(page).toHaveURL(/done$/, { timeout: 8000 });
  });
});

test('walk 3: Quick ideas, deck, info sheet', async ({ page }) => {
  test.setTimeout(120_000);
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await page.getByTestId('min-30').tap();
  await step(page, 'quick-ideas2', async () => { await expect(page.locator('[data-concept]').first()).toBeVisible(); });
  await step(page, 'quick-deck', async () => { await page.locator('[data-concept]').first().tap(); await expect(card(page)).toBeVisible(); });
  await step(page, 'quick-deck-info', async () => { await page.getByTestId('deck-info').tap(); });
});

test.describe('fresh phone', () => {
  test.use({ intake: 'fresh' });
  test('walk 4: intake and reveal', async ({ page }) => {
    test.setTimeout(180_000);
    const intake = page.getByTestId('intake');
    const at = (s: string) => expect(intake).toHaveAttribute('data-step', s);
    const pick = (screen: string, id: string) => page.getByTestId(`q-${screen}-${id}`).tap();
    const next = () => page.getByTestId('intake-cta').locator('button[data-variant="primary"]').tap();
    const skip = () => page.getByTestId('skip').tap();
    await page.goto('./');
    await step(page, 'intake-goal', async () => at('goal'));
    await pick('goal', 'muscle');
    await step(page, 'intake-goal-picked', async () => {});
    await next(); await at('units'); await next(); await at('focus');
    // 3.5u: win, when and bodyweight are hidden until their features exist.
    await pick('focus', 'balance'); await next(); await at('experience');
    await pick('experience', '3y'); await at('days');
    await step(page, 'intake-days', async () => {});
    await pick('days', '5'); await at('weekdays'); await skip(); await at('minutes');
    await pick('minutes', '60'); await at('place'); await pick('place', 'full'); await at('equipment');
    await step(page, 'intake-equipment', async () => {});
    await next(); await at('style'); await pick('style', 'mix'); await at('cardio');
    await pick('cardio', 'little'); await next(); await at('easyOn'); await skip(); await at('exercises');
    await step(page, 'intake-exercises-deck', async () => {});
    await skip(); await at('about'); await skip(); await at('reveal');
    await step(page, 'intake-reveal', async () => { await page.waitForTimeout(1200); });
  });
});

/** Frame times (rAF deltas) while the main scroller moves 14 px a frame for ~2.5 s. */
async function scrollFrames(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ n: number; p50: number; p90: number; max: number; scroller: string; range: number }>((done) => {
        const cands = [...document.querySelectorAll<HTMLElement>('*')].filter((e) => {
          const o = getComputedStyle(e).overflowY;
          return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 40;
        });
        const el = cands.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? document.scrollingElement!;
        const times: number[] = [];
        let last = performance.now();
        let dir = 1;
        const t0 = last;
        const tick = (t: number) => {
          times.push(t - last);
          last = t;
          el.scrollTop += 14 * dir;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) dir = -1;
          if (el.scrollTop <= 0) dir = 1;
          if (t - t0 < 2500) requestAnimationFrame(tick);
          else {
            const s = times.slice(2).sort((a, b) => a - b);
            done({ n: s.length, p50: s[Math.floor(s.length * 0.5)]!, p90: s[Math.floor(s.length * 0.9)]!, max: s[s.length - 1]!, scroller: `${el.tagName}.${String(el.className).split(' ')[0]}`, range: el.scrollHeight - el.clientHeight });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

test('scroll performance: Today and the day list, p90 frame time', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
  await usePlan(page);
  const out: Record<string, unknown> = {};
  out.today = await scrollFrames(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await page.waitForTimeout(500);
  out.dayList = await scrollFrames(page);
  mkdirSync(OUT, { recursive: true });
  appendFileSync(`${OUT}/${proj()}.jsonl`, JSON.stringify({ name: 'perf', ...out }) + '\n');
});
