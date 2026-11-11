import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { insetsOf, simulateSafeAreas } from './helpers/layout';
import { bar185, dbAll, exerciseView, navIdle, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Tester sweep for PLAN 3.5h (independent of tests/safe-area-3.5h.spec.ts): the workout header
// (timer and Finish) and three sheets with the phone's real insets, status strip colour, a document
// that never scrolls, and a numeric keyboard field.

const SHOTS = 'reports/shots/3.5h-verify';
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

type Report = { bad: string[]; strip: string; scrollY: number; docOverflow: number };

async function sweep(page: Page, name: string): Promise<Report> {
  await page.waitForTimeout(500);
  const ins = insetsOf();
  const r = await page.evaluate((i) => {
    const H = innerHeight;
    const vis = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      }
      return true;
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(vis);
    const root = dialogs.length ? dialogs[dialogs.length - 1]! : document.body;
    const bad: string[] = [];
    for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="radio"], [role="switch"]')) {
      if (!vis(el) || el.closest('[inert]')) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      let top = b.top;
      let bottom = b.bottom;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowY === 'visible') continue;
        const q = p.getBoundingClientRect();
        top = Math.max(top, q.top);
        bottom = Math.min(bottom, q.bottom);
      }
      if (bottom - top < 1) continue;
      const name = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
      if (top < i.top - 0.5) bad.push(`${name} top ${Math.round(top)} < inset ${i.top}`);
      if (bottom > H - i.bottom + 0.5) bad.push(`${name} bottom ${Math.round(bottom)} > ${H - i.bottom}`);
    }
    // The status strip: the first non transparent background under the strip's middle.
    let strip = 'none';
    for (let e: Element | null = document.elementFromPoint(innerWidth / 2, Math.max(1, i.top / 2)); e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
        strip = c;
        break;
      }
    }
    window.scrollTo(0, 120);
    document.scrollingElement!.scrollTop = 120;
    return { bad, strip, scrollY: document.scrollingElement!.scrollTop, docOverflow: document.scrollingElement!.scrollHeight - innerHeight };
  }, ins);
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(r.bad, `${name}: no control inside an inset`).toEqual([]);
  expect(r.scrollY, `${name}: the page cannot be scrolled`).toBe(0);
  expect(r.docOverflow, `${name}: no document overflow`).toBeLessThanOrEqual(1);
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(r.strip);
  expect(m, `${name}: strip has a background (${r.strip})`).toBeTruthy();
  expect(Math.max(+m![1]!, +m![2]!, +m![3]!), `${name}: strip is dark like the screen (${r.strip})`).toBeLessThan(80);
  return r;
}

const dlg = (page: Page, n: string | RegExp) => page.getByRole('dialog', { name: n });

