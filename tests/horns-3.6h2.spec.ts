import { expect, test, type Page } from './fixtures';
import { checkLayout, fullyShown, rootAtRest } from './helpers/layout';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';

// PLAN 3.6h2 (1): a plate machine whose sides are not known asks once per gym, "Does this machine
// load on one side or both?", right after the start weight in the same card. One side counts the
// plates once (start + plates), both sides twice; the answer survives a reload and a second
// workout; changing it later changes new sets only; a set logged before keeps its total.

const ID = 'machine-seated-calf-raise';
const NAME = 'Machine Seated Calf Raise';
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
type StoredSet = { exerciseId: string; sessionId: string; load?: { total: number; horns?: 1 } };

/** The weight sheet of the calf raise, open and at rest. */
async function openWeight(page: Page) {
  const back = page.getByRole('button', { name: 'Back to the list' });
  if (await back.isVisible()) await back.tap();
  await page.getByText(NAME, { exact: true }).first().tap();
  await exerciseView(page, ID).getByTestId('weight-cell').first().tap();
  await expect(sheet(page)).toHaveAttribute('data-state', 'open');
  await rootAtRest(page);
  await page.waitForTimeout(400);
  return sheet(page);
}

async function done(page: Page) {
  await sheet(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(sheet(page)).toHaveCount(0);
  await page.waitForTimeout(400);
}

/** The active gym, with this machine's start weight already answered (50 lb). */
async function knownStart(page: Page) {
  const gym = (await dbAll<{ id: string; isActive: boolean; equipmentWeights: Record<string, unknown> }>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, equipmentWeights: { ...gym.equipmentWeights, [ID]: { kind: 'starting_resistance', value: 50 } } }] });
}

const calfSets = async (page: Page) => (await dbAll<StoredSet>(page, 'sets')).filter((s) => s.exerciseId === ID);

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
}

