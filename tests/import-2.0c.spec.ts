import { expect, test, type Page } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { dbAll, shotOn, watchErrors } from './workout-helpers';

// PLAN 2.0c group 2 (acceptance B): an imported 53 lb kettlebell set whose weight is cleared or
// typed as 501 cannot be saved, and never imports as the file's 53 lb. Synthetic numbers.
const FILE = JSON.stringify({
  format: 'anygym-import-v1',
  unit: 'lb',
  exercises: [
    {
      name: 'Goblets',
      planExercise: 'Kettlebell Goblet Squat',
      loadType: 'single_weight',
      sessions: [{ sets: [{ reps: 10, weight: 53 }, { reps: 9, weight: 53, uncertain: true, why: 'Hard to read' }] }],
    },
  ],
});

async function openReview(page: Page) {
  await page.goto('./#/settings');
  await expect(page.getByTestId('import-history')).toBeVisible();
  await page.getByTestId('import-file').setInputFiles({ name: 'synthetic-kettlebell.json', mimeType: 'application/json', buffer: Buffer.from(FILE) });
  await expect(page).toHaveURL(/#\/settings\/import$/);
}

test('acceptance B: a cleared or 501 weight keeps Save disabled; a valid replacement imports exactly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openReview(page);
  const row = page.getByTestId('import-set').first();
  await row.tap();
  const sheet = page.getByRole('dialog', { name: 'Check this set' });
  await expect(sheet.getByTestId('wheel-total')).toContainText('53');
  const save = sheet.getByRole('button', { name: /^(Save|Looks right)$/ });
  await expect(save).toBeEnabled();
  // Clear it: Save is disabled, the set stays unconfirmed.
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'Delete', exact: true }).tap();
  await expect(save).toBeDisabled();
  await expect(sheet.getByTestId('import-weight-invalid')).toBeVisible();
  await shotOn(page, '2.0c', 'b-cleared');
  // 501 is refused: still disabled.
  for (const k of ['5', '0', '1']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await expect(save).toBeDisabled();
  await save.tap({ force: true }).catch(() => undefined);
  await expect(sheet).toBeVisible();
  // Close without saving: the file's set is unchanged, not marked checked.
  await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(row).not.toContainText('Checked');

  // A valid replacement (35) is saved and imported exactly.
  await row.tap();
  await expect(sheet.getByTestId('wheel-total')).toContainText('53');
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'Delete', exact: true }).tap();
  for (const k of ['3', '5']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  await expect(save).toBeEnabled();
  await save.tap();
  await expect(sheet).toHaveCount(0);
  await expect(row).toContainText('35');
  await expect(row).toContainText('Checked');
  const confirm = page.getByTestId('import-confirm');
  await expect(confirm).toHaveText('Import 2 sets');
  await confirm.tap();
  await expect(page).toHaveURL(/#\/settings$/);
  const sets = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
  expect(sets.map((s) => [s.reps, s.load?.total, s.load?.unit, s.uncertain])).toEqual([
    [10, 35, 'lb', false],
    [9, 53, 'lb', true],
  ]);
  expect(errors).toEqual([]);
});

// Tester (2.0c): with the warning up, the readout, the exercise name and the file's line stay in
// view (never under the grabber, never scrolled out), Save sits in the pinned footer. 100% and 130%.
const scaleText = (page: Page, k: number) =>
  page.evaluate((k) => {
    const d = document.querySelector('[role="dialog"]')!;
    const els = Array.from(d.querySelectorAll<HTMLElement>('*')).filter((el) => !el.closest('svg'));
    const sizes = els.map((el) => ({ el, st: getComputedStyle(el) })).map(({ el, st }) => ({ el, fs: parseFloat(st.fontSize), lh: parseFloat(st.lineHeight) }));
    for (const { el, fs, lh } of sizes) {
      el.style.fontSize = `${fs * k}px`;
      if (Number.isFinite(lh)) el.style.lineHeight = `${lh * k}px`;
    }
  }, k);