test('workout header (timer, Finish) and sheets clear the insets @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 3 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await navIdle(page);
  const ins = insetsOf();
  for (const loc of [page.getByTestId('elapsed'), page.getByRole('button', { name: 'Finish', exact: true }), page.getByTestId('workout-title')]) {
    const b = (await loc.boundingBox())!;
    expect(b.y, 'header control starts below the top inset').toBeGreaterThanOrEqual(ins.top);
  }
  await sweep(page, 'header');
  // Sheet 1: time budget.
  await page.getByTestId('time-estimate').tap();
  await expect(dlg(page, 'How much time today?')).toBeVisible();
  await sweep(page, 'sheet-time');
  await page.keyboard.press('Escape');
  await expect(dlg(page, 'How much time today?')).toHaveCount(0);
  // Exercise view, then sheet 2: set type; sheet 3: replace.
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('check-current')).toBeEnabled();
  await navIdle(page);
  await page.waitForTimeout(400);
  await sweep(page, 'exercise');
  await view.getByTestId('set-todo').first().getByTestId('set-type').tap();
  await expect(dlg(page, 'Set type')).toBeVisible();
  await sweep(page, 'sheet-settype');
  await page.keyboard.press('Escape');
  await expect(dlg(page, 'Set type')).toHaveCount(0);
  await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await page.getByTestId('replace-row').tap();
  await expect(dlg(page, 'Replace Barbell Back Squat')).toBeVisible();
  await sweep(page, 'sheet-replace');
  await page.keyboard.press('Escape');
  await expect(dlg(page, 'Replace Barbell Back Squat')).toHaveCount(0);
  // A numeric keyboard field: focus, type, blur; the page stays at the top, the header in place.
  const num = view.locator('input[inputmode="numeric"], input[inputmode="decimal"], input[type="number"]').first();
  if (await num.count()) {
    await num.focus();
    await page.waitForTimeout(300);
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
    await sweep(page, 'after-keyboard');
  }
  // Log one set (an empty workout is discarded), then double tap Finish: one finished workout, no stuck screen.
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await sweep(page, 'rest');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await sweep(page, 'finish');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const sessions = await dbAll<{ endedAt?: number }>(page, 'sessions');
  expect(sessions.filter((x) => x.endedAt).length, 'one new finished workout (plus the seeded one)').toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('removing the protection is caught: the header without its top padding fails the check @matrix', async ({ page }) => {
  await usePlan(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await navIdle(page);
  // Sabotage: the safe area reads 0 for everything (what an un protected header would see).
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-top', '0px'));
  await page.waitForTimeout(500);
  const ins = insetsOf();
  const y = (await page.getByRole('button', { name: 'Finish', exact: true }).boundingBox())!.y;
  if (ins.top > 0) expect(y, 'with --safe-top 0 the header moves up under the inset').toBeLessThan(ins.top);
});

test('numeric field focus and blur leave the page at the top, header in place @matrix', async ({ page }) => {
  await page.goto('./#/settings');
  await page.evaluate(
    (a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'equipment', answers: a })),
    { units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'home', equipmentFor: 'home', equipment: [] },
  );
  await page.goto('./#/welcome');
  await page.reload();
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', 'equipment');
  await sweep(page, 'intake-equipment');
  await page.getByTestId('equip-dumbbells').tap();
  const field = page.getByTestId('range-min');
  await field.scrollIntoViewIfNeeded();
  await field.tap();
  await page.keyboard.type('15');
  // What iOS does when the keyboard rises: try to scroll the page to the field.
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop), 'keyboard up: page at the top').toBe(0);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop), 'keyboard down: page at the top').toBe(0);
  await sweep(page, 'intake-after-keyboard');
});

test('deck: no layout shift while the demo loops, only top and next move, frame timing during a swipe', async ({ page, browserName }) => {
  const errors = watchErrors(page);
  const { pastIntake, card, swipe } = await import('./helpers/quick');
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await page.locator('[data-concept]').first().tap();
  await expect(card(page)).toBeVisible();
  const demo = card(page).getByTestId('deck-demo');
  await expect(demo.locator('[data-frame="1"] img')).toHaveCount(1);
  const rects = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const b = (await card(page).boundingBox())!;
    const d = (await demo.boundingBox())!;
    rects.add([b.x, b.y, b.width, b.height, d.x, d.y, d.width, d.height].map((n) => Math.round(n * 10) / 10).join(','));
    await page.waitForTimeout(300);
  }
  expect(rects.size, 'card and demo never change size or place while the loop runs').toBe(1);
  const moving = await page.locator('[data-testid="deck-demo"]').evaluateAll((els) => els.filter((el) => { const e = el.querySelector('[data-frame="1"]'); return !!e && getComputedStyle(e).animationName !== 'none'; }).length);
  // 3.5f round 3: the incoming swap card is rendered under the top card too, so three at most (top, next, incoming swap).
  expect(moving, 'at most the top card, the next one and the incoming swap animate').toBeLessThanOrEqual(3);
  expect(await page.getByTestId('deck-demo').count()).toBeLessThanOrEqual(3);
  await page.evaluate(() => {
    const w = window as unknown as { __f: number[]; __s: boolean };
    w.__f = []; w.__s = false;
    let last = performance.now();
    const loop = (t: number) => { w.__f.push(t - last); last = t; if (!w.__s) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  for (let i = 0; i < 3; i++) { await swipe(page, -250, { steps: 10 }); await page.waitForTimeout(500); }
  const f = await page.evaluate(() => { const w = window as unknown as { __f: number[]; __s: boolean }; w.__s = true; return w.__f; });
  const sorted = [...f].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
  console.log(`DECK p90 ${p90.toFixed(1)} ms over ${f.length} frames (${browserName})`);
  expect(p90).toBeLessThan(25);
  expect(errors).toEqual([]);
});
