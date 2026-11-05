// PLAN 3.9 (SPEC 19): gym switching everywhere. DONE (Vitest in src/db/__tests__/gyms-3.9.test.ts, 13 tests).
// this file covers Settings Gyms (add, rename, make active, delete), the pill on Today / day list / Run,
// the mid workout preview with Undo, and fit at SE, 320 and 130% text.
import { expect, test, type Page } from './fixtures';
import { checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { dbAll, shotOn, usePlan, watchErrors } from './workout-helpers';

type G = { id: string; name: string; city?: string; isActive: boolean; type: string };
type Sess = { id: string; gymId: string; exerciseIds: string[]; swaps?: unknown[]; endedAt?: number };

const gyms = (page: Page) => dbAll<G>(page, 'gyms');
const session = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined)!;

const text130 = (page: Page, scope: string) =>
  page.evaluate((root) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`${root}, ${root} *`));
    const sizes = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);

/** Today → Settings → Gyms. */
const openGyms = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).or(page.getByRole('button', { name: 'Settings' })).first().tap();
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByTestId('gyms-list')).toBeVisible();
};

/** + New gym in Settings: a hotel gym with a name and city. */
const addHotel = async (page: Page, name = 'Hotel in Tokyo', city = 'Tokyo') => {
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('gym-name').fill(name);
  await page.getByTestId('gym-city').fill(city);
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gyms-list')).toContainText(name);
};

const rowOf = (page: Page, name: string) => page.getByTestId('gyms-list').locator('button', { hasText: name });

test('add a hotel gym in Settings, make it active, Today shows the pill, the day list swaps with the reason @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openGyms(page);
  await expect.poll(async () => (await gyms(page)).length).toBe(1);
  await expect(page.getByTestId('gyms-list')).toContainText('Active');
  await addHotel(page);
  await expect(rowOf(page, 'Hotel in Tokyo')).toContainText('Tokyo');
  await expect(rowOf(page, 'Hotel in Tokyo')).toContainText('Dumbbells');
  await shotOn(page, '3.9', 'gyms-list');
  // Added, not active yet.
  expect((await gyms(page)).filter((g) => g.isActive)).toHaveLength(1);

  await rowOf(page, 'Hotel in Tokyo').tap();
  await page.getByTestId('make-active').tap();
  await expect(page.getByTestId('gym-is-active')).toBeVisible();
  await shotOn(page, '3.9', 'gym-detail');
  expect((await gyms(page)).find((g) => g.isActive)?.name).toBe('Hotel in Tokyo');

  await usePlan(page);
  await expect(page.getByTestId('gym-pill').first()).toContainText('Hotel in Tokyo');
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toContainText('Swapped: no barbell here');
  await expect(page.getByTestId('workout-meta')).toContainText('Hotel in Tokyo');
  expect(errors).toEqual([]);
});

test('the pill opens recent gyms; + New gym switches in two taps; the Run tab has the pill too @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openGyms(page);
  await addHotel(page, 'Home', '');
  await page.goto('./');
  await page.getByTestId('gym-pill').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Gyms' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-testid^="gym-"][aria-current="true"]')).toHaveCount(1);
  await shotOn(page, '3.9', 'sheet');
  const other = (await gyms(page)).find((g) => !g.isActive)!;
  await sheet.getByTestId(`gym-${other.id}`).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('gym-pill').first()).toContainText('Home');
  await expect(page.getByTestId('toast-text')).toContainText('Now at');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(async () => (await gyms(page)).find((g) => g.isActive)?.id).not.toBe(other.id);

  await page.getByRole('link', { name: 'Run' }).tap();
  await expect(page.getByTestId('gym-pill')).toBeVisible();
  await page.getByTestId('gym-pill').tap();
  await page.getByTestId('new-gym-row').tap();
  await page.getByTestId('preset-outdoors').tap();
  await page.getByTestId('gym-name').fill('The park');
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gym-pill')).toContainText('The park');
  const park = (await gyms(page)).find((g) => g.name === 'The park')!;
  expect(park.isActive).toBe(true);
  expect(errors).toEqual([]);
});

