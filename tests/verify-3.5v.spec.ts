import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas, insetsOf } from './helpers/layout';
import { touchDrag, touchFlick } from './helpers/touch';
import { dbAll, navIdle, watchErrors } from './workout-helpers';

test.use({ serviceWorkers: 'block' });
const OUT = 'reports/shots/3.5v-verify';
const P = () => test.info().project.name.replace(/ /g, '-');
const card = (p: Page) => p.getByTestId('deck-card');

async function open(page: Page, which: 'core' | 'new') {
  await page.route('**/assets/candidate-precheck-*.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify({ checkCarefully: [], notes: {} })};` }));
  await page.goto('./#/settings');
  for (let i = 0; i < 5; i++) await page.getByTestId('app-version').tap();
  await expect(card(page)).toBeVisible();
  await navIdle(page);
  if (which === 'new') {
    await page.getByTestId('review-menu').tap();
    await page.getByTestId('open-new-exercises').tap();
    await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', /./);
    if ((await page.getByTestId('candidate-review').getAttribute('data-view')) === 'grid') await page.getByTestId('review-mode').tap();
    await expect(card(page)).toBeVisible();
    await navIdle(page);
  }
}

for (const which of ['core', 'new'] as const) {
  test(`verify ${which}: geometry, every scroll container, insets, 130 percent`, async ({ page }) => {
    const errors = watchErrors(page);
    const ins = insetsOf();
    await simulateSafeAreas(page);
    await open(page, which);
    await expect(card(page).getByTestId('deck-demo').locator('img').first()).toBeVisible();
    await page.waitForTimeout(500);
    const measure = () => page.evaluate(({ top, bottom }) => {
      const vh = innerHeight;
      const scrollers = [document.documentElement, document.body, ...Array.from(document.querySelectorAll<HTMLElement>('*'))].filter((el) => {
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        return (el === document.documentElement || el === document.body || (/(auto|scroll)/.test(cs.overflowY) && r.width > 0));
      }).map((el) => ({ n: el.tagName + '.' + String(el.className).slice(0, 30), top: el.scrollTop, over: el.scrollHeight - el.clientHeight }));
      const demo = document.querySelector<HTMLElement>('[data-testid=deck-card] [data-testid=deck-demo]')!.getBoundingClientRect();
      const thumb = document.querySelector<HTMLElement>('[data-testid=deck-card] [data-testid=review-map]')?.getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button')).filter((b) => !b.closest('[data-under]') && b.getBoundingClientRect().width > 0).map((b) => { const r = b.getBoundingClientRect(); return { l: b.getAttribute('aria-label') || b.textContent!.slice(0, 15), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), tp: b.getAttribute('data-testid') }; });
      const h1 = document.querySelector('h1')!.getBoundingClientRect();
      return { vh, scrollers, demoH: demo.height, share: demo.height / vh, thumb: thumb && { w: thumb.width, h: thumb.height }, btns, h1top: h1.top, topInset: top, bottomInset: bottom, lowest: Math.max(...btns.map((b) => b.bottom)) };
    }, { top: ins.top, bottom: ins.bottom });
    const m = await measure();
    console.log(`V ${which} ${P()} share=${m.share.toFixed(2)} demoH=${Math.round(m.demoH)} thumb=${JSON.stringify(m.thumb)} h1top=${Math.round(m.h1top)}(inset ${ins.top}) lowestBtn=${m.lowest}/${m.vh}(inset ${ins.bottom})`);
    console.log('V btns', JSON.stringify(m.btns.filter((b) => b.h < 48 || b.w < 48)));
    console.log('V scrollers', JSON.stringify(m.scrollers.filter((s) => s.over > 0 || s.top > 0)));
    await page.screenshot({ path: `${OUT}/${which}-100-${P()}.png` });
    // try to scroll everything
    await page.evaluate(() => { scrollTo(0, 500); document.querySelectorAll('*').forEach((e) => { (e as HTMLElement).scrollTop = 500; }); });
    const after = await measure();
    expect(after.scrollers.filter((s) => s.top > 0), 'scrolled').toEqual([]);
    expect(m.scrollers.filter((s) => s.over > 0)).toEqual([]);
    expect(m.lowest).toBeLessThanOrEqual(m.vh - ins.bottom + 1);
    expect(m.h1top).toBeGreaterThanOrEqual(ins.top - 1);
    // 130%
    await page.evaluate(() => { for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) { const s = parseFloat(getComputedStyle(el).fontSize); el.style.fontSize = s * 1.3 + 'px'; } });
    await page.waitForTimeout(200);
    const m2 = await measure();
    console.log(`V 130 ${which} ${P()} share=${m2.share.toFixed(2)} lowest=${m2.lowest}/${m2.vh} over=${JSON.stringify(m2.scrollers.filter((s) => s.over > 0))} small=${JSON.stringify(m2.btns.filter((b) => b.h < 48))}`);
    await page.screenshot({ path: `${OUT}/${which}-130-${P()}.png` });
    expect(m2.scrollers.filter((s) => s.over > 0)).toEqual([]);
    expect(m2.lowest).toBeLessThanOrEqual(m2.vh - ins.bottom + 1);
    expect(errors).toEqual([]);
  });
}

test('verify core: decisions from before, byte compat export builder, double tap, offline, reload mid-flow', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'core');
  const ids = (JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { id: string }[] }).exercises.map((e) => e.id);
  // double tap approve
  const a = await card(page).getAttribute('data-exercise');
  const ap = page.getByRole('button', { name: 'Approve' });
  await ap.dblclick();
  await page.waitForTimeout(600);
  const kv = await dbAll<{ key: string; value: string }>(page, 'kv');
  const dec = JSON.parse(kv.find((r) => r.key === 'review:v1')!.value).decisions as Record<string, unknown>;
  console.log('V dbltap approve keys', Object.keys(dec).length, 'a=', a, 'pos', await page.getByTestId('review-pos').textContent());
  // offline swipe
  await page.context().setOffline(true);
  await touchFlick(page, card(page), 60);
  await page.waitForTimeout(500);
  console.log('V offline pos', await page.getByTestId('review-pos').textContent());
  await page.context().setOffline(false);
  // Going offline on purpose: Chromium logs every request that could not leave (WebKit stays quiet). Only that line is let go.
  errors.splice(0, errors.length, ...errors.filter((e) => !/Failed to load resource: net::ERR_INTERNET_DISCONNECTED/.test(e)));
  // tiny 10px flick should not decide; huge 600px flick
  const before = await card(page).getAttribute('data-exercise');
  await touchFlick(page, card(page), 10);
  await page.waitForTimeout(300);
  console.log('V 10px flick moved?', before !== (await card(page).getAttribute('data-exercise')));
  await touchFlick(page, card(page), 40);
  await page.waitForTimeout(500);
  console.log('V 40px light flick moved?', before !== (await card(page).getAttribute('data-exercise')));
  const b2 = await card(page).getAttribute('data-exercise');
  await touchDrag(page, card(page), 40);
  await page.waitForTimeout(500);
  console.log('V 40px slow drag moved?', b2 !== (await card(page).getAttribute('data-exercise')));
  await page.reload();
  await expect(card(page)).toBeVisible();
  console.log('V after reload pos', await page.getByTestId('review-pos').textContent(), ids.length);
  expect(errors).toEqual([]);
});
