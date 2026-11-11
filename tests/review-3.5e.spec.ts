import { expect, test, type Page } from './fixtures';
import { dbAll } from './workout-helpers';
import { watchErrors } from './workout-helpers';
import { swipe } from './helpers/quick';

// PLAN 3.5e: the owner review queue for candidate moves. The version tapped 5 times opens Review,
// "Review new exercises" opens the swipe deck: right approves, left is wrong, Fix asks what is wrong,
// Undo takes back the last decision, a reload resumes, Export shares the approvals.
// 3.5i: the grid is the default now, so these open the one by one deck ("One by one"); the deck has
// no batches any more: its progress is "23 of 288" and Undo is a chip in the header.

async function mockShare(page: Page) {
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
}

const progress = (page: Page) => page.getByTestId('review-progress');
const topName = (page: Page) => page.getByTestId('candidate-name');
/** The open Fix sheet (a closing one may still be sliding away under a loaded machine). */
const fixSheet = (page: Page) => page.getByRole('dialog', { name: 'What is wrong?' });
type Row = { id: string; decision: string; reason?: string; note?: string };

async function openQueue(page: Page) {
  await page.goto('./#/settings');
  const version = page.getByTestId('app-version');
  for (let i = 0; i < 5; i++) await version.tap();
  await expect(page).toHaveURL(/#\/review$/);
  await page.getByTestId('open-new-exercises').tap();
  await expect(page).toHaveURL(/#\/review\/new$/);
  // 3.5i: a "Check carefully" pile is already one by one; otherwise switch from the grid.
  await expect(progress(page)).not.toBeEmpty();
  if ((await page.getByTestId('candidate-review').getAttribute('data-view')) === 'grid') await page.getByTestId('review-mode').tap();
  await expect(progress(page)).toHaveText(/^\d+ of \d+$/);
  // 3.5f round 3: a swipe while the screen's fade is still running never reaches the card (WebKit hit
  // tests the view transition), so the first swipe waits for it, as a finger would.
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
}

test('version × 5 → Review → the deck: approve, wrong, fix, undo, reload resumes, export @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await mockShare(page);
  await openQueue(page);
  // 3.5i: the place in the pile, "1 of 288".
  const [at, total] = (await progress(page).textContent())!.split(' of ').map(Number) as [number, number];
  // 3.5i: with the real pre check file the deck holds the 20 check carefully cards (the grid takes the rest).
  expect(total).toBeGreaterThanOrEqual(20);
  const place = (n: number) => `${at + n} of ${total}`;

  // The card: its own moving two photo demo, its name, gear and muscles.
  const demo = page.getByTestId('deck-card').getByTestId('deck-demo');
  await expect(demo).toBeVisible();
  await expect.poll(() => demo.locator('img').first().evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId('candidate-gear')).not.toBeEmpty();
  await expect(page.getByTestId('candidate-muscles')).not.toBeEmpty();
  const first = (await topName(page).textContent())!;

  // Swipe right: approved.
  await swipe(page, 260);
  await expect(progress(page)).toHaveText(place(1));
  await expect(page.getByTestId('candidate-notice')).toContainText('Approved');
  const second = (await topName(page).textContent())!;
  expect(second).not.toBe(first);

  // The Wrong button: the same flight as a left swipe.
  await page.getByTestId('candidate-wrong').tap();
  await expect(progress(page)).toHaveText(place(2));
  await expect(page.getByTestId('candidate-notice')).toContainText('Marked wrong');
  const third = (await topName(page).textContent())!;

  // Fix: a reason, and "Other" needs a few words.
  await page.getByTestId('candidate-fix').tap();
  const save = fixSheet(page).getByTestId('fix-save');
  await expect(save).toBeDisabled();
  await fixSheet(page).getByTestId('fix-other').tap();
  await expect(save).toBeDisabled();
  await fixSheet(page).getByTestId('fix-note').fill('Grip looks wrong');
  await expect(save).toBeEnabled();
  await save.tap();
  await expect(fixSheet(page)).toHaveCount(0);
  await expect(progress(page)).toHaveText(place(3));
  await expect(page.getByTestId('candidate-notice')).toContainText('Fix saved');

  // Undo the last one: the card is back on top and the row is gone.
  await page.getByTestId('candidate-undo').tap();
  await expect(progress(page)).toHaveText(place(2));
  await expect(topName(page)).toHaveText(third);
  await expect.poll(async () => (await dbAll<Row>(page, 'candidateReviews')).map((r) => r.decision).sort()).toEqual(['approve', 'wrong']);

  // Fix again, then a reload resumes exactly there.
  await page.getByTestId('candidate-fix').tap();
  await fixSheet(page).getByTestId('fix-photo').tap();
  await fixSheet(page).getByTestId('fix-save').tap();
  await expect(progress(page)).toHaveText(place(3));
  const fourth = (await topName(page).textContent())!;
  await page.reload();
  await expect(progress(page)).toHaveText(place(3));
  await expect(topName(page)).toHaveText(fourth);

  // Export: a small file with ids and decisions only.
  await page.getByTestId('export-approvals').tap();
  await expect(page.getByTestId('candidate-message')).toHaveText('Approvals shared.');
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared);
  expect(shared.name).toMatch(/^anygym-approvals-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(shared.text);
  expect(json.format).toBe('anygym-candidate-approvals-v1');
  expect(json.sourceSha).toMatch(/^[0-9a-f]{40}$/);
  expect(json.decided).toBe(3);
  expect(json.approved).toHaveLength(1);
  expect(json.wrong).toHaveLength(1);
  expect(json.fix).toEqual([{ id: expect.any(String), reason: 'photo' }]);
  expect(Object.keys(json).sort()).toEqual(['approved', 'decided', 'exportedAt', 'fix', 'format', 'sourceSha', 'total', 'wrong']);

  // Nothing on the page sideways, every button a real thumb target.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const id of ['candidate-wrong', 'candidate-fix', 'candidate-approve']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(errors).toEqual([]);
});

test('3.5i: 20 approvals in a row with the button, no batch break; approved moves stay approved @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openQueue(page);
  const [at, total] = (await progress(page).textContent())!.split(' of ').map(Number) as [number, number];
  for (let n = 0; n < 20; n++) {
    await expect(progress(page)).toHaveText(`${at + n} of ${total}`);
    await page.getByTestId('candidate-approve').tap();
  }
  // 3.5i: the 20 check carefully cards are done, so the grid takes over.
  await expect(page.getByTestId('candidate-review')).toHaveAttribute('data-view', 'grid');
  await expect.poll(async () => (await dbAll<Row>(page, 'candidateReviews')).filter((r) => r.decision === 'approve').length).toBe(20);
  expect(errors).toEqual([]);
});
