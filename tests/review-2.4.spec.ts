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
