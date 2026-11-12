import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';
import { touchDrag, touchFlick, touchHold } from './helpers/touch';
import { dbAll, navIdle, watchErrors } from './workout-helpers';

// PLAN 3.5v: the core review and New exercises' one by one deck are one fixed screen that really
// swipes. Every swipe here is a real touch stream (tests/helpers/touch.ts), never a mouse.
test.use({ serviceWorkers: 'block' });

const SHOTS = 'reports/shots/3.5v';
const TOTAL = (JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: unknown[] }).exercises.length;
type Stored = { verdict: string; note?: string; at: number };
type Row = { id: string; decision: string; reason?: string; note?: string };

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
const card = (page: Page) => page.getByTestId('deck-card');
const topId = async (page: Page) => (await card(page).getAttribute('data-exercise'))!;
const pos = (page: Page) => page.getByTestId('review-pos');
const reviewed = (page: Page) => page.getByTestId('review-progress');
const reasons = (page: Page) => page.getByTestId('review-reasons');
const undo = (page: Page) => page.getByTestId('candidate-undo');

/** The core review's saved decisions, straight from the phone's database. */
async function saved(page: Page): Promise<Record<string, Stored>> {
  const kv = await dbAll<{ key: string; value: string }>(page, 'kv');
  const row = kv.find((r) => r.key === 'review:v1');
  return row ? (JSON.parse(row.value) as { decisions: Record<string, Stored> }).decisions : {};
}
const rows = (page: Page) => dbAll<Row>(page, 'candidateReviews');

async function openCore(page: Page) {
  await page.goto('./#/settings');
  const version = page.getByTestId('app-version');
  for (let i = 0; i < 5; i++) await version.tap();
  await expect(page).toHaveURL(/#\/review$/);
  await expect(card(page)).toBeVisible();
  await navIdle(page);
}

async function openNew(page: Page, careful: string[] = []) {
  await page.route('**/assets/candidate-precheck-*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify({ checkCarefully: careful, notes: {} })};` }));
  await openCore(page);
  await page.getByTestId('review-menu').tap();
  await page.getByTestId('open-new-exercises').tap();
  await expect(page).toHaveURL(/#\/review\/new$/);
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', /./);
  if ((await page.getByTestId('candidate-review').getAttribute('data-view')) === 'grid') await page.getByTestId('review-mode').tap();
  await expect(card(page)).toBeVisible();
  await navIdle(page);
}

/** Nothing scrolls and nothing is taller or wider than the phone. */
async function fixedScreen(page: Page, screen: string) {
  const out = await page.evaluate((id) => {
    const root = document.querySelector<HTMLElement>(`[data-testid=${id}]`)!;
    const de = document.documentElement;
    window.scrollTo(0, 400);
    root.scrollTop = 400;
    document.querySelector('main')?.scrollTo(0, 400);
    const outside = Array.from(root.querySelectorAll<HTMLElement>('button, h1, p, [data-testid=deck-card], [data-testid=review-reasons]'))
      .filter((el) => !el.closest('[data-under]') && getComputedStyle(el).position !== 'absolute')
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.bottom > innerHeight + 0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.left < -0.5))
      .map(({ el, r }) => `${el.tagName} ${el.getAttribute('data-testid') ?? el.textContent?.slice(0, 20)} ${Math.round(r.top)}-${Math.round(r.bottom)}`);
    return {
      doc: de.scrollTop + document.body.scrollTop + scrollY,
      main: document.querySelector('main')?.scrollTop ?? 0,
      root: root.scrollTop,
      rootTall: root.scrollHeight - root.clientHeight,
      rootHeight: root.getBoundingClientRect().height - innerHeight,
      docTall: de.scrollHeight - innerHeight,
      docWide: de.scrollWidth - innerWidth,
      outside,
    };
  }, screen);
  expect(out, JSON.stringify(out)).toMatchObject({ doc: 0, main: 0, root: 0, outside: [] });
  expect(out.rootTall, 'the screen holds nothing taller than itself').toBeLessThanOrEqual(0);
  expect(out.rootHeight, 'the screen is as tall as the phone').toBeLessThanOrEqual(0.5);
  expect(out.docTall).toBeLessThanOrEqual(0);
  expect(out.docWide).toBeLessThanOrEqual(0);
}

const scaleText = (page: Page) =>
  page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });

