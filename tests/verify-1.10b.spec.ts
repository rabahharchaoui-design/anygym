import { expect, test, type Page } from './fixtures';

const errs = (page: Page) => {
  const e: string[] = [];
  page.on('console', (m) => m.type() === 'error' && e.push(m.text()));
  page.on('pageerror', (x) => e.push(x.message));
  return e;
};
const probe = (page: Page) =>
  page.evaluate(() => {
    // 1.7e: pushed screens hide the tab bar; their bottom dock owns the inset instead.
    const nav = document.querySelector('nav[aria-label="Main"]:not([data-hidden])');
    const bar = document.querySelector('[data-testid="action-bar"]');
    const el = (nav ?? bar) as Element | null;
    return {
      ih: window.innerHeight,
      bottom: el ? el.getBoundingClientRect().bottom : null,
      sw: document.scrollingElement!.scrollWidth,
      iw: window.innerWidth,
      top: document.querySelector('header')?.getBoundingClientRect().top ?? 0,
    };
  });

for (const r of ['./', './#/history', './#/plans', './#/settings', './#/plans/six-week-volume', './#/plans/five-day-split']) {
  for (const vp of [null, { width: 440, height: 700 }]) {
    test(`1.10b ${r} ${vp ? 'short' : 'native'}`, async ({ page }) => {
      const e = errs(page);
      if (vp) await page.setViewportSize(vp);
      await page.goto(r);
      await page.waitForTimeout(800);
      const p = await probe(page);
      expect(p.bottom, JSON.stringify(p)).not.toBeNull();
      expect(Math.abs(p.bottom! - p.ih)).toBeLessThanOrEqual(1);
      expect(p.sw).toBeLessThanOrEqual(p.iw);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(e).toEqual([]);
    });
  }
}
