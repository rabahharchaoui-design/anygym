import { expect, test } from './fixtures';
import { watchErrors } from './workout-helpers';

// PLAN 2.4 (SPEC 9.4): the hidden Review screen.
test('5 version taps open Review; approve advances; fix cues needs a note; export gives JSON', async ({ page }) => {
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
  await page.goto('./#/settings');
  const version = page.getByTestId('app-version');
  for (let i = 0; i < 4; i++) await version.tap();
  await expect(page).not.toHaveURL(/#\/review/);
  await version.tap();
  await expect(page).toHaveURL(/#\/review$/);

  const progress = page.getByTestId('review-progress');
  await expect(progress).toHaveText(/^0 \/ \d+ reviewed$/);
  const total = Number((await progress.textContent())!.match(/\/ (\d+)/)![1]);
  const card = page.getByTestId('review-card');
  const firstId = await card.getAttribute('data-id');
  await expect(page.getByTestId('unreviewed')).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).tap();
  await expect(progress).toHaveText(`1 / ${total} reviewed`);
  await expect(card).not.toHaveAttribute('data-id', firstId!);

  await page.getByRole('button', { name: 'Fix cues' }).tap();
  const save = page.getByRole('button', { name: 'Save cue note' });
  await expect(save).toBeDisabled();
  await page.getByTestId('review-note').fill('Too long');
  await save.tap();
  await expect(progress).toHaveText(`2 / ${total} reviewed`);

  await page.getByRole('button', { name: 'Export review' }).tap();
  await expect(page.getByTestId('review-message')).toHaveText('Review shared.');
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } }).__shared);
  expect(shared.name).toMatch(/^anygym-review-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(shared.text);
  expect(json.format).toBe('anygym-review-v1');
  expect(json.catalogSha).toMatch(/^[0-9a-f]{40}$/);
  expect(json.reviewed).toBe(2);
  expect(json.decisions[firstId!].verdict).toBe('approved');
  expect(Object.values(json.decisions).some((d) => (d as { verdict: string }).verdict === 'fix-cues')).toBe(true);

  await page.reload();
  await expect(page.getByTestId('review-progress')).toHaveText(`2 / ${total} reviewed`);
  expect(errors).toEqual([]);
});

// Gate s2 (iOS Simulator): the card's blocks shrank in the fixed height page, so the photo, map and
// "Tap a muscle to name it" slid under the Approve stack. Nothing in the card may overlap the actions.
test('review: the card never runs under the action buttons; everything scrolls into view @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/review');
  const card = page.getByTestId('review-card');
  await expect(card).toBeVisible();
  const approve = page.getByRole('button', { name: 'Approve' });
  const parts = [card.getByTestId('muscle-pick'), card.getByTestId('muscle-text'), card.getByRole('radiogroup').first()];
  for (const part of parts) {
    const a = (await part.boundingBox())!;
    const b = (await approve.boundingBox())!;
    expect(a.y + a.height, 'card part ends above Approve').toBeLessThanOrEqual(b.y + 0.5);
  }
  const cardBox = (await card.boundingBox())!;
  const lastInCard = await card.evaluate((el) => Math.max(...[...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect().bottom)));
  expect(lastInCard).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
  await approve.scrollIntoViewIfNeeded();
  await expect(approve).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Export review' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Export review' })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

// PLAN 2.0j (2): a failed read of the saved decisions is a retryable error, never an empty review.
test('review: a read failure keeps earlier decisions, blocks verdicts, and Try again brings them back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key: IDBValidKey | IDBKeyRange) {
      if (key === 'review:v1' && sessionStorage.getItem('failReview') === '1') throw new DOMException('Synthetic read failure', 'UnknownError');
      return get.call(this, key);
    };
  });
  await page.goto('./#/review');
  const progress = page.getByTestId('review-progress');
  await expect(progress).toHaveText(/^0 \/ \d+ reviewed$/);
  const total = Number((await progress.textContent())!.match(/\/ (\d+)/)![1]);
  await page.getByRole('button', { name: 'Approve' }).tap();
  await expect(progress).toHaveText(`1 / ${total} reviewed`);
  await page.getByRole('button', { name: 'Approve' }).tap();
  await expect(progress).toHaveText(`2 / ${total} reviewed`);

  await page.evaluate(() => sessionStorage.setItem('failReview', '1'));
  await page.reload();
  await expect(page.getByTestId('review-read-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByTestId('review-read-error')).toBeVisible();

  await page.evaluate(() => sessionStorage.removeItem('failReview'));
  await page.getByRole('button', { name: 'Try again' }).tap();
  await expect(progress).toHaveText(`2 / ${total} reviewed`);
  await page.getByRole('button', { name: 'Approve' }).tap();
  await expect(progress).toHaveText(`3 / ${total} reviewed`);
  await page.reload();
  await expect(page.getByTestId('review-progress')).toHaveText(`3 / ${total} reviewed`);
  expect(errors.filter((e) => !/Synthetic|UnknownError/.test(e))).toEqual([]);
});
