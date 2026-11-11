import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, usePlan, watchErrors } from './workout-helpers';
import { card, pastIntake, PROFILE } from './helpers/quick';

// Verifier probe for PLAN 3.5f: calm screens (5), break attempts, no deck while logging (1).
const proj = () => test.info().project.name.replace(/ /g, '-');
const AUDIT = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const W = window.innerWidth;
  const small = [...document.querySelectorAll('button, a, [role=radio], [role=button], input')].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() })).filter((x) => (x.r.width < 47.5 || x.r.height < 47.5) && x.r.bottom > 0 && x.r.top < innerHeight).map((x) => (x.e.getAttribute('data-testid') || x.e.getAttribute('aria-label') || x.e.textContent || '').trim().slice(0, 30) + ' ' + Math.round(x.r.width) + 'x' + Math.round(x.r.height));
  const primary = [...document.querySelectorAll('button[data-variant=primary]')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map((e) => (e.getAttribute('data-testid') || e.textContent || '').trim().slice(0, 24));
  const clipped = [...document.querySelectorAll('body *')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 1 || r.left < -1) && !e.closest('[data-testid=deck]') && !e.closest('[aria-hidden=true]') && getComputedStyle(e).position !== 'fixed'; }).map((e) => (e.getAttribute('data-testid') || e.tagName)).slice(0, 5);
  const cards = [...document.querySelectorAll('[data-testid=deck] [data-testid=deck-card], [data-testid=deck] > *')].filter(vis).length;
  const face = document.querySelector('[data-testid=deck-card]');
  const lines = face ? [...face.querySelectorAll('h2, p')].filter(vis).filter((e) => !/srOnly/.test(e.className)).map((e) => e.tagName + ':' + (e.textContent || '').slice(0, 40)) : [];
  return { small, primary, clipped, cards, lines, sw: document.documentElement.scrollWidth, W };
})()`;
const audit = async (page: Page, label: string, pct = 100) => {
  if (pct !== 100) await page.evaluate((p) => (document.documentElement.style.fontSize = p + '%'), pct);
  await page.waitForTimeout(500);
  const a = (await page.evaluate(AUDIT)) as { small: string[]; primary: string[]; clipped: string[]; cards: number; lines: string[]; sw: number; W: number };
  await page.screenshot({ path: `reports/shots/3.5f-verify/${label}-${pct}-${proj()}.png` });
  console.log(`AUDIT ${proj()} ${label} ${pct}%: ${JSON.stringify(a)}`);
  expect(a.sw, `${label} sideways`).toBeLessThanOrEqual(a.W + 1);
  return a;
};
const settle = (page: Page) => page.waitForTimeout(450);

for (const pct of [100, 130]) {
  test(`calm: Quick ideas + deck + ready @${pct}`, async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.getByTestId('build-card').tap();
    await page.getByTestId('min-30').tap();
    await audit(page, 'quick-ideas', pct);
    await page.locator('[data-concept="strength"]').first().tap();
    await expect(card(page)).toBeVisible();
    await audit(page, 'quick-deck', pct);
    await page.getByTestId('deck-info').tap();
    await audit(page, 'quick-info', pct);
    await page.keyboard.press('Escape');
    await page.getByTestId('deck-swap').tap();
    await settle(page);
    await page.getByTestId('deck-swap').tap();
    await settle(page);
    await page.getByTestId('deck-swap').tap();
    await settle(page);
    if (await page.getByTestId('show-six').isVisible()) {
      await audit(page, 'quick-offer', pct);
      await page.getByTestId('show-six').tap();
      await audit(page, 'quick-six', pct);
      await page.keyboard.press('Escape');
    }
    expect(errors).toEqual([]);
  });

  test(`calm: plan preview @${pct}`, async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await dbPut(page, { profile: [PROFILE] });
    await page.reload();
    await audit(page, 'today', pct);
    await page.getByTestId('day-preview').tap();
    await expect(card(page)).toBeVisible();
    await audit(page, 'preview', pct);
    expect(errors).toEqual([]);
  });

}

test.describe('intake', () => {
  test.use({ intake: 'fresh' });
  const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
  const FULL = ['barbell_rack', 'flat_bench', 'adjustable_bench', 'dumbbells', 'cable_station', 'leg_press', 'lat_pulldown', 'seated_row', 'pull_up_bar'];
  for (const pct of [100, 130])
    test(`calm: intake love/never deck @${pct}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await page.evaluate(([a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'exercises', answers: a })), [{ goal: 'muscle', units: US, experience: '1_2y', place: 'full', equipment: FULL, dumbbellRange: { min: 5, max: 100, step: 5 } }] as const);
      await page.reload();
      await expect(page.getByTestId('ex-deck')).toBeVisible();
      await audit(page, 'intake-deck', pct);
      // double tap Love: must save exactly one decision per card
      const first = (await card(page).getAttribute('data-exercise'))!;
      await page.getByTestId('ex-love').dblclick();
      await settle(page);
      const d = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft') ?? '{}'));
      console.log('DOUBLE LOVE', JSON.stringify(d.answers?.love), 'first', first);
      expect((d.answers?.love ?? []).filter((x: string) => x === first).length).toBe(1);
      // reload mid deck keeps the draft
      await page.reload();
      await expect(page.getByTestId('ex-deck')).toBeVisible();
      const d2 = await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft') ?? '{}'));
      expect(d2.answers?.love).toContain(first);
      expect(errors).toEqual([]);
    });
});

