import { expect, test, type Page } from './fixtures';
import { dbAll } from './workout-helpers';
import { watchErrors } from './workout-helpers';
import { swipe } from './helpers/quick';

// PLAN 3.5e: the owner review queue for candidate moves. The version tapped 5 times opens Review,
// "Review new exercises" opens the swipe deck: right approves, left is wrong, Fix asks what is wrong,
// Undo takes back the last decision, batches of 20, a reload resumes, Export shares the approvals.

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

const progress = (page: Page) => page.getByTestId('batch-progress');
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
  await expect(progress(page)).toHaveText(/^Batch \d+ of \d+ · \d+ left$/);
}

test('version × 5 → Review → the deck: approve, wrong, fix, undo, reload resumes, export @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await mockShare(page);
  await openQueue(page);
  await expect(progress(page)).toHaveText(/^Batch 1 of (\d+) · 20 left$/);
  const batches = Number((await progress(page).textContent())!.match(/of (\d+)/)![1]);
  expect(batches).toBeGreaterThanOrEqual(10);

  // The card: its own moving two photo demo, its name, gear and muscles.
  const demo = page.getByTestId('deck-card').getByTestId('deck-demo');
  await expect(demo).toBeVisible();
  await expect.poll(() => demo.locator('img').first().evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId('candidate-gear')).not.toBeEmpty();
  await expect(page.getByTestId('candidate-muscles')).not.toBeEmpty();
  const first = (await topName(page).textContent())!;

  // Swipe right: approved.
  await swipe(page, 260);
  await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · 19 left`);
  await expect(page.getByTestId('candidate-notice')).toContainText(`Approved: ${first}`);
  const second = (await topName(page).textContent())!;
  expect(second).not.toBe(first);

  // The Wrong button: the same flight as a left swipe.
  await page.getByTestId('candidate-wrong').tap();
  await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · 18 left`);
  await expect(page.getByTestId('candidate-notice')).toContainText(`Marked wrong: ${second}`);
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
  await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · 17 left`);
  await expect(page.getByTestId('candidate-notice')).toContainText(`Fix saved: ${third}`);

  // Undo the last one: the card is back on top and the row is gone.
  await page.getByTestId('candidate-undo').tap();
  await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · 18 left`);
  await expect(topName(page)).toHaveText(third);
  await expect.poll(async () => (await dbAll<Row>(page, 'candidateReviews')).map((r) => r.decision).sort()).toEqual(['approve', 'wrong']);

  // Fix again, then a reload resumes exactly there.
  await page.getByTestId('candidate-fix').tap();
  await fixSheet(page).getByTestId('fix-photo').tap();
  await fixSheet(page).getByTestId('fix-save').tap();
  await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · 17 left`);
  const fourth = (await topName(page).textContent())!;
  await page.reload();
  await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · 17 left`);
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

test('a batch of 20 ends with "Batch 1 done", Next batch opens the next 20; approved moves stay approved @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openQueue(page);
  await expect(progress(page)).toHaveText(/^Batch 1 of (\d+) · 20 left$/);
  const batches = (await progress(page).textContent())!.match(/of (\d+)/)![1];
  for (let left = 20; left > 0; left--) {
    await expect(progress(page)).toHaveText(`Batch 1 of ${batches} · ${left} left`);
    await page.getByTestId('candidate-approve').tap();
  }
  await expect(page.getByTestId('batch-done')).toContainText('Batch 1 done');
  await expect(page.getByTestId('batch-done')).toContainText('20 approved so far');
  await page.getByTestId('next-batch').tap();
  await expect(progress(page)).toHaveText(`Batch 2 of ${batches} · 20 left`);
  expect((await dbAll<Row>(page, 'candidateReviews')).filter((r) => r.decision === 'approve')).toHaveLength(20);
  expect(errors).toEqual([]);
});