test.describe('one side or both @matrix', () => {
  test('both unknown: the start, then the sides, in one card; both sides is start + 2 × plates; a second workout asks nothing', async ({ page }) => {
    const errors = watchErrors(page);
    await quickWith(page, [['seated calf', NAME]]);
    let s = await openWeight(page);
    await expect(s.getByTestId('start-question')).toBeVisible();
    await expect(s.getByTestId('sides-question')).toHaveCount(0);
    await s.getByRole('button', { name: 'Set starting weight' }).first().tap();
    const start = page.getByRole('dialog', { name: 'Starting weight' });
    await expect(start).toBeVisible();
    for (const ch of '50') await start.getByRole('button', { name: ch, exact: true }).tap();
    await start.getByRole('button', { name: 'Save starting weight' }).tap();
    await expect(start).toHaveCount(0);
    // Same card, same place: now the sides, one tap.
    await expect(s.getByTestId('start-question')).toHaveCount(0);
    await expect(s.getByTestId('sides-question')).toContainText('Does this machine load on one side or both?');
    await s.getByTestId('sides-question').getByRole('button', { name: 'Both sides' }).tap();
    await expect(s.getByTestId('sides-question')).toHaveCount(0);
    await s.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
    await expect(s.getByTestId('plate-total')).toHaveText('140lb');
    await expect(s.getByTestId('plate-total')).toHaveAttribute('data-math', '50 start + 2 × 45 = 140 lb');
    await expect(s.getByTestId('picker-title')).toHaveText('Machine · plates per side');
    await done(page);
    const view = exerciseView(page, ID);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    expect((await calfSets(page)).map((x) => x.load)).toEqual([{ kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 }]);
    expect((await dbAll<{ machineHorns?: Record<string, number> }>(page, 'gyms')).find((g) => g.machineHorns)?.machineHorns).toEqual({ [ID]: 2 });
    await finish(page);

    // A second workout: neither question again.
    await quickWith(page, [['seated calf', NAME]]);
    s = await openWeight(page);
    await expect(s.getByTestId('start-question')).toHaveCount(0);
    await expect(s.getByTestId('sides-question')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('one side is start + plates and says so; it survives a reload; changing it later changes new sets only', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    // Logged before the question existed: 50 start + 2 × 45 = 140 lb, no snapshot.
    await seedFinished(page, { [ID]: [{ reps: 10, load: { kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 } }] });
    await knownStart(page);
    await quickWith(page, [['seated calf', NAME]]);
    const view = exerciseView(page, ID);
    // Last time shows what was logged, as logged. On a small phone the exercise is already open; a tap on its name would open the demo.
    if (!(await view.isVisible())) await page.getByText(NAME, { exact: true }).first().tap();
    await expect(view).toBeVisible();
    await expect(view.getByRole('button', { name: /^Last time 140/ }).first()).toBeVisible();
    let s = await openWeight(page);
    // The start is known: only the sides are asked.
    await expect(s.getByTestId('start-question')).toHaveCount(0);
    await expect(s.getByTestId('sides-question')).toBeVisible();
    await s.getByTestId('sides-question').getByRole('button', { name: 'One side' }).tap();
    await expect(s.getByTestId('sides-question')).toHaveCount(0);
    // Nothing carried over from the both sides set while the sides were not known (PLAN 3.7a): empty.
    await expect(s.getByRole('button', { name: 'Clear' })).toBeDisabled();
    await s.getByRole('button', { name: 'Add 45 lb plate', exact: true }).tap();
    await expect(s.getByTestId('plate-total')).toHaveText('95lb');
    await expect(s.getByTestId('plate-total')).toHaveAttribute('data-math', '50 start + 45 = 95 lb');
    await expect(s.getByTestId('picker-title')).toHaveText('Machine · plates on one side');
    await expect(s.getByText('On the machine', { exact: false }).first()).toBeVisible();
    await done(page);
    await expect(view.getByTestId('weight-cell').first()).toHaveText('95');
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);

    let sets = await calfSets(page);
    const old = sets.find((x) => x.sessionId.startsWith('seed-'))!;
    const fresh = sets.filter((x) => !x.sessionId.startsWith('seed-'));
    expect(old.load).toEqual({ kind: 'plate_machine', unit: 'lb', total: 140, barWeight: 50, perSide: [45], collars: 0 });
    expect(fresh.map((x) => x.load)).toEqual([{ kind: 'plate_machine', unit: 'lb', total: 95, barWeight: 50, perSide: [45], collars: 0, horns: 1 }]);

    // A reload: the answer stays, nothing is asked.
    await page.reload();
    s = await openWeight(page);
    await expect(s.getByTestId('sides-question')).toHaveCount(0);
    await expect(s.getByTestId('plate-total')).toHaveText('95lb');

    // Changed later where the start is changed: Change start, Loads on.
    await s.getByRole('button', { name: /Start 50 lb · Change/ }).tap();
    const change = page.getByRole('dialog', { name: 'Starting weight' });
    await expect(change).toBeVisible();
    const row = change.getByTestId('sides-row');
    await expect(row.getByRole('button', { name: 'One side' })).toHaveAttribute('aria-pressed', 'true');
    await row.getByRole('button', { name: 'Both sides' }).tap();
    await expect(row.getByRole('button', { name: 'Both sides' })).toHaveAttribute('aria-pressed', 'true');
    await change.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(change).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(s.getByTestId('plate-total')).toHaveText('140lb');
    await done(page);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    sets = await calfSets(page);
    // New set: both sides; the one side set and the old set keep their totals.
    expect(sets.map((x) => x.load?.total).sort()).toEqual([140, 140, 95].sort());
    expect(sets.find((x) => x.load?.total === 95)!.load!.horns).toBe(1);
    expect(sets.find((x) => x.sessionId.startsWith('seed-'))!.load).toEqual(old.load);
    expect(errors).toEqual([]);
  });

  test('the question fits at 100% and 130% text: nothing clipped, every control 48 pt', async ({ page }) => {
    // Like the 2.0d sheet checks: the app laid out with no system bars, measured the same way.
    await page.goto('./');
    await knownStart(page);
    await quickWith(page, [['seated calf', NAME]]);
    const s = await openWeight(page);
    const q = s.getByTestId('sides-question');
    await expect(q).toBeVisible();
    await checkLayout(page, { scope: '[role="dialog"]', insets: { top: 0, bottom: 0, left: 0, right: 0 } });
    // The plates tray stays in view under the question, above Done.
    const tray = s.getByRole('group', { name: 'Plates' });
    const trayBox = (await tray.boundingBox())!;
    // Held until the sides are answered (PLAN 3.7a): "Answer one side or both first".
    const doneBox = (await s.getByRole('button', { name: 'Answer one side or both first', exact: true }).boundingBox())!;
    expect(trayBox.y + trayBox.height, 'tray above Done').toBeLessThanOrEqual(doneBox.y + 0.5);
    for (const scale of [1, 1.3]) {
      if (scale > 1)
        await page.evaluate((k) => {
          // Read every size first, then scale: a parent's new size never compounds into its children.
          const els = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] *')).map((el) => {
            const c = getComputedStyle(el);
            return { el, size: parseFloat(c.fontSize), line: parseFloat(c.lineHeight) };
          });
          for (const { el, size, line } of els) {
            el.style.fontSize = `${size * k}px`;
            if (Number.isFinite(line)) el.style.lineHeight = `${line * k}px`;
          }
        }, scale);
      await page.waitForTimeout(200);
      await q.scrollIntoViewIfNeeded();
      expect(await fullyShown(q.getByRole('heading')), `title at ${scale}`).toBe(true);
      for (const name of ['One side', 'Both sides']) {
        const b = q.getByRole('button', { name });
        expect(await fullyShown(b), `${name} at ${scale}`).toBe(true);
        const box = (await b.boundingBox())!;
        expect(box.height, `${name} height`).toBeGreaterThanOrEqual(48);
        expect(box.width, `${name} width`).toBeGreaterThanOrEqual(48);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `no sideways scroll at ${scale}`).toBeLessThanOrEqual(0);
    }
  });
});
