// PLAN 3.5j (G, Nov 11, his Guam hotel gym). The test now line, end to end, exactly as it reads:
// "Settings, Gyms, + New gym, Hotel gym, tap your equipment (dumbbells max 22 kg), Make active, then
// Quick workout." Then the cards for that gym at 30 and 45 min (5 to 7 moves, about the minutes, only
// his gear), and a workout from one: the dumbbell wheel stops at the gym's max, and a heavier last
// time says "Heaviest here is 45 lb: add reps". Plus the picker at 130% text.
import { expect, test, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
import { dbAll, dbPut, exerciseView, shotOn, watchErrors } from './workout-helpers';
import { pastIntake, readIdeas } from './helpers/quick';

const SHOTS = '3.5j';
const PHONES = ['iPhone SE', 'iPhone 15'];
type G = { id: string; name: string; isActive: boolean; unit: string; equipment: string[]; dumbbellRange: { min: number; max: number; step: number } | null };
type S = { id: string; endedAt?: number; exerciseIds: string[]; gymId: string };

/** G's list. The hotel preset already has dumbbells, the adjustable bench, the cable station and the treadmill. */
const G_GEAR = ['treadmill', 'elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'yoga_mat', 'lat_pulldown', 'cable_station'];
const TAP_ON = ['elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'kettlebells', 'yoga_mat', 'lat_pulldown'];

const gyms = (page: Page) => dbAll<G>(page, 'gyms');

/** 130% text (SPEC 13.3): every size read first, then all set (nested sizes never compound). */
const text130 = (page: Page, scope: string) =>
  page.evaluate((root) => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>(`${root}, ${root} *`)).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);

/** Settings, Gyms, + New gym, Hotel gym, tap your equipment (dumbbells max 22 kg). */
async function newHotelGym(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).or(page.getByRole('button', { name: 'Settings' })).first().tap();
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByTestId('gyms-list')).toBeVisible();
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  const kit = page.getByTestId('new-gym-equipment');
  await expect(kit).toBeVisible();
  // The hotel preset is on; the bike is not in his gym, the rest of his list is tapped on.
  for (const id of ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike']) await expect(kit.getByTestId(`equip-${id}`)).toHaveAttribute('aria-pressed', 'true');
  await kit.getByTestId('equip-bike').tap();
  for (const id of TAP_ON) await kit.getByTestId(`equip-${id}`).tap();
  for (const id of G_GEAR) await expect(kit.getByTestId(`equip-${id}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(kit.getByTestId('equip-bike')).toHaveAttribute('aria-pressed', 'false');
  // Dumbbells max 22 kg, at a lb gym: typed in kg, the rack's heaviest under it is 45 lb.
  const range = kit.getByTestId('dumbbell-range');
  await expect(range).toContainText('in lb');
  await expect(kit.getByTestId('range-cap')).toHaveText('Heaviest here: 50 lb, about 22.7 kg');
  await range.getByTestId('range-max-unit').getByRole('radio', { name: 'kg' }).tap();
  await expect(kit.getByTestId('range-max')).toHaveValue('');
  await expect(page.getByTestId('add-gym')).toBeDisabled();
  await kit.getByTestId('range-max').fill('22');
  await expect(kit.getByTestId('range-cap')).toHaveText('Heaviest here: 45 lb, about 20.4 kg');
  await expect(kit.getByTestId('range-note')).toHaveText('');
  await shotOn(page, SHOTS, 'new-gym-equipment', PHONES);
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gyms-list')).toContainText('Hotel gym');
}

test('the test now line: + New gym, Hotel gym, his equipment, dumbbells max 22 kg, Make active, then Quick workout @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  const home = (await gyms(page)).find((g) => g.isActive)!;
  await newHotelGym(page);
  const hotel = (await gyms(page)).find((g) => g.name === 'Hotel gym')!;
  expect([...hotel.equipment].sort()).toEqual([...G_GEAR].sort());
  expect(hotel).toMatchObject({ unit: 'lb', isActive: false, dumbbellRange: { min: 5, max: 45, step: 5 } });

  // Make active: right there on the Added toast.
  await page.getByRole('button', { name: 'Make active' }).tap();
  await expect.poll(async () => (await gyms(page)).find((g) => g.isActive)?.id).toBe(hotel.id);
  await shotOn(page, SHOTS, 'gyms-active', PHONES);

  // Then Quick workout (the Today card).
  await page.goto('./');
  await page.getByTestId('build-card').tap();
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  for (const m of [30, 45]) {
    await page.getByTestId(`min-${m}`).tap();
    await expect(page.getByTestId(`min-${m}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-concept]')).toHaveCount(4);
    await expect(page.getByTestId('quick-fewer')).toHaveCount(0);
    for (const c of await readIdeas(page)) {
      const [, count, minutes] = c.meta.match(/^(\d+) exercises? .*~(\d+) min$/)!.map(Number);
      // Strength focus is fewer and heavier on purpose; every other card holds 5 to 7 moves.
      if (c.id !== 'strength') expect(count, `${m} ${c.id}`).toBeGreaterThanOrEqual(5);
      expect(count, `${m} ${c.id}`).toBeLessThanOrEqual(7);
      expect(minutes, `${m} ${c.id}`).toBeLessThanOrEqual(m + 2);
      if (!c.short.length) expect(minutes, `${m} ${c.id}`).toBeGreaterThanOrEqual(m - 2);
      for (const g of c.gearIcons) expect(G_GEAR, `${m} ${c.id} gear`).toContain(g);
    }
    await shotOn(page, SHOTS, `quick-${m}`, PHONES);
  }

  // A workout from the first card (every card here has dumbbell work).
  await page.locator('[data-concept]').first().tap();
  await page.getByTestId('quick-start').tap();
  await expect(page.getByTestId('check-current')).toBeVisible();
  const s = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  expect(s.gymId).toBe(hotel.id);
  const dumbbell = s.exerciseIds.find((id) => /dumbbell/i.test(id));
  expect(dumbbell, s.exerciseIds.join()).toBeDefined();

  // He did 70 lb dumbbells at home: here the target is the heaviest he has, and it says so.
  const at = Date.now() - 6 * 86_400_000;
  await dbPut(page, {
    sessions: [{ id: 'home-35j', gymId: home.id, startedAt: at, endedAt: at + 3_000_000, imported: false, exerciseIds: [dumbbell!] }],
    sets: [0, 1, 2].map((order) => ({ id: `home-35j-${order}`, sessionId: 'home-35j', exerciseId: dumbbell!, order, kind: 'work', uncertain: false, reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 140 } })),
  });
  await page.goto(`./#/workout/${s.id}/${encodeURIComponent(dumbbell!)}`);
  // Written straight to IndexedDB: a reload reads it (the app's own writes are live).
  await page.reload();
  const view = exerciseView(page, dumbbell!);
  await expect(view.getByTestId('set-next')).toContainText('Heaviest here is 45 lb: add reps');
  await shotOn(page, SHOTS, 'heaviest-here', PHONES);
  await view.getByTestId('weight-cell').first().tap();
  const wheel = page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('listbox', { name: 'Weight of one dumbbell' });
  await expect(wheel).toBeVisible();
  const weights = await wheel.getByRole('option').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(weights[0]).toBe('5 lb');
  expect(weights.at(-1)).toBe('45 lb');
  expect(weights).not.toContain('50 lb');
  await expect(wheel.locator('[aria-selected="true"]')).toHaveAttribute('aria-label', '45 lb');
  expect(errors).toEqual([]);
});