test('core review: real touch swipes approve and mark wrong, the reason chips stay 3 s, hold opens Fix, Undo restores, a reload resumes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openCore(page);
  await expect(pos(page)).toHaveText(`1 of ${TOTAL}`);
  await expect(reviewed(page)).toHaveText(`0 / ${TOTAL} reviewed`);
  // The next card is already drawn underneath.
  await expect(page.getByTestId('deck').locator('article')).toHaveCount(2);

  // A slow short drag decides nothing; it springs back.
  const a = await topId(page);
  await touchDrag(page, card(page), 48);
  await page.waitForTimeout(350);
  expect(await topId(page)).toBe(a);
  expect(await saved(page)).toEqual({});

  // Right, a light flick: approved, the next card is up. No reason chips for a yes.
  await touchFlick(page, card(page), 60);
  await expect(pos(page)).toHaveText(`2 of ${TOTAL}`);
  await expect.poll(async () => (await saved(page))[a]?.verdict).toBe('approved');
  await expect(reasons(page)).toHaveCount(0);
  await expect(undo(page)).toContainText('Approved');

  // Left: wrong, saved at once as Wrong demo (the default); the chips show, then go after 3 s.
  const b = await topId(page);
  expect(b).not.toBe(a);
  // The chips' life is timed inside the page (a headless frame can take 50 ms or more, so a clock out here
  // would count the time the test spent noticing them).
  await page.evaluate(() => {
    const w = window as unknown as { __chips: { on?: number; off?: number } };
    w.__chips = {};
    new MutationObserver(() => {
      const here = !!document.querySelector('[data-testid="review-reasons"]');
      if (here && w.__chips.on === undefined) w.__chips.on = performance.now();
      if (!here && w.__chips.on !== undefined && w.__chips.off === undefined) w.__chips.off = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await touchFlick(page, card(page), -60);
  await expect(pos(page)).toHaveText(`3 of ${TOTAL}`);
  await expect(reasons(page)).toBeVisible();
  const shown = Date.now();
  await expect(reasons(page).getByRole('button')).toHaveText(['Wrong demo', 'Wrong muscles', 'Wrong cues']);
  await expect(page.getByTestId('reason-wrong-demo')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await saved(page))[b]?.verdict).toBe('wrong-demo');
  await page.waitForTimeout(Math.max(0, 2300 - (Date.now() - shown)));
  await expect(reasons(page), 'still there before 3 s').toBeVisible();
  await expect(reasons(page)).toHaveCount(0, { timeout: 2500 });
  const life = await page.evaluate(() => {
    const c = (window as unknown as { __chips: { on: number; off: number } }).__chips;
    return c.off - c.on;
  });
  expect(life).toBeGreaterThanOrEqual(2900);
  expect((await saved(page))[b]).toMatchObject({ verdict: 'wrong-demo' });

  // Left by distance (a slow full drag), then a tapped reason is what is saved.
  const c = await topId(page);
  await touchDrag(page, card(page), -190);
  await expect(reasons(page)).toBeVisible();
  await page.getByTestId('reason-wrong-muscles').tap();
  await expect.poll(async () => (await saved(page))[c]?.verdict).toBe('wrong-muscles');
  await expect(undo(page)).toContainText('Wrong muscles');
  // The next left swipe at once: the chips are about the new card only (the old ones go as it leaves).
  const d = await topId(page);
  await touchFlick(page, card(page), -60);
  await page.getByTestId('reason-fix-cues').tap();
  expect((await saved(page))[c]).toMatchObject({ verdict: 'wrong-muscles' });
  await expect.poll(async () => (await saved(page))[d]).toMatchObject({ verdict: 'fix-cues', note: 'Wrong cues' });

  // Undo: the card is back on top and its decision is gone.
  await undo(page).tap();
  await expect.poll(() => topId(page)).toBe(d);
  await expect.poll(async () => Object.keys(await saved(page)).sort()).toEqual([a, b, c].sort());
  await expect(reasons(page)).toHaveCount(0);

  // A hold opens Fix: the old flows (wrong demo, wrong muscles, a cue note that needs words).
  await touchHold(page, card(page));
  const fix = page.getByRole('dialog', { name: 'Fix' });
  await expect(fix).toBeVisible();
  const save = fix.getByRole('button', { name: 'Save cue note' });
  await expect(save).toBeDisabled();
  await fix.getByTestId('review-note').fill('Say: elbows in');
  await save.tap();
  await expect.poll(async () => (await saved(page))[d]).toMatchObject({ verdict: 'fix-cues', note: 'Say: elbows in' });
  await expect(reviewed(page)).toHaveText(`4 / ${TOTAL} reviewed`);

  // The small icon buttons do the same as the swipe.
  const e = await topId(page);
  await page.getByRole('button', { name: 'Approve' }).tap();
  await expect.poll(async () => (await saved(page))[e]?.verdict).toBe('approved');
  const f = await topId(page);
  await page.getByRole('button', { name: 'Wrong', exact: true }).tap();
  await expect(reasons(page)).toBeVisible();
  await expect.poll(async () => (await saved(page))[f]?.verdict).toBe('wrong-demo');

  // A reload opens on the next undecided exercise, with everything kept.
  const next = await topId(page);
  await page.reload();
  await expect(card(page)).toBeVisible();
  expect(await topId(page)).toBe(next);
  await expect(reviewed(page)).toHaveText(`6 / ${TOTAL} reviewed`);
  expect(Object.keys(await saved(page))).toHaveLength(6);
  expect(errors).toEqual([]);
});

test('core review: one fixed screen, nothing scrolls at 100% or 130%; the map, the cues and Export open from the card and the menu', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; text: string } };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', {
      value: async (d: { files: File[] }) => {
        w.__shared = { name: d.files[0]!.name, text: await d.files[0]!.text() };
      },
      configurable: true,
    });
  });
  await simulateSafeAreas(page);
  await openCore(page);
  await expect(card(page).getByTestId('deck-demo').locator('img').first()).toBeVisible();
  await fixedScreen(page, 'review-screen');

  // The name and the counter share the top line; the demo is the big part of the screen.
  const name = (await page.getByTestId('review-name').boundingBox())!;
  const count = (await pos(page).boundingBox())!;
  expect(Math.abs(name.y + name.height / 2 - (count.y + count.height / 2))).toBeLessThan(4);
  const vh = page.viewportSize()!.height;
  const demo = (await card(page).getByTestId('deck-demo').boundingBox())!;
  expect(demo.height / vh, 'the demo is about half the screen or more').toBeGreaterThan(0.4);
  for (const label of ['Wrong', 'Fix', 'Approve', 'More']) expect((await page.getByRole('button', { name: label, exact: true }).boundingBox())!.height, label).toBeGreaterThanOrEqual(48);
  await shot(page, 'core');

  // Left: the chips fit the row (no ellipsis at 100%), and the screen still does not scroll.
  await touchFlick(page, card(page), -60);
  await expect(reasons(page)).toBeVisible();
  expect(await reasons(page).locator('button span').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent))).toEqual([]);
  await fixedScreen(page, 'review-screen');
  await shot(page, 'core-reasons');
  await expect(reasons(page)).toHaveCount(0, { timeout: 5000 });

  // The thumbnail opens the full map: Front and Back, Male and Female.
  await page.getByTestId('review-map').tap();
  const map = page.getByRole('dialog', { name: 'Muscle map' });
  await expect(map.getByTestId('muscle-map')).toBeVisible();
  for (const word of ['Front', 'Back', 'Male', 'Female']) await expect(map.getByRole('radio', { name: word, exact: true })).toBeVisible();
  await shot(page, 'core-map');
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);

  // The cues are one line on the card; the info button has them all.
  await expect(page.getByTestId('review-cues')).not.toBeEmpty();
  expect(await page.getByTestId('review-cues').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(28);
  await page.getByTestId('review-info').tap();
  const about = page.getByRole('dialog', { name: 'About this exercise' });
  await expect(about).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(about).toHaveCount(0);

  // Export lives in the top bar's menu, and gives the same file as before.
  await page.getByTestId('review-menu').tap();
  await shot(page, 'core-menu');
  await page.getByRole('button', { name: 'Export review' }).tap();
  await expect(page.getByTestId('review-message')).toHaveText('Review shared.');
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared);
  const json = JSON.parse(shared.text);
  expect(json.format).toBe('anygym-review-v1');
  expect(json.reviewed).toBe(1);
  expect(Object.values(json.decisions as Record<string, Stored>)[0]).toMatchObject({ verdict: 'wrong-demo' });
  await fixedScreen(page, 'review-screen');

  // 130% text: the demo may shrink, nothing scrolls, every button stays whole.
  await scaleText(page);
  await page.waitForTimeout(150);
  await fixedScreen(page, 'review-screen');
  await shot(page, 'core-130');
  await touchFlick(page, card(page), -60);
  await expect(reasons(page)).toBeVisible();
  await scaleText(page);
  await fixedScreen(page, 'review-screen');
  expect(errors).toEqual([]);
});