test.describe('replace + logging', () => {
  for (const pct of [100, 130])
    test(`calm: Replace @${pct}; no deck while logging`, async ({ page }) => {
      const errors = watchErrors(page);
      await usePlan(page);
      await page.getByRole('button', { name: 'Start', exact: true }).tap();
      await expect(page.getByTestId('workout-title')).toBeVisible();
      await page.locator('[data-testid^="row-"]', { hasText: 'Barbell Back Squat' }).first().tap();
      // logging view: no deck card anywhere
      await expect(page.getByTestId('deck-card')).toHaveCount(0);
      await expect(page.getByTestId('deck')).toHaveCount(0);
      await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
      await page.getByTestId('replace-row').tap();
      const sheet = page.getByRole('dialog', { name: 'Replace Barbell Back Squat' });
      await expect(sheet).toBeVisible();
      await audit(page, 'replace', pct);
      await page.getByTestId('swap-all').tap();
      await audit(page, 'replace-list', pct);
      expect(errors).toEqual([]);
    });
});

test('break: double tap Keep/Start, reload mid deck, offline, hide button', async ({ page, context }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  await page.getByTestId('build-card').tap();
  await page.getByTestId('min-30').tap();
  await page.locator('[data-concept="strength"]').first().tap();
  await expect(card(page)).toBeVisible();
  const total = Number((await page.getByTestId('deck-count').textContent())!.split(' of ')[1]);
  await page.getByTestId('deck-keep').dblclick();
  await settle(page);
  const at = Number((await page.getByTestId('deck-count').textContent())!.split(' of ')[0]);
  console.log('after dbl keep at', at, 'of', total);
  expect(at, 'a double tap keeps one card, not two').toBe(2);
  await page.reload();
  await settle(page);
  console.log('after reload url', page.url(), 'card visible', await card(page).isVisible().catch(() => false));
  // 3.5f round 2 (item 6): a reload mid deck comes back to the same card, minutes kept in the URL.
  await expect(page).toHaveURL(/[?&]min=30\b/);
  await expect(card(page)).toBeVisible();
  await expect(page.getByTestId('deck-count')).toHaveText(`2 of ${total}`);
  await context.setOffline(true);
  await page.getByTestId('deck-swap').tap();
  await settle(page);
  await context.setOffline(false);
  for (let i = 0; i < 12 && !(await page.getByTestId('ready-list').isVisible()); i++) {
    await page.getByTestId('deck-keep').tap();
    await settle(page);
  }
  await expect(page.getByTestId('ready-list')).toBeVisible();
  await page.getByTestId('quick-start').dblclick();
  await expect(page).toHaveURL(/#\/workout\//);
  await settle(page);
  const sessions = (await dbAll<{ endedAt?: number }>(page, 'sessions')).filter((s) => s.endedAt === undefined);
  expect(sessions, 'double tap Start makes one session').toHaveLength(1);
  expect(errors).toEqual([]);
});
