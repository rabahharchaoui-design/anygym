import { expect, test, type Page } from './fixtures';
import { readFileSync } from 'node:fs';

const oh = JSON.parse(readFileSync('data/plans/ohrabah-split.json', 'utf8'));
const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};
const dbAll = (page: Page, store: string) =>
  page.evaluate((name) => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const q = req.result.transaction(name, 'readonly').objectStore(name).getAll(); q.onsuccess = () => (resolve(q.result), req.result.close()); };
  }), store);
const answerAny = async (page: Page) => {
  const d = page.getByRole('dialog', { name: 'How do you load this?' });
  if (await d.count()) { await page.waitForTimeout(700); await d.getByRole('button').first().tap(); await expect(d).toHaveCount(0); }
};
async function start(page: Page, n: number) {
  await page.goto('./#/plans/ohrabah-split');
  await page.getByRole('button', { name: /Use this plan|Go to Today/ }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: new RegExp(`Day ${n} ·`) }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.locator('[data-testid^="exercise-"]').first().waitFor();
  await page.waitForTimeout(600);
  await answerAny(page);
}

test('r3: warm up tag + db kind', async ({ page }) => {
  const errors = watch(page);
  await start(page, 2);
  const groups = page.locator('[data-testid="pair-group"][data-warmup]');
  console.log('warm groups', await groups.count(), (await groups.first().innerText()).replace(/\n+/g, ' / ').slice(0, 200));
  expect(await groups.count()).toBeGreaterThan(0);
  expect(await groups.first().innerText()).toContain('Warm up');
  await answerAny(page);
  const first = page.locator('[data-testid^="exercise-"]').first();
  console.log('first expanded', await first.getAttribute('data-expanded'));
  await page.getByTestId('action-bar').getByRole('button', { name: /Log set/ }).tap();
  await page.waitForTimeout(600);
  await answerAny(page);
  const sets = await dbAll(page, 'sets');
  console.log('sets', JSON.stringify(sets.map((s) => ({ ex: s.exerciseId, kind: s.kind }))));
  expect(sets.length).toBe(1);
  expect(sets[0].kind).toBe('warmup');
  await page.screenshot({ path: `reports/shots/1.10/r3-warmup-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(errors).toEqual([]);
});

test('r3: finisher in viewer and workout', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/plans/ohrabah-split');
  for (let i = 0; i < oh.days.length; i++) {
    const d = oh.days[i];
    const reg = page.getByRole('region', { name: new RegExp(`^Day ${i + 1} ·`) });
    const fin = reg.locator(`[data-testid="finisher-day-${i + 1}"]`);
    if (!d.finisher) { expect(await fin.count(), `day ${i + 1} no finisher`).toBe(0); continue; }
    const t = (await fin.innerText()).replace(/\s+/g, ' ');
    console.log(`day ${i + 1} json`, JSON.stringify(d.finisher), 'viewer:', t);
    expect(t.toLowerCase()).toContain(d.finisher.name.toLowerCase());
    if (d.finisher.minutes === null) expect(t).not.toMatch(/\d/);
    else expect(t).toContain(String(d.finisher.minutes));
  }
  if (test.info().project.name === 'iPhone 15 Pro') { await page.screenshot({ path: 'reports/shots/1.10/r3-viewer.png', fullPage: true }); }
  // workout: day 2 finisher (15 min) and day 5 (null)
  for (const n of [test.info().title.includes('x') ? 2 : 2]) {
    await start(page, n);
    const last = page.locator('[data-testid="finisher"]');
    expect(await last.count()).toBe(1);
    const txt = (await last.innerText()).replace(/\n+/g, ' / ');
    console.log(`workout day ${n} finisher:`, txt);
    const isLast = await page.getByRole('main').evaluate((m) => { const all = [...m.querySelectorAll('[data-testid^="exercise-"],[data-testid="finisher"]')]; return all[all.length - 1]?.getAttribute('data-testid'); });
    expect(isLast).toBe('finisher');
    const f = oh.days[n - 1].finisher;
    expect(txt.toLowerCase()).toContain(f.name.toLowerCase());
    await last.scrollIntoViewIfNeeded(); await last.getByRole('button').first().click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await answerAny(page);
    const body = await page.getByRole('main').innerText();
    console.log(`day ${n} after expand:`, body.slice(-300).replace(/\n+/g, ' / '));
    expect(body).toMatch(/Hold for/);
    await page.screenshot({ path: `reports/shots/1.10/r3-finisher-d${n}-${test.info().project.name.replace(/ /g, '-')}.png` });
    await page.goBack().catch(() => {});
    await page.goto('./#/');
    const fin = page.getByRole('button', { name: 'Finish' });
    if (await fin.count()) { await fin.tap().catch(() => {}); }
  }
  expect(errors).toEqual([]);
});

test('r3: long title fits on SE', async ({ page }) => {
  const errors = watch(page);
  await start(page, 5);
  let found = false;
  const cards = page.locator('[data-testid^="exercise-"]');
  for (let i = 0; i < (await cards.count()); i++) {
    if ((await cards.nth(i).innerText()).includes('Band Internal Shoulder Rotation (90 degrees)')) { await cards.nth(i).getByRole('button').first().tap(); found = true; break; }
  }
  console.log('found card day5', found);
  if (!found) { await start(page, 2); }
  await page.waitForTimeout(700);
  await answerAny(page);
  const info = await page.evaluate(() => {
    const c = document.querySelector('[data-expanded="true"]') as HTMLElement | null;
    const txt = document.body.innerText;
    const scroller = c?.closest('main') as HTMLElement | null;
    return { title: c ? c.innerText.split('\n')[0] : null, cardSH: c?.scrollHeight, cardCH: c?.clientHeight, hasFull: txt.includes('Band Internal Shoulder Rotation (90 degrees)'), mainSH: scroller?.scrollHeight, mainCH: scroller?.clientHeight };
  });
  console.log('title info', JSON.stringify(info), test.info().project.name);
  await page.screenshot({ path: `reports/shots/1.10/r3-title-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(errors).toEqual([]);
  expect(info.hasFull).toBe(true);
  expect(info.cardSH!).toBeLessThanOrEqual(info.cardCH!);
});

test('r3: day 5 finisher null minutes in workout', async ({ page }) => {
  const errors = watch(page);
  await start(page, 5);
  const last = page.locator('[data-testid="finisher"]');
  expect(await last.count()).toBe(1);
  await last.scrollIntoViewIfNeeded();
  console.log('d5 finisher collapsed:', (await last.innerText()).replace(/\n+/g, ' / '));
  await last.getByRole('button').first().click({ timeout: 5000 });
  await page.waitForTimeout(600);
  const t = (await last.innerText()).replace(/\n+/g, ' / ');
  console.log('d5 finisher expanded:', t);
  expect(t).toContain('Cycling');
  expect(t).not.toMatch(/\d+ min/);
  await page.screenshot({ path: `reports/shots/1.10/r3-finisher-d5-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(errors).toEqual([]);
});