test('core review: decisions saved before 3.5v are read as they are, and a swipe keeps them', async ({ page }) => {
  const errors = watchErrors(page);
  await openCore(page);
  const ids = (JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { id: string }[] }).exercises.map((e) => e.id);
  const old = { decisions: { [ids[0]!]: { verdict: 'approved', at: 1 }, [ids[1]!]: { verdict: 'fix-cues', note: 'Shorter', at: 2 }, [ids[2]!]: { verdict: 'wrong-muscles', at: 3 } } };
  await page.evaluate(
    (value) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ key: 'review:v1', value, at: 3 });
          tx.oncomplete = () => (req.result.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    JSON.stringify(old),
  );
  await page.reload();
  await expect(card(page)).toHaveAttribute('data-exercise', ids[3]!);
  await expect(pos(page)).toHaveText(`4 of ${TOTAL}`);
  await expect(reviewed(page)).toHaveText(`3 / ${TOTAL} reviewed`);
  await touchFlick(page, card(page), 60);
  await expect.poll(async () => Object.keys(await saved(page)).length).toBe(4);
  expect(await saved(page)).toMatchObject({ ...old.decisions, [ids[3]!]: { verdict: 'approved' } });
  expect(errors).toEqual([]);
});

test('core review: 20 cards by touch in under 45 s (138 in about 5 minutes)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openCore(page);
  const start = Date.now();
  for (let i = 0; i < 20; i++) {
    await expect(pos(page)).toHaveText(`${i + 1} of ${TOTAL}`);
    await touchFlick(page, card(page), i % 5 === 4 ? -60 : 60);
  }
  await expect(pos(page)).toHaveText(`21 of ${TOTAL}`);
  const took = Date.now() - start;
  console.log(`3.5v: 20 cards in ${took} ms on ${test.info().project.name}`);
  expect(took).toBeLessThan(45_000);
  await expect.poll(async () => Object.keys(await saved(page)).length).toBe(20);
  const all = Object.values(await saved(page));
  expect(all.filter((d) => d.verdict === 'approved')).toHaveLength(16);
  expect(all.filter((d) => d.verdict === 'wrong-demo')).toHaveLength(4);
  expect(errors).toEqual([]);
});

