import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { allowConsoleErrors, expect, test, type Page } from './fixtures';
import { mockReportApi } from './helpers/reportApi';
import { checkCurrent, exerciseView, loggedRows, usePlan, navIdle } from './workout-helpers';

// PLAN 2.2f: every screen loads under the Content Security Policy with zero violations and zero
// console errors (the errorTrap fixture fails the test on any console error), and the built output
// carries the policy and no source maps. Needs a fresh `npm run build` (the webServer does it).

const DIST = join(process.cwd(), 'dist');

async function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp.slice());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
});

test('the built index.html carries the CSP meta tag and dist has no source maps @matrix', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  expect(m, 'CSP meta tag').not.toBeNull();
  const csp = m![1]!;
  for (const d of ["default-src 'self'", "script-src 'self'", "img-src 'self' data: blob:", "font-src 'self'", "worker-src 'self'", "manifest-src 'self'", "base-uri 'self'", "form-action 'self'"]) expect(csp).toContain(d);
  expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|style-src [^;]*unsafe-inline/);
  expect(csp).toMatch(/connect-src 'self' https:\/\/anygym-api\.[a-z0-9.-]+\.workers\.dev(;|$)/);
  expect(csp).not.toContain('__CSP__');
  // No inline script at all in the page.
  expect([...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)]).toHaveLength(0);
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  expect(walk(DIST).filter((f) => f.endsWith('.map'))).toEqual([]);
});

test('every screen loads with zero CSP violations @matrix', async ({ page, context }) => {
  const sent = await mockReportApi(context);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

  // Service worker and manifest work under the policy.
  await page.evaluate(async () => {
    await navigator.serviceWorker?.ready;
  });
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
    const r = href ? await fetch(href) : null;
    return r ? { ok: r.ok, name: (await r.json()).name as string } : null;
  });
  expect(manifest).toEqual({ ok: true, name: 'AnyGym' });

  // Blob and data images and media: allowed by img-src / media-src.
  const blobs = await page.evaluate(async () => {
    const url = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'], { type: 'image/svg+xml' }));
    const load = (src: string) => new Promise<boolean>((res) => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = src;
    });
    const a = await load(url);
    const b = await load('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%222%22 height=%222%22/%3E');
    const v = document.createElement('video');
    v.src = URL.createObjectURL(new Blob([new Uint8Array(8)], { type: 'video/mp4' }));
    return { a, b };
  });
  expect(blobs).toEqual({ a: true, b: true });

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Run', 'History', 'Plans', 'Today']) {
    await nav.getByRole('link', { name }).tap();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  // Plans, a plan, the day list.
  await page.getByRole('link', { name: 'Plans' }).tap();
  await page.getByTestId('plan-five-day-split').tap();
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await expect(page.locator('[data-testid^="plan-item-"]').first()).toBeVisible();

  // Today with the plan, a workout, an exercise (demo photos), the weight sheet, a logged set, finish.
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-title')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();

  // History and its detail.
  await nav.getByRole('link', { name: 'History' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  await page.goto('./#/history');
  const first = page.locator('a[href*="#/history/"]').first();
  if (await first.count()) {
    await first.tap();
    await expect(page).toHaveURL(/#\/history\/.+/);
  }

  // Settings, its sections, the backup download (a blob link) and Report a problem with the Worker answered.
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  expect(download.suggestedFilename()).toMatch(/^anygym-backup-/);
  await page.getByTestId('report-problem').tap();
  const report = page.getByRole('dialog', { name: 'Report a problem' });
  await expect(report).toBeVisible();
  await report.getByTestId('report-text').fill('CSP walk: everything loads');
  await report.getByTestId('report-send').tap();
  await expect(report.getByText('Sent. Thanks, this goes straight to the builder.', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  await report.getByRole('button', { name: /Close|Done/ }).first().tap().catch(() => undefined);

  // Sub screens and the dev UI page.
  await page.goto('./#/settings/import');
  await page.waitForTimeout(300);
  await page.goto('./#/review');
  await page.waitForTimeout(300);
  await page.goto('./?dev#/dev/ui');
  await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  await page.waitForTimeout(500);
  await navIdle(page).catch(() => undefined);

  expect(await violations(page)).toEqual([]);
});

test('the policy is really enforced: an inline script is refused and reported @matrix', async ({ page }) => {
  allowConsoleErrors(/Content Security Policy|Refused|unsafe-eval|EvalError/);
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__ran = true';
    document.head.appendChild(s);
    return (window as unknown as { __ran?: boolean }).__ran === true;
  });
  expect(ran).toBe(false);
  await expect.poll(async () => (await violations(page)).length).toBeGreaterThanOrEqual(1);
});