test('switching in the middle of a workout previews what swaps, keeps logged sets, and Undo restores @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const before = await session(page);
  const fullGym = (await gyms(page)).find((g) => g.isActive)!;
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toHaveCount(0);

  await page.getByTestId('gym-pill').tap();
  const sheet = page.getByRole('dialog', { name: 'Gyms' });
  // From a workout the sheet has no way out to Settings.
  await expect(sheet.getByTestId('edit-gyms')).toHaveCount(0);
  await sheet.getByTestId('new-gym-row').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('add-gym').tap();

  const preview = page.getByTestId('switch-preview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Switch to Hotel gym?');
  await expect(preview.getByTestId('switch-change-swap').first()).toContainText('Swapped: no barbell here');
  await shotOn(page, '3.9', 'switch-preview');
  // Nothing written before the confirm.
  expect((await session(page)).gymId).toBe(fullGym.id);
  await page.getByTestId('switch-confirm').tap();
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toContainText('Swapped: no barbell here');
  await expect(page.getByTestId('workout-meta')).toContainText('Hotel gym');
  expect((await session(page)).gymId).not.toBe(fullGym.id);

  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toHaveCount(0);
  await expect.poll(async () => (await session(page)).gymId).toBe(fullGym.id);
  const after = await session(page);
  expect(after.exerciseIds).toEqual(before.exerciseIds);
  expect(after.swaps).toBeUndefined();
  expect((await gyms(page)).find((g) => g.isActive)?.id).toBe(fullGym.id);
  expect(errors).toEqual([]);
});

test('rename, delete with Undo, and delete blocked when workouts were logged @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  const used = (await gyms(page)).find((g) => g.isActive)!;
  await openGyms(page);
  await addHotel(page, 'Hotel');

  // Rename.
  await rowOf(page, 'Hotel').tap();
  await page.getByTestId('detail-name').fill('Marriott');
  await page.getByTestId('detail-name').blur();
  await expect(page.getByRole('heading', { name: 'Marriott' })).toBeVisible();
  expect((await gyms(page)).some((g) => g.name === 'Marriott')).toBe(true);

  // Delete with Undo (no workouts there).
  await page.getByTestId('delete-gym').tap();
  await expect(page.getByTestId('gyms-list')).not.toContainText('Marriott');
  await expect(page.getByTestId('toast-text')).toContainText('Deleted');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('gyms-list')).toContainText('Marriott');

  // The gym with a workout cannot be deleted, and says why.
  await page.getByTestId(`gyms-row-${used.id}`).tap();
  await expect(page.getByTestId('delete-gym')).toBeDisabled();
  await expect(page.getByText('Workouts were logged here')).toBeVisible();
  expect((await gyms(page)).some((g) => g.id === used.id)).toBe(true);
  expect(errors).toEqual([]);
});

test('Settings, the sheet and the preview fit at 130% text; the equipment picker edits a gym @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await openGyms(page);
  await addHotel(page, 'A hotel gym with a rather long name here', 'Some city');
  for (const big of [false, true]) {
    if (big) await text130(page, 'main');
    await checkLayout(page);
    for (const t of await page.getByTestId('gyms-list').locator('span span').all()) expect(await fullyShown(t)).toBe(true);
  }
  await rowOf(page, 'A hotel gym').tap();
  await page.getByTestId('edit-equipment').tap();
  await expect(page).toHaveURL(/equipment$/);
  await checkLayout(page);
  await shotOn(page, '3.9', 'equipment', ['iPhone SE', 'iPhone 17 Pro Max']);
  // Every tap saves: turning the cable station off shows in the gym's summary.
  const before = (await gyms(page)).find((g) => g.name.startsWith('A hotel'))! as G & { equipment: string[] };
  expect(before.equipment).toContain('cable_station');
  await page.getByRole('button', { name: /Cable station/ }).first().tap();
  await expect.poll(async () => ((await gyms(page)).find((g) => g.id === before.id) as typeof before).equipment).not.toContain('cable_station');
  await page.getByLabel('Back to the gym').tap();
  await expect(page.getByTestId('detail-equipment')).toBeVisible();

  await page.goto('./');
  await page.getByTestId('gym-pill').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Gyms' });
  await expect(sheet).toBeVisible();
  await text130(page, '[role="dialog"]');
  await checkLayout(page, { scope: '[role="dialog"]' });
  await shotOn(page, '3.9', 'sheet-130');
  expect(errors).toEqual([]);
});
