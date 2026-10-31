import { expect, test, type Page } from './fixtures';
import { exerciseView, fitsOneScreen, quickWith, watchErrors } from './workout-helpers';

// Tester round 3: workout layout rules for the fat plate diagram.
const dev = () => test.info().project.name.replace(/ /g, '-');
const shot = (page: Page, n: string) => page.screenshot({ path: `reports/shots/2.0b/v3/${n}-${dev()}.png` });

async function open(page: Page) {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  return view;
}

test.describe('verify 2.0b v3 layout', () => {
  test('exercise view + weight sheet @matrix', async ({ page }) => {
    test.setTimeout(120_000);
    const errs = watchErrors(page);
    const view = await open(page);
    await fitsOneScreen(page);
    await shot(page, 'exview');
    await view.getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(sheet).toBeVisible();
    const tray = (w: number) => sheet.locator(`button[data-weight="${w}"]`).first();
    for (const w of [45, 45, 35, 25, 10, 5, 2.5]) { await tray(w).tap(); await page.waitForTimeout(80); }
    await page.waitForTimeout(700);
    await shot(page, 'sheet380');
    const info = await page.evaluate(() => {
      const vh = innerHeight, vw = innerWidth;
      const sheet = document.querySelector('[role="dialog"]')!;
      const hit = (el: Element | null) => {
        if (!el) return 'missing';
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        return { ok: !!top && (el === top || el.contains(top) || top.contains(el)), inView: r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw, w: r.width, h: r.height, text: (el.textContent || '').trim().slice(0, 20) };
      };
      const btn = (t: RegExp) => [...sheet.querySelectorAll('button')].find((b) => t.test((b.textContent || '') + (b.getAttribute('aria-label') || '')));
      const total = sheet.querySelector('[data-testid="plate-total"]') as HTMLElement;
      return {
        bar: hit(sheet.querySelector('[data-testid="plate-svg"]')),
        change: hit(btn(/Change/)!), typeit: hit(btn(/^Type it$/)!), clear: hit(btn(/^Clear$/)!), done: hit(btn(/^Done$/)!),
        tray: [...sheet.querySelectorAll('button[data-weight]')].map((b) => ({ ...(hit(b) as object) })),
        removeL: hit(sheet.querySelector('[data-testid="remove-left"]')), removeR: hit(sheet.querySelector('[data-testid="remove-right"]')),
        math: total.getAttribute('data-math'),
        sheetScroll: (sheet.querySelector('[data-scroller]') ?? sheet).scrollHeight > (sheet.querySelector('[data-scroller]') ?? sheet).clientHeight + 1,
        card: (() => { const c = sheet.querySelector('[data-testid="plate-svg"]')!.closest('section, div')!.getBoundingClientRect(); return [c.left, c.right]; })(),
        txt: ['Type it', 'Clear'].map((t) => { const b = btn(new RegExp(`^${t}$`))!; const r = b.getBoundingClientRect(); const s = sheet.querySelector('[data-testid="plate-svg"]')!.closest('section')?.getBoundingClientRect(); return { t, l: r.left, r: r.right, cardL: s?.left, cardR: s?.right }; }),
        sw: document.documentElement.scrollWidth - vw,
      };
    });
    console.log('SHEET', dev(), JSON.stringify(info));
    expect(errs).toEqual([]);
  });
});