test('new exercises, one by one: real touch swipes, reason chips for 3 s, hold opens Fix, Undo, no scrolling, a reload resumes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await openNew(page);
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', 'deck');
  await expect(card(page).getByTestId('deck-demo').locator('img').first()).toBeVisible();
  await expect(page.getByTestId('deck').locator('article')).toHaveCount(2);
  await fixedScreen(page, 'candidate-review');
  await expect(page.getByTestId('candidate-name')).not.toBeEmpty();
  await expect(page.getByTestId('candidate-gear')).not.toBeEmpty();
  await expect(page.getByTestId('candidate-muscles')).not.toBeEmpty();
  await shot(page, 'new');

  // Right approves and brings the next card.
  const a = await topId(page);
  await touchFlick(page, card(page), 60);
  await expect.poll(() => topId(page)).not.toBe(a);
  await expect.poll(rows.bind(null, page)).toEqual([expect.objectContaining({ id: a, decision: 'approve' })]);
  await expect(undo(page)).toContainText('Approved');

  // Left is Wrong (saved at once); the chips stay 3 s and nothing more is saved without a tap.
  const b = await topId(page);
  await touchFlick(page, card(page), -60);
  await expect(reasons(page)).toBeVisible();
  const shown = Date.now();
  await expect(reasons(page).getByRole('button')).toHaveText(['Wrong photo', 'Wrong muscles', 'Wrong gear']);
  await fixedScreen(page, 'candidate-review');
  await shot(page, 'new-reasons');
  await expect(reasons(page)).toHaveCount(0, { timeout: 5000 });
  expect(Date.now() - shown).toBeGreaterThanOrEqual(2900);
  expect((await rows(page)).find((r) => r.id === b)).toMatchObject({ decision: 'wrong' });
  expect((await rows(page)).find((r) => r.id === b)?.reason).toBeUndefined();

  // A tapped reason is saved with the move; Undo takes the whole decision back.
  const c = await topId(page);
  await touchFlick(page, card(page), -60);
  await page.getByTestId('reason-muscles').tap();
  await expect.poll(async () => (await rows(page)).find((r) => r.id === c)).toMatchObject({ decision: 'fix', reason: 'muscles' });
  await undo(page).tap();
  await expect.poll(() => topId(page)).toBe(c);
  await expect.poll(async () => (await rows(page)).map((r) => r.id).sort()).toEqual([a, b].sort());

  // A hold opens the Fix sheet.
  await touchHold(page, card(page));
  const fix = page.getByRole('dialog', { name: 'What is wrong?' });
  await expect(fix).toBeVisible();
  await fix.getByTestId('fix-gear').tap();
  await fix.getByTestId('fix-save').tap();
  await expect.poll(async () => (await rows(page)).find((r) => r.id === c)).toMatchObject({ decision: 'fix', reason: 'gear' });

  // The thumbnail opens the full map.
  await page.getByTestId('review-map').tap();
  const map = page.getByRole('dialog', { name: 'Muscle map' });
  for (const word of ['Front', 'Back', 'Male', 'Female']) await expect(map.getByRole('radio', { name: word, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(map).toHaveCount(0);

  const next = await topId(page);
  await page.reload();
  await expect(card(page)).toBeVisible();
  expect(await topId(page)).toBe(next);
  expect(await rows(page)).toHaveLength(3);

  await scaleText(page);
  await page.waitForTimeout(150);
  await fixedScreen(page, 'candidate-review');
  await shot(page, 'new-130');
  expect(errors).toEqual([]);
});
