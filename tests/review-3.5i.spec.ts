import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { dbAll, watchErrors } from './workout-helpers';
import { mouseFlick, stillBox } from './helpers/touch';

// PLAN 3.5i: the fast review. Grid mode is the default (9 moving tiles, all approved unless tapped,
// one Approve button, the next 9 slide in); the "Check carefully" pile from the pre check file comes
// first, one by one in the swipe deck with its note; a light flick decides; Undo for 5 seconds; a
// reload resumes exactly there. The pre check file is answered by the test (its own chunk), so the
// service worker is off here; the offline path is covered by tests/verify-3.5e.spec.ts.
test.use({ serviceWorkers: 'block' });

type Cand = { id: string; name: string };
const CANDS = (JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { candidates: Cand[] }).candidates;
const SCREENS = Math.ceil(CANDS.length / 9);
type Row = { id: string; decision: string; reason?: string; note?: string };
const SHOTS = 'reports/shots/3.5i';
const shot = async (page: Page, name: string) => {
  const project = test.info().project.name;
  if (['iPhone SE', 'iPhone 15', 'iPhone 17 Pro Max'].includes(project)) await page.screenshot({ path: `${SHOTS}/${name}-${project.replace(/ /g, '-')}.png` });
};

const progress = (page: Page) => page.getByTestId('review-progress');
const tiles = (page: Page) => page.getByTestId('review-grid').last().getByTestId('review-tile');
const approve = (page: Page) => page.getByTestId('approve-screen');
const tileIds = (page: Page) => tiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.candidate!));
const rows = (page: Page) => dbAll<Row>(page, 'candidateReviews');
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function openReview(page: Page, precheck: { checkCarefully: string[]; notes: Record<string, string> } = { checkCarefully: [], notes: {} }) {
  await page.route('**/assets/candidate-precheck-*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(precheck)};` }));
  await page.goto('./#/settings');
  const version = page.getByTestId('app-version');
  for (let i = 0; i < 5; i++) await version.tap();
  await expect(page).toHaveURL(/#\/review$/);
  await page.getByTestId('review-menu').tap(); // 3.5v: Review new exercises is in the top bar menu
  await page.getByTestId('open-new-exercises').tap();
  await expect(page).toHaveURL(/#\/review\/new$/);
  await expect(progress(page)).not.toBeEmpty();
}

/** A press on the middle of the top card, moved dx: fast (a flick) or at a finger's slow pace. */
async function drag(page: Page, dx: number, pace: 'flick' | 'slow') {
  const card = page.getByTestId('deck-card');
  const box = await stillBox(card);
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.4;
  if (pace === 'flick') return mouseFlick(page, x, y, dx, 2, 3);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(x + (dx * i) / 24, y + 2);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

async function hold(page: Page, index: number) {
  const box = (await tiles(page).nth(index).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('grid is the default: 9 moving tiles, tap wrong and clear, hold for Fix, Approve saves the screen and brings the next 9 @matrix', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await openReview(page);
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', 'grid');
  await expect(progress(page)).toHaveText(`Screen 1 of ${SCREENS}`);
  await expect(tiles(page)).toHaveCount(9);
  await expect(approve(page)).toHaveText('Approve 9');
  const first = await tileIds(page);

  // Each tile: its own two photo loop, its name, its muscles as a chip; 3 across; a real thumb target.
  for (let i = 0; i < 9; i++) {
    const t = tiles(page).nth(i);
    await expect(t).toContainText(CANDS.find((c) => c.id === first[i])!.name);
    await expect(t.getByTestId('tile-chip')).not.toBeEmpty();
    await expect(t.locator('img')).toHaveCount(2);
    await expect.poll(() => t.locator('img').evaluateAll((imgs) => imgs.every((im) => (im as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const b = (await t.boundingBox())!;
    expect(b.height, 'tile height').toBeGreaterThanOrEqual(48);
    expect(b.width, 'tile width').toBeGreaterThanOrEqual(48);
  }
  const ys = await tiles(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(3);
  expect(await tiles(page).first().locator('picture').nth(1).evaluate((p) => getComputedStyle(p).animationName)).not.toBe('none');
  const ab = (await approve(page).boundingBox())!;
  expect(ab.height).toBeGreaterThanOrEqual(48);
  expect(ab.y + ab.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await shot(page, 'grid');

  // Tap marks Wrong, tap again clears; nothing is saved yet.
  await tiles(page).nth(1).tap();
  await expect(tiles(page).nth(1)).toHaveAttribute('data-mark', 'wrong');
  await expect(approve(page)).toHaveText('Approve 8, 1 wrong');
  await tiles(page).nth(4).tap();
  await expect(approve(page)).toHaveText('Approve 7, 2 wrong');
  await tiles(page).nth(4).tap();
  await expect(tiles(page).nth(4)).not.toHaveAttribute('data-mark', /.+/);
  await expect(approve(page)).toHaveText('Approve 8, 1 wrong');

  // Hold opens Fix (the hold never counts as a tap).
  await hold(page, 6);
  const sheet = page.getByRole('dialog', { name: 'What is wrong?' });
  await expect(sheet).toContainText(CANDS.find((c) => c.id === first[6])!.name);
  await sheet.getByTestId('fix-photo').tap();
  await sheet.getByTestId('fix-save').tap();
  await expect(sheet).toHaveCount(0);
  await expect(tiles(page).nth(6)).toHaveAttribute('data-mark', 'fix');
  await expect(tiles(page).nth(6).getByTestId('tile-chip')).toHaveText('Fix: Wrong photo');
  await expect(approve(page)).toHaveText('Approve 7, 2 wrong');
  expect(await rows(page)).toEqual([]);
  await shot(page, 'grid-marked');

  // A reload before Approve: the same screen, the same marks.
  await page.reload();
  await expect(approve(page)).toHaveText('Approve 7, 2 wrong');
  expect(await tileIds(page)).toEqual(first);
  await expect(tiles(page).nth(1)).toHaveAttribute('data-mark', 'wrong');
  await expect(tiles(page).nth(6)).toHaveAttribute('data-mark', 'fix');

  // Approve (a double tap saves one screen, never two): 9 rows at once, the next 9 arrive.
  await approve(page).dblclick();
  await expect(progress(page)).toHaveText(`Screen 2 of ${SCREENS}`);
  await expect(approve(page)).toHaveText('Approve 9');
  const second = await tileIds(page);
  expect(second.filter((id) => first.includes(id))).toEqual([]);
  await expect.poll(async () => (await rows(page)).length).toBe(9);
  const saved = await rows(page);
  expect(saved.map((r) => r.id).sort()).toEqual([...first].sort());
  expect(saved.find((r) => r.id === first[1])!.decision).toBe('wrong');
  expect(saved.find((r) => r.id === first[6])).toMatchObject({ decision: 'fix', reason: 'photo' });
  expect(saved.filter((r) => r.decision === 'approve')).toHaveLength(7);
  await page.waitForTimeout(500);
  expect((await rows(page)).length).toBe(9);

  // Undo, for 5 seconds: the screen comes back as it was.
  await expect(page.getByTestId('candidate-undo')).toContainText('Saved 9');
  expect((await page.getByTestId('candidate-undo').boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.getByTestId('candidate-undo').tap();
  await expect(progress(page)).toHaveText(`Screen 1 of ${SCREENS}`);
  await expect(approve(page)).toHaveText('Approve 7, 2 wrong');
  await expect.poll(async () => (await rows(page)).length).toBe(0);

  // Approve again; a reload resumes on screen 2, and the chip is gone after 5 seconds.
  await page.waitForTimeout(500);
  await approve(page).tap();
  await expect(progress(page)).toHaveText(`Screen 2 of ${SCREENS}`);
  await expect(page.getByTestId('candidate-undo')).toBeVisible();
  await expect(page.getByTestId('candidate-undo')).toHaveCount(0, { timeout: 7000 });
  await page.reload();
  await expect(progress(page)).toHaveText(`Screen 2 of ${SCREENS}`);
  expect(await tileIds(page)).toEqual(second);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('the Check carefully pile comes first in the deck with its note; a light flick decides by velocity; Undo chip; then the grid @matrix', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const careful = [CANDS[40]!, CANDS[120]!, CANDS[200]!];
  const notes = Object.fromEntries(careful.map((c, i) => [c.id, `Photo ${i + 1} may show a different move.`]));
  await openReview(page, { checkCarefully: careful.map((c) => c.id), notes });
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', 'careful');
  await expect(progress(page)).toHaveText('1 of 3');
  const name = page.getByTestId('candidate-name');
  const one = (await name.textContent())!;
  const top = careful.find((c) => c.name === one)!;
  expect(top).toBeTruthy();
  await expect(page.getByTestId('candidate-note')).toContainText(notes[top.id]!);
  // The next card is already drawn underneath, photos and all.
  await expect(page.getByTestId('deck').locator('article')).toHaveCount(2);
  await expect.poll(() => page.getByTestId('deck').locator('article[data-under] img').evaluateAll((imgs) => imgs.length > 0 && imgs.every((im) => (im as HTMLImageElement).naturalWidth > 0))).toBe(true);
  // Full height: the card takes the room between the header and the buttons.
  const card = (await page.getByTestId('deck-card').boundingBox())!;
  const buttons = (await page.getByTestId('candidate-approve').boundingBox())!;
  expect(buttons.y - (card.y + card.height)).toBeLessThan(72); // 3.5v: the reason chips' row sits between
  await shot(page, 'deck-careful');

  // A slow short drag springs back: distance alone (under the threshold) decides nothing.
  await drag(page, 44, 'slow');
  await page.waitForTimeout(400);
  await expect(name).toHaveText(one);
  expect(await rows(page)).toEqual([]);

  // The same short distance as a flick: approved, no confirmation.
  await drag(page, 44, 'flick');
  await expect(progress(page)).toHaveText('2 of 3');
  await expect.poll(rows.bind(null, page)).toEqual([expect.objectContaining({ id: top.id, decision: 'approve' })]);
  await expect(page.getByTestId('candidate-undo')).toContainText('Approved');

  // Undo brings the card back; a flick left is Wrong.
  await page.getByTestId('candidate-undo').tap();
  await expect(progress(page)).toHaveText('1 of 3');
  await expect(name).toHaveText(one);
  await drag(page, -44, 'flick');
  await expect(progress(page)).toHaveText('2 of 3');
  await expect(page.getByTestId('candidate-undo')).toContainText('Marked wrong');
  await expect.poll(rows.bind(null, page)).toEqual([expect.objectContaining({ id: top.id, decision: 'wrong' })]);
  await expect(page.getByTestId('candidate-undo')).toHaveCount(0, { timeout: 7000 });

  // A reload resumes on the same card of the pile.
  const two = (await name.textContent())!;
  await page.reload();
  await expect(progress(page)).toHaveText('2 of 3');
  await expect(name).toHaveText(two);

  // The pile done: the grid takes over with all the others.
  await page.getByTestId('candidate-approve').tap();
  await expect(progress(page)).toHaveText('3 of 3');
  await page.getByTestId('candidate-approve').tap();
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', 'grid');
  await expect(progress(page)).toHaveText(`Screen 1 of ${Math.ceil((CANDS.length - 3) / 9)}`);
  expect((await tileIds(page)).filter((id) => careful.some((c) => c.id === id))).toEqual([]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('one by one for everything: progress "n of 288", a reload resumes on the same card; reduced motion has no loop and no wash @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openReview(page);
  await page.getByTestId('review-mode').tap();
  await expect(progress(page)).toHaveText(`1 of ${CANDS.length}`);
  await expect(page.getByTestId('candidate-note')).toHaveCount(0);
  await drag(page, 60, 'flick');
  await expect(progress(page)).toHaveText(`2 of ${CANDS.length}`);
  await drag(page, -60, 'flick');
  await expect(progress(page)).toHaveText(`3 of ${CANDS.length}`);
  const name = (await page.getByTestId('candidate-name').textContent())!;
  await shot(page, 'deck');
  await page.reload();
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', 'deck');
  await expect(progress(page)).toHaveText(`3 of ${CANDS.length}`);
  await expect(page.getByTestId('candidate-name')).toHaveText(name);
  expect((await rows(page)).map((r) => r.decision).sort()).toEqual(['approve', 'wrong']);

  // Reduced motion: the wash is not drawn, the deck still decides; in the grid no tile loops.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.getByTestId('deck-card').locator('span[data-side="keep"]').first().evaluate((el) => getComputedStyle(el).display)).toBe('none');
  await page.getByTestId('candidate-approve').tap();
  await expect(progress(page)).toHaveText(`4 of ${CANDS.length}`);
  await page.getByTestId('review-menu').tap(); // 3.5v: in the top bar menu
  await page.getByTestId('review-mode').tap();
  await expect(tiles(page)).toHaveCount(9);
  expect(await tiles(page).first().locator('picture').nth(1).evaluate((p) => getComputedStyle(p).animationName)).toBe('none');
  await page.waitForTimeout(500);
  await approve(page).tap();
  await expect.poll(async () => (await rows(page)).length).toBe(12);
  expect(errors).toEqual([]);
});

test('130% text: the grid and the deck keep every target and never scroll sideways', async ({ page }) => {
  const errors = watchErrors(page);
  await openReview(page);
  const scale = () =>
    page.evaluate(() => {
      const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
      for (const { el, size, line } of sizes) {
        el.style.fontSize = `${size * 1.3}px`;
        if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
      }
    });
  await expect(tiles(page)).toHaveCount(9);
  await scale();
  await page.waitForTimeout(200);
  await shot(page, 'grid-130');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect((await approve(page).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await approve(page).scrollIntoViewIfNeeded();
  await approve(page).tap();
  await expect(progress(page)).toHaveText(`Screen 2 of ${SCREENS}`);
  await page.getByTestId('review-mode').tap();
  await expect(page.getByTestId('deck-card')).toBeVisible();
  await scale();
  await page.waitForTimeout(200);
  await shot(page, 'deck-130');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  for (const id of ['candidate-wrong', 'candidate-fix', 'candidate-approve']) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(48);
  expect(errors).toEqual([]);
});
