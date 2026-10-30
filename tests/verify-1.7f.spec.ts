import { expect, test, type Page } from './fixtures';
import { makeGym } from '../src/db/gyms';
import { collarsWeight } from '../src/lib/load';
import { dbAll, dbPut, exerciseView, loggedRows, watchErrors } from './workout-helpers';

// Independent tester spec for PLAN 1.7f: collars by hand, error states.
type Rec = Record<string, any>;
const sets = async (page: Page) => (await dbAll<Rec>(page, 'sets')).sort((a, b) => a.order - b.order);
const shot = async (page: Page, n: string) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/1.7f/t-${n}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

async function setupGym(page: Page, unit: 'kg' | 'lb', collars: string) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const old = (await dbAll<Rec>(page, 'gyms')).map((g) => ({ ...g, isActive: false }));
  const gym = { ...makeGym({ name: 'G', type: 'full', unit, isActive: true }), collars };
  await dbPut(page, { gyms: [...old, gym] });
  return gym;
}
async function setCollars(page: Page, gymId: string, collars: string) {
  const g = (await dbAll<Rec>(page, 'gyms')).find((x) => x.id === gymId)!;
  await dbPut(page, { gyms: [{ ...g, collars }] });
}

test('kg: competition collars log 65, survive switching the gym to none; new set logs 60', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await setupGym(page, 'kg', 'competition');
  await page.goto('./');
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  const view = exerciseView(page, 'barbell-back-squat');
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await view.getByTestId('weight-cell').first().tap();
  await picker.getByRole('button', { name: 'Add 20 kg plate to each side' }).tap();
  console.log('PICKER math:', await picker.getByTestId('plate-total').getAttribute('data-math').catch(() => 'n/a'), '| total', await picker.getByTestId('plate-total').innerText().catch(() => 'n/a'));
  await shot(page, 'picker-comp');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(loggedRows(view)).toHaveCount(1);
  let s = await sets(page);
  expect(s[0]!.load).toMatchObject({ kind: 'barbell', unit: 'kg', total: 65, barWeight: 20, perSide: [20], collars: 5 });

  await setCollars(page, gym.id, 'none');
  await page.reload();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await loggedRows(exerciseView(page, 'barbell-back-squat')).first().tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  console.log('EDIT math (gym none):', await edit.getByTestId('plate-total').getAttribute('data-math'));
  await expect(edit.getByTestId('plate-total')).toHaveAttribute('data-math', /5\ collars/);
  await shot(page, 'edit-65');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  s = await sets(page);
  expect(s[0]!.load.total).toBe(65);
  expect(s[0]!.load.collars).toBe(5);
  await loggedRows(exerciseView(page, 'barbell-back-squat')).first().tap();
  await edit.getByRole('button', { name: 'Add 1.25 kg plate to each side' }).tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('67.5kg');
  await edit.getByTestId('remove-right').tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  await edit.getByRole('button', { name: 'Save' }).tap();
  s = await sets(page);
  expect(s[0]!.load).toMatchObject({ total: 65, collars: 5 });

  // New set: gym has none now.
  const v = exerciseView(page, 'barbell-back-squat');
  await expect(v.getByTestId('weight-cell').first()).toHaveText('60');
  await v.getByTestId('check-current').tap();
  await expect(loggedRows(v)).toHaveCount(2);
  s = await sets(page);
  expect(s[1]!.load).toMatchObject({ total: 60, collars: 0, perSide: [20] });
  expect(errors).toEqual([]);
});

test('legacy: no collars field, 65 recovers 5; impossible leftover 63 keeps 63 with an honest "other"', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await setupGym(page, 'kg', 'none');
  const sid = 'leg';
  const mk = (i: number, total: number) => ({ id: `${sid}-${i}`, sessionId: sid, exerciseId: 'barbell-back-squat', order: i, kind: 'work', uncertain: false, reps: 5, load: { kind: 'barbell', unit: 'kg', total, barWeight: 20, perSide: [20] } });
  await dbPut(page, { sessions: [{ id: sid, gymId: gym.id, startedAt: Date.now() - 600000, imported: false, exerciseIds: ['barbell-back-squat'] }], sets: [mk(0, 65), mk(1, 63)] });
  await page.goto(`./#/workout/${sid}/barbell-back-squat`);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(loggedRows(view)).toHaveCount(2);
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await loggedRows(view).nth(0).tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  console.log('LEGACY 65 math:', await edit.getByTestId('plate-total').getAttribute('data-math'));
  await edit.getByRole('button', { name: 'Save' }).tap();
  await loggedRows(view).nth(1).tap();
  console.log('LEGACY 63 total:', await edit.getByTestId('plate-total').innerText(), '| math:', await edit.getByTestId('plate-total').getAttribute('data-math'));
  await expect(edit.getByTestId('plate-total')).toHaveText('63kg');
  await expect(edit.getByTestId('plate-total')).toHaveAttribute('data-math', '20 bar + 2 × 20 + 3 other = 63 kg');
  await shot(page, 'edit-63');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  await expect.poll(async () => (await sets(page))[1]!.reps).toBe(6);
  expect((await sets(page))[1]!.load).toMatchObject({ total: 63, barWeight: 20, perSide: [20] });
  // Changing the plates rebuilds the total from the diagram: + 2.5 per side = 65, no "other".
  await loggedRows(view).nth(1).tap();
  await edit.getByRole('button', { name: 'Add 2.5 kg plate to each side' }).tap();
  await expect(edit.getByTestId('plate-total')).toHaveText('65kg');
  await expect(edit.getByTestId('plate-total')).toHaveAttribute('data-math', '20 bar + 2 × (20 + 2.5) = 65 kg');
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  await expect.poll(async () => (await sets(page))[1]!.load.total).toBe(65);
  expect(errors).toEqual([]);
});

