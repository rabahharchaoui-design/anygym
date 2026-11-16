import { expect, test, type Page } from './fixtures';
import { fullyShown, rootAtRest } from './helpers/layout';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// PLAN 3.7a (gate critic 1, 3, 5): the weight screens never show a number they are not sure of,
// never ask a question whose answers cannot be true, and keep every plate button above Done.

const loadQuestion = (page: Page) => page.getByRole('dialog', { name: 'How do you load this?' });

/** A workout already running with these exercises (catalog ids), opened on its list. */
async function workoutWith(page: Page, ids: string[]) {
  await page.goto('./');
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `w37a-${Date.now()}`;
  await dbPut(page, { sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 60_000, imported: false, exerciseIds: ids }] });
  await page.goto(`./#/workout/${id}`);
  await expect(page.getByTestId(`row-${ids[0]}`)).toBeVisible();
}

test.describe('3.7a (3) load kinds from the equipment @matrix', () => {
  test('Machine Bench Press asks only the two machine answers, the stack first', async ({ page }) => {
    const errors = watchErrors(page);
    await workoutWith(page, ['Machine_Bench_Press', 'Preacher_Curl']);
    await page.getByTestId('row-Machine_Bench_Press').tap();
    const q = loadQuestion(page);
    await expect(q).toHaveAttribute('data-state', 'open');
    const choices = (await q.locator('button[aria-pressed]').allInnerTexts()).map((t) => (t.split('\n')[0] ?? '').trim());
    expect(choices).toEqual(['Machine with a pin', 'Plates on a machine']);
    for (const no of ['Plates on a bar', 'Dumbbells', 'One weight', 'Bodyweight', 'Timed']) await expect(q.getByText(no, { exact: true })).toHaveCount(0);
    await q.getByText('Machine with a pin', { exact: true }).tap();
    await expect(q).toHaveCount(0);
    await expect(exerciseView(page, 'Machine_Bench_Press').getByTestId('weight-cell').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('one possible kind: a barbell Preacher Curl opens without the question', async ({ page }) => {
    const errors = watchErrors(page);
    await workoutWith(page, ['Preacher_Curl', 'Machine_Bench_Press']);
    await page.getByTestId('row-Preacher_Curl').tap();
    await expect(exerciseView(page, 'Preacher_Curl').getByTestId('weight-cell').first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(loadQuestion(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

const CALF = 'machine-seated-calf-raise';
const CALF_NAME = 'Machine Seated Calf Raise';
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });

async function openCalfWeight(page: Page) {
  const view = exerciseView(page, CALF);
  if (!(await view.isVisible())) await page.getByText(CALF_NAME, { exact: true }).first().tap();
  await view.getByTestId('weight-cell').first().tap();
  await expect(weightSheet(page)).toHaveAttribute('data-state', 'open');
  await rootAtRest(page);
  await page.waitForTimeout(400);
  return weightSheet(page);
}

/** The active gym with the calf raise's start weight answered (50 lb), its sides not. */
async function knownStart(page: Page, value = 50) {
  const gym = (await dbAll<{ id: string; isActive: boolean; equipmentWeights: Record<string, unknown> }>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...gym, equipmentWeights: { ...gym.equipmentWeights, [CALF]: { kind: 'starting_resistance', value } } }] });
}

test.describe('3.7a (1) one side or both, not answered yet @matrix', () => {
  test('one 45 plate shows the plate, no total, Done held; One side then reads 95 and logs 95', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await knownStart(page);
    await quickWith(page, [['seated calf', CALF_NAME]]);
    const s = await openCalfWeight(page);
    await expect(s.getByTestId('sides-question')).toBeVisible();
    await s.getByRole('button', { name: 'Add 45 lb plate', exact: true }).tap();
    const total = s.getByTestId('plate-total');
    await expect(total).toHaveText('—lb');
    await expect(total).toHaveAttribute('aria-label', 'Total not known yet: answer one side or both');
    await expect(s.getByTestId('plate-note')).toHaveText('1 × 45 lb plate + 50 lb start');
    await expect(s.getByText('90', { exact: false })).toHaveCount(0);
    await expect(s.getByText('Each side', { exact: false })).toHaveCount(0);
    await expect(s.getByText('Put on', { exact: false }).first()).toBeVisible();
    await expect(s.getByTestId('picker-title')).toHaveText('Machine · plates');
    await expect(s.getByRole('button', { name: 'Type it' })).toHaveCount(0);
    const held = s.getByRole('button', { name: 'Answer one side or both first' });
    await expect(held).toBeDisabled();
    // The answer is right there: one tap, and the same plates total.
    await s.getByTestId('sides-question').getByRole('button', { name: 'One side' }).tap();
    await expect(s.getByTestId('sides-question')).toHaveCount(0);
    await expect(total).toHaveText('95lb');
    await expect(total).toHaveAttribute('data-math', '50 start + 45 = 95 lb');
    await expect(s.getByTestId('picker-title')).toHaveText('Machine · plates on one side');
    await s.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(s).toHaveCount(0);
    const view = exerciseView(page, CALF);
    await expect(view.getByTestId('weight-cell').first()).toHaveText('95');
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const sets = (await dbAll<{ exerciseId: string; load?: unknown }>(page, 'sets')).filter((x) => x.exerciseId === CALF);
    expect(sets.map((x) => x.load)).toEqual([{ kind: 'plate_machine', unit: 'lb', total: 95, barWeight: 50, perSide: [45], collars: 0, horns: 1 }]);
    expect(errors).toEqual([]);
  });

  test('both sides after plates: 50 + 2 × 45 = 140; start unknown too: no doubled plates either', async ({ page }) => {
    await quickWith(page, [['seated calf', CALF_NAME]]);
    const s = await openCalfWeight(page);
    await expect(s.getByTestId('start-question')).toBeVisible();
    await s.getByRole('button', { name: 'Add 45 lb plate', exact: true }).tap();
    await expect(s.getByTestId('plate-total')).toHaveText('—lb');
    await expect(s.getByTestId('plate-note')).toHaveText('1 × 45 lb plate + start');
    await expect(s.getByRole('button', { name: 'Set the starting weight first' })).toBeDisabled();
    await s.getByTestId('start-question').getByRole('button', { name: 'Plates only' }).tap();
    await expect(s.getByTestId('sides-question')).toBeVisible();
    await expect(s.getByTestId('plate-total')).toHaveText('—lb');
    await expect(s.getByTestId('plate-note')).toHaveText('1 × 45 lb plate');
    await s.getByTestId('sides-question').getByRole('button', { name: 'Both sides' }).tap();
    await expect(s.getByTestId('plate-total')).toHaveText('90lb');
    await expect(s.getByTestId('plate-total')).toHaveAttribute('data-math', '2 × 45 = 90 lb');
    await expect(s.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  });
});

/** Every plate button sits fully in the sheet's visible body, above the Done bar. */
async function platesAboveDone(page: Page, scroll: boolean) {
  const s = weightSheet(page);
  // The Done bar (its 12 px top padding) counts as under it, and on a scrolling sheet its fade too
  // (12 px above it, Sheet.module.css .sheet[data-scroll='true'] .footer::before).
  const fade = (await s.getAttribute('data-scroll')) === 'true' ? 12 : 0;
  const doneTop = (await s.getByRole('button', { name: /Done|first$/ }).boundingBox())!.y - 12 - fade;
  const plates = s.getByRole('group', { name: 'Plates' }).getByRole('button');
  const n = await plates.count();
  expect(n).toBeGreaterThanOrEqual(6);
  for (let i = 0; i < n; i++) {
    const b = plates.nth(i);
    // Reachable: the body scrolled to its end (the tray is its last row) shows the whole button clear of the fade.
    if (scroll)
      await b.evaluate((el) => {
        for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).overflowY === 'auto') p.scrollTop = p.scrollHeight;
      });
    expect(await fullyShown(b), `plate ${i} fully shown`).toBe(true);
    const box = (await b.boundingBox())!;
    expect(box.y + box.height, `plate ${i} above Done`).toBeLessThanOrEqual(doneTop + 0.5);
    expect(box.height, `plate ${i} tap height`).toBeGreaterThanOrEqual(44);
  }
}

const scaleText = (page: Page, k: number) =>
  page.evaluate((k) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] *')).map((el) => {
      const c = getComputedStyle(el);
      return { el, size: parseFloat(c.fontSize), line: parseFloat(c.lineHeight) };
    });
    for (const { el, size, line } of els) {
      el.style.fontSize = `${size * k}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * k}px`;
    }
  }, k);

test.describe('3.7a (5) the plate buttons stay above Done with a question card @matrix', () => {
  for (const state of ['start', 'sides'] as const) {
    test(`${state} question: every plate button and the title in view, nothing under Done; 130% text scrolls to each`, async ({ page }) => {
      await page.goto('./');
      if (state === 'sides') await knownStart(page);
      await quickWith(page, [['seated calf', CALF_NAME]]);
      const s = await openCalfWeight(page);
      await expect(s.getByTestId(`${state}-question`)).toBeVisible();
      expect(await fullyShown(s.getByRole('heading', { name: /^Set 1/ })), 'title not under the grabber').toBe(true);
      const title = (await s.getByRole('heading', { name: /^Set 1/ }).boundingBox())!;
      const grabber = (await s.getByRole('button', { name: 'Close' }).first().boundingBox())!;
      expect(title.y, 'title below the grabber bar').toBeGreaterThanOrEqual(grabber.y + grabber.height - 30);
      await platesAboveDone(page, false);
      await scaleText(page, 1.3);
      await page.waitForTimeout(250);
      await platesAboveDone(page, true);
    });
  }
});