for (const k of [1, 1.3]) {
  test(`import set sheet at ${k * 100}% text: readout, name and file line stay visible with the warning @matrix`, async ({ page }) => {
    const errors = watchErrors(page);
    await openReview(page);
    await page.getByTestId('import-set').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Check this set' });
    await expect(sheet.getByTestId('wheel-total')).toContainText('53');
    await expect(sheet).toHaveAttribute('data-state', 'open');
    if (k !== 1) await scaleText(page, k);
    for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'Delete', exact: true }).dispatchEvent('click');
    for (const key of ['5', '0', '1']) await sheet.getByRole('button', { name: key, exact: true }).dispatchEvent('click');
    await expect(sheet.getByTestId('import-weight-invalid')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')!;
      const r = (e: Element | null) => e!.getBoundingClientRect();
      const grab = r(d.querySelector('button[aria-label="Close"] span'));
      const body = d.querySelector<HTMLElement>('[data-scroll="true"] > div')!;
      const footer = d.querySelector('[data-testid="import-weight-invalid"]')!.closest('div')!.parentElement!;
      const name = [...d.querySelectorAll('p')].find((p) => p.textContent === 'Kettlebell Goblet Squat')!;
      const file = [...d.querySelectorAll('p')].find((p) => p.textContent?.startsWith('In your file'))!;
      const total = d.querySelector('[data-testid="wheel-total"]')!;
      const save = [...d.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
      const box = (e: Element) => [r(e).top, r(e).bottom];
      return {
        grabBottom: grab.bottom,
        bodyTop: r(body).top,
        footerTop: r(footer).top,
        name: box(name),
        file: box(file),
        total: box(total),
        totalText: total.textContent,
        saveInFooter: footer.contains(save),
        sideways: document.documentElement.scrollWidth - innerWidth,
        viewport: innerHeight,
      };
    });
    expect(m.totalText).toContain('501');
    expect(m.saveInFooter).toBe(true);
    for (const [top, bottom] of [m.name, m.file, m.total]) {
      expect(top!).toBeGreaterThanOrEqual(Math.max(m.grabBottom, m.bodyTop) - 0.5);
      expect(bottom!).toBeLessThanOrEqual(m.footerTop + 0.5);
    }
    expect(m.footerTop).toBeLessThan(m.viewport);
    expect(m.sideways).toBeLessThanOrEqual(0);
    await shotOn(page, '2.0c', `v-b-501-${k * 100}`);
    expect(errors).toEqual([]);
  });
}

test('a touched import weight is never dropped by a unit change in another tab: Save waits until it is put back @matrix', async ({ page, context }) => {
  const errors = watchErrors(page);
  await openReview(page);
  const row = page.getByTestId('import-set').first();
  await row.tap();
  const sheet = page.getByRole('dialog', { name: 'Check this set' });
  await expect(sheet.getByTestId('wheel-total')).toContainText('53');
  for (let i = 0; i < 2; i++) await sheet.getByRole('button', { name: 'Delete', exact: true }).tap();
  for (const k of ['3', '5']) await sheet.getByRole('button', { name: k, exact: true }).tap();
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();

  // Another tab switches the gym to kg while the sheet is open with the edited 35 lb.
  const other = await context.newPage();
  await other.goto('./#/settings');
  await other.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect(other.getByRole('radio', { name: 'kg', exact: true })).toBeChecked();
  await other.close();

  // The edit is not silently replaced by the file's 53 lb: Save is held, with a way back.
  await expect(sheet.getByTestId('import-weight-invalid')).toHaveText("Units changed to kg. Use the file's weight to save.");
  await expect(save).toBeDisabled();
  await save.tap({ force: true }).catch(() => undefined);
  await expect(sheet).toBeVisible();
  await expect(row).not.toContainText('Checked');
  // Put back to the file's weight: Save works and the set keeps 53 lb exactly.
  await sheet.getByTestId('import-weight-revert').tap();
  await expect(sheet.getByTestId('import-weight-invalid')).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /^(Save|Looks right)$/ })).toBeEnabled();
  await sheet.getByRole('button', { name: /^(Save|Looks right)$/ }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(row).toContainText('53');
  expect(errors).toEqual([]);
});
