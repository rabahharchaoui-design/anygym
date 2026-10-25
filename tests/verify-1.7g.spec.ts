import { expect, test, type Page } from './fixtures';
import { bar185, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Tester check for PLAN 1.7g: 130% text on the SE. Root font size 130% via init script, plus
// every px sized text scaled by 1.3 (px sizes ignore the root; iOS text size scales both).
test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { const set = () => { if (document.documentElement) document.documentElement.style.fontSize = '130%'; }; set(); document.addEventListener('DOMContentLoaded', set); });
});

async function scalePx(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    document.querySelectorAll<HTMLElement>('[data-scaled]').forEach((e) => { e.style.fontSize = ''; delete e.dataset.scaled; });
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    root.style.fontSize = '100%';
    const a = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    root.style.fontSize = '130%';
    els.forEach((e, i) => {
      const s = getComputedStyle(e);
      const b = parseFloat(s.fontSize);
      if (Math.abs(b - a[i]!) < 0.01 && !e.dataset.scaled) { e.style.fontSize = `${b * 1.3}px`; e.dataset.scaled = '1'; }
    });
  });
  await page.waitForTimeout(200);
}

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    const vis = (e: HTMLElement) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[aria-hidden="true"], [inert]'); };
    const leaves: Array<{ e: HTMLElement; r: DOMRect }> = [];
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (!vis(e) || /_digit_|_strip|data-skeleton/.test(e.className)) continue;
      const s = getComputedStyle(e);
      const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      const clamp = (s as unknown as Record<string, string>).webkitLineClamp;
      if (clamp && clamp !== 'none') bad.push(`LINE-CLAMP ${clamp} on ${e.tagName}.${e.className}`);
      if (own || /^H[1-6]$/.test(e.tagName)) {
        const hides = /(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflowY) || s.textOverflow === 'ellipsis';
        if (hides && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)) bad.push(`CLIP ${e.tagName}.${e.className} "${(e.textContent ?? '').trim().slice(0, 30)}" ${e.scrollWidth}x${e.scrollHeight}>${e.clientWidth}x${e.clientHeight}`);
        // an ancestor that clips this text
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (/(hidden|clip)/.test(ps.overflowX + ps.overflowY) && !/auto|scroll/.test(ps.overflowY) && !/_stage_/.test(p.className) && p.scrollHeight <= p.clientHeight + 400) {
            const pr = p.getBoundingClientRect(); const r = e.getBoundingClientRect();
            if (r.right > pr.right + 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || r.top < pr.top - 1) { bad.push(`ANCESTOR-CLIP ${e.tagName} "${(e.textContent ?? '').trim().slice(0, 30)}" by ${p.tagName}.${p.className}`); break; }
          }
        }
        if (!Array.from(e.children).some((c) => (c as HTMLElement).innerText?.trim())) leaves.push({ e, r: e.getBoundingClientRect() });
      }
    }
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i]!, b = leaves[j]!;
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      const layer = (e: HTMLElement) => { for (let p: HTMLElement | null = e; p; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === 'fixed' || ps === 'sticky' || p.tagName === 'NAV' || p.tagName === 'HEADER') return p; } return null; };
      if (layer(a.e) !== layer(b.e)) continue;
      if (a.r.bottom <= 0 || a.r.top >= innerHeight || b.r.bottom <= 0 || b.r.top >= innerHeight) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 3 && h > 3) bad.push(`OVERLAP "${a.e.textContent!.trim().slice(0, 20)}" x "${b.e.textContent!.trim().slice(0, 20)}"`);
    }
    if (document.documentElement.scrollWidth > innerWidth) bad.push(`SIDEWAYS ${document.documentElement.scrollWidth}>${innerWidth}`);
    return bad;
  });
}

/** Primary buttons reachable: on screen, or inside a scroller that can bring them on screen; not covered. */
async function reach(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('button, a[href]'))) {
      if (e.closest('[aria-hidden="true"], [inert]')) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let scrollable = false;
      for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) scrollable = true; }
      if ((r.bottom > innerHeight + 1 || r.top < -1 || r.right > innerWidth + 1) && !scrollable) out.push(`UNREACHABLE ${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)} at ${Math.round(r.top)}-${Math.round(r.bottom)}`);
    }
    return out;
  });
}

test('1.7g every screen at 130% on SE', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const found: string[] = [];
  const shot = async (name: string) => {
    await page.waitForTimeout(600);
    await scalePx(page);
    await page.screenshot({ path: `reports/shots/1.7g/${name}.png` });
    for (const b of [...(await problems(page)), ...(await reach(page))].filter((x) => !(name === 'info-sheet' && x.startsWith('UNREACHABLE Close')))) found.push(`${name}: ${b}`);
  };
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe('130%');
  await shot('today');
  await page.getByRole('link', { name: 'Plans' }).tap();
  await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
  await shot('plans');
  await page.getByTestId('plan-six-week-volume').tap();
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await shot('viewer');
  await page.goto('./#/run'); await expect(page.getByRole('heading', { level: 1, name: 'Run' })).toBeVisible(); await shot('run');
  await page.goto('./#/settings'); await expect(page.getByTestId('app-version')).toBeVisible(); await shot('settings');
  await page.goto('./');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await shot('day-list');
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('check-current')).toBeVisible();
  await shot('exercise-4rows');
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await shot('exercise-rest');
  await view.getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(weight).toBeVisible();
  await shot('weight-sheet');
  await weight.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(900);
  await shot('finish');
  await page.getByRole('button', { name: 'Done' }).tap();
  await page.getByRole('link', { name: 'History' }).tap();
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  await shot('history');
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByTestId('history-meta')).toBeVisible();
  await shot('history-detail');
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const add = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(add).toBeVisible();
  await shot('picker');
  await add.getByRole('searchbox', { name: 'Search exercises' }).fill('leg press');
  await add.getByRole('button', { name: 'Leg Press', exact: true }).tap();
  await add.getByRole('button', { name: 'Add 1' }).tap();
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Set starting weight' }).tap();
  await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
  await expect(page.getByRole('dialog', { name: 'Plate loaded machine' })).toBeVisible();
  await shot('info-sheet');
  console.log('PROBLEMS\n' + [...new Set(found)].join('\n'));
  expect([...new Set(found)]).toEqual([]);
  expect(errors).toEqual([]);
});