test('his equipment screen: the max in kg or lb, under his dumbbells; Make active under the picker; fits at 130% text', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await pastIntake(page);
  await newHotelGym(page);
  const hotel = (await gyms(page)).find((g) => g.name === 'Hotel gym')!;
  await page.getByTestId('gyms-list').locator('button', { hasText: 'Hotel gym' }).tap();
  await expect(page.getByTestId('detail-equipment')).toContainText('Dumbbells 5 to 45 lb');
  await page.getByTestId('edit-equipment').tap();
  const picker = page.getByTestId('gym-equipment');
  await expect(picker.getByTestId('equip-elliptical')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByTestId('equip-yoga_mat')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByTestId('range-max')).toHaveValue('45');
  await expect(picker.getByTestId('range-cap')).toHaveText('Heaviest here: 45 lb, about 20.4 kg');
  // He thinks in lb too: 22 kg again, then 50 lb, each saved as the rack's heaviest under it.
  await picker.getByTestId('range-max-unit').getByRole('radio', { name: 'kg' }).tap();
  await picker.getByTestId('range-max').fill('20');
  await expect.poll(async () => (await gyms(page)).find((g) => g.id === hotel.id)!.dumbbellRange?.max).toBe(40);
  await picker.getByTestId('range-max-unit').getByRole('radio', { name: 'lb' }).tap();
  await picker.getByTestId('range-max').fill('50');
  await expect.poll(async () => (await gyms(page)).find((g) => g.id === hotel.id)!.dumbbellRange?.max).toBe(50);
  await expect(page.getByTestId('make-active')).toBeVisible();
  await checkLayout(page);
  // 130% text: no tile, field or toggle wider than the screen or cut off.
  await text130(page, 'main');
  await page.waitForTimeout(150);
  await checkLayout(page);
  const overflow = await picker.evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="equip-"], [data-testid^="range-"], [role="radio"]'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'hidden')
      .map((el) => el.getAttribute('data-testid') ?? el.textContent),
  );
  expect(overflow).toEqual([]);
  await picker.getByTestId('equip-elliptical').scrollIntoViewIfNeeded();
  await shotOn(page, SHOTS, 'equipment-130', PHONES);
  await picker.getByTestId('dumbbell-range').scrollIntoViewIfNeeded();
  await shotOn(page, SHOTS, 'range-130', PHONES);
  await page.getByTestId('make-active').tap();
  await expect(page.getByTestId('gym-is-active')).toBeVisible();
  expect((await gyms(page)).find((g) => g.isActive)!.id).toBe(hotel.id);
  expect(errors).toEqual([]);
});