test('lb gym: competition collars are 5 kg exactly in lb', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await setupGym(page, 'lb', 'competition');
  expect(collarsWeight('competition', 'lb')).toBeCloseTo(11.023113109, 8);
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  const view = exerciseView(page, 'barbell-back-squat');
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await view.getByTestId('weight-cell').first().tap();
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  console.log('LB picker total/math:', await picker.getByTestId('plate-total').innerText(), '|', await picker.getByTestId('plate-total').getAttribute('data-math'));
  await shot(page, 'picker-lb');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const s = await sets(page);
  console.log('LB saved:', JSON.stringify(s[0]!.load), 'cell:', await view.getByTestId('weight-cell').first().innerText().catch(() => ''), 'row:', await loggedRows(view).first().innerText());
  expect(s[0]!.load.collars).toBeCloseTo(11.023113109, 8);
  await setCollars(page, gym.id, 'none');
  await page.reload();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await loggedRows(exerciseView(page, 'barbell-back-squat')).first().tap();
  console.log('LB edit total/math:', await edit.getByTestId('plate-total').innerText(), '|', await edit.getByTestId('plate-total').getAttribute('data-math'));
  await shot(page, 'edit-lb');
  await edit.getByRole('button', { name: 'Save' }).tap();
  expect((await sets(page))[0]!.load.total).toBeCloseTo(45 + 90 + 11.023113109, 6);
  expect(errors).toEqual([]);
});

const flag = (page: Page, on: boolean) => page.evaluate((v) => ((window as any).__anygymFailReads = v), on);

test('History error: init flag, retry, last good kept; no false empty', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { (window as any).__anygymFailReads = true; });
  await page.goto('./#/history');
  const err = page.getByTestId('load-error');
  await expect(err).toContainText('Could not load workouts');
  await expect(page.getByText('No workouts yet')).toHaveCount(0);
  const retry = err.getByRole('button', { name: 'Try again' });
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  expect((await retry.boundingBox())!.width).toBeGreaterThanOrEqual(47.5);
  await shot(page, 'history-error');
  await flag(page, false);
  await retry.tap();
  await expect(err).toHaveCount(0);
  await expect(page.getByText('No workouts yet')).toBeVisible(); // truly empty DB
  expect(errors).toEqual([]);
});

test('History: good list stays when a re-read fails', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const gym = (await (async () => { await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0); return (await dbAll<Rec>(page, 'gyms'))[0]!; })());
  await dbPut(page, {
    sessions: [{ id: 'h1', gymId: gym.id, startedAt: Date.now() - 86400000, endedAt: Date.now() - 86000000, imported: false, exerciseIds: ['barbell-back-squat'] }],
    sets: [{ id: 'h1s', sessionId: 'h1', exerciseId: 'barbell-back-squat', order: 0, kind: 'work', uncertain: false, reps: 5, load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } }],
  });
  await page.goto('./#/history');
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await flag(page, true);
  // trigger a re-read: a second tab starts a quick workout through the app (a Dexie write to sessions)
  const other = await page.context().newPage();
  await other.goto('./');
  await other.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(other).toHaveURL(/#\/workout\//);
  await expect(page.getByTestId('load-error')).toBeVisible();
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await expect(page.getByText('No workouts yet')).toHaveCount(0);
  await shot(page, 'history-error-kept');
  await flag(page, false);
  await page.getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Today error: flag, retry, last good plan card stays', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { (window as any).__anygymFailReads = true; });
  await page.goto('./');
  const err = page.getByTestId('load-error');
  await expect(err).toContainText("We couldn't read your saved workouts");
  expect((await err.getByRole('button', { name: 'Try again' }).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
  await expect(page.getByRole('button', { name: 'See plans' })).toHaveCount(0);
  await shot(page, 'today-error');
  await flag(page, false);
  await err.getByRole('button', { name: 'Try again' }).tap();
  await expect(err).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
  expect(errors).toEqual([]);
});