test('+ New gym sheet at 130% text: the picker, the rack and Add fit; kg gym keeps 22 kg', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await pastIntake(page);
  await page.goto('./#/settings/gyms');
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('gym-unit').getByRole('radio', { name: 'kg' }).tap();
  const kit = page.getByTestId('new-gym-equipment');
  await expect(kit.getByTestId('range-max')).toHaveValue('24');
  await kit.getByTestId('range-max').fill('22');
  await expect(kit.getByTestId('range-cap')).toHaveText('Heaviest here: 22 kg, about 48.5 lb');
  await text130(page, '[role="dialog"]');
  await page.waitForTimeout(150);
  await checkLayout(page, { primary: page.getByTestId('add-gym') });
  await kit.getByTestId('dumbbell-range').scrollIntoViewIfNeeded();
  await shotOn(page, SHOTS, 'new-gym-130', PHONES);
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gyms-list')).toContainText('Hotel gym');
  expect((await gyms(page)).find((g) => g.name === 'Hotel gym')).toMatchObject({ unit: 'kg', dumbbellRange: { min: 2, max: 22, step: 2 } });
  expect(errors).toEqual([]);
});

test('once G approves treadmill and stairs moves on this phone: a 5 min warm up opens the cards that have room, and starts as a timed row', async ({ page }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  const active = (await gyms(page)).find((g) => g.isActive)!;
  await dbPut(page, {
    gyms: [{ ...active, name: 'Guam', type: 'hotel', equipment: G_GEAR, dumbbellRange: { min: 5, max: 45, step: 5 } }],
    candidateReviews: ['Running_Treadmill', 'Walking_Treadmill', 'Stairmaster'].map((id, i) => ({ id, decision: 'approve', at: 1_000 + i })),
  });
  await page.reload();
  await page.goto('./#/quick?min=45');
  await expect(page.locator('[data-concept]')).toHaveCount(4);
  const ideas = await readIdeas(page);
  // The warm up's machine leads the gear line.
  const warm = ideas.filter((c) => c.gearIcons[0] === 'treadmill' || c.gearIcons[0] === 'stair_climber');
  expect(warm.length, ideas.map((c) => `${c.id} ${c.gearIcons.join('/')}`).join(' | ')).toBeGreaterThan(0);
  await shotOn(page, SHOTS, 'quick-45-cardio', PHONES);
  await page.locator(`[data-concept="${warm[0]!.id}"]`).tap();
  await expect(page.getByTestId('deck-name')).toHaveText(/Treadmill|Stairmaster/);
  await expect(page.getByTestId('deck-sets')).toHaveText('5 min');
  await shotOn(page, SHOTS, 'deck-warm-up', PHONES);
  await page.getByTestId('quick-start').tap();
  await expect(page.getByTestId('check-current')).toBeVisible();
  const s = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  expect(['Running_Treadmill', 'Walking_Treadmill', 'Stairmaster']).toContain(s.exerciseIds[0]);
  await expect(page).toHaveURL(new RegExp(`#/workout/${s.id}/${s.exerciseIds[0]}$`));
  await shotOn(page, SHOTS, 'warm-up-row', PHONES);
  expect(errors).toEqual([]);
});
