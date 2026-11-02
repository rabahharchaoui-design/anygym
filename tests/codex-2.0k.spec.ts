import { expect, test, type Locator, type Page } from './fixtures';
import { dbAll, exerciseView, navIdle, quickWith, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.0k: the Codex carry over, UI side. (1) changing "Loaded with" never invents a selected
// weight; (4) the demo's pause control is 48 pt; (5) ui-2.2c: Close and Back stay pinned in the
// muscle list and the nested exercise sheet, How to shows in the first screen, and every muscle is
// reachable with a visible 48 pt "Pick a muscle" control.

const device = () => test.info().project.name.replace(/ /g, '-');
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `reports/shots/2.0k/${name}-${device()}.png` });
};

async function openSquat(page: Page) {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view).toBeVisible();
  await page.waitForTimeout(400); // past the arrival guard
  await navIdle(page);
  const card = view.getByTestId('muscle-card');
  await card.scrollIntoViewIfNeeded();
  return { view, card };
}

/** The box sits wholly inside the screen. */
async function onScreen(page: Page, el: Locator) {
  const vh = page.viewportSize()!.height;
  const vw = page.viewportSize()!.width;
  const b = (await el.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(vh + 0.5);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vw + 0.5);
  return b;
}

/** Scrolls the dialog's own scrolling body to its end; returns how far it moved. */
const scrollToEnd = (dialog: Locator) =>
  dialog.evaluate((d) => {
    const body = Array.from(d.querySelectorAll<HTMLElement>('*')).find((el) => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight);
    if (!body) return 0;
    body.scrollTop = body.scrollHeight;
    return body.scrollTop;
  });

test('(5) the muscle list keeps Close pinned, the exercise sheet keeps Back and Close pinned, How to is in the first screen', async ({ page }) => {
  const errors = watchErrors(page);
  const { card } = await openSquat(page);
  await card.locator('svg[data-view="front"] [data-region="quadriceps"]').first().tap();
  await card.getByTestId('muscle-exercises-link').tap();
  const list = page.getByRole('dialog', { name: 'Quads exercises' });
  await expect(list).toBeVisible();
  await page.waitForTimeout(350);
  const close = list.getByRole('button', { name: 'Close', exact: true }).first();
  const before = await onScreen(page, close);
  expect(before.height).toBeGreaterThanOrEqual(44);
  expect(await scrollToEnd(list)).toBeGreaterThan(0); // the list is longer than the sheet
  const after = await onScreen(page, close);
  expect(Math.round(after.y)).toBe(Math.round(before.y));
  await shot(page, 'list-scrolled');

  await list.locator('[data-id="Leg_Extensions"]').scrollIntoViewIfNeeded();
  await list.locator('[data-id="Leg_Extensions"]').tap();
  const sheet = page.getByRole('dialog', { name: 'How to do Leg Extensions' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(350);
  const back = sheet.getByRole('button', { name: 'Back to Quads exercises' });
  const backTop = await onScreen(page, back);
  // How to: its heading and first cue in the first screen, above the pinned Close, unscrolled.
  const closeEx = sheet.getByRole('button', { name: 'Close', exact: true }).first();
  const closeTop = await onScreen(page, closeEx);
  const firstCue = sheet.getByTestId('cues').locator('li').first();
  await expect(sheet.getByRole('heading', { name: 'How to' })).toBeVisible();
  const cue = (await firstCue.boundingBox())!;
  expect(cue.y + cue.height).toBeLessThanOrEqual(closeTop.y);
  expect(cue.y).toBeGreaterThan(backTop.y + backTop.height);
  await shot(page, 'exercise-sheet-first-screen');
  // Scrolled to the end: Back and Close have not moved.
  await scrollToEnd(sheet);
  expect(Math.round((await onScreen(page, back)).y)).toBe(Math.round(backTop.y));
  expect(Math.round((await onScreen(page, closeEx)).y)).toBe(Math.round(closeTop.y));
  await shot(page, 'exercise-sheet-scrolled');
  // (4) the demo's pause control: a 48 pt target.
  const pause = sheet.getByRole('button', { name: 'Pause demo' });
  await pause.scrollIntoViewIfNeeded();
  const p = (await pause.boundingBox())!;
  expect(p.width).toBeGreaterThanOrEqual(48);
  expect(p.height).toBeGreaterThanOrEqual(48);
  await back.tap();
  await expect(sheet).toHaveCount(0);
  await expect(list).toBeVisible();
  await page.waitForTimeout(350);
  await close.tap();
  await expect(list).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('(5) a muscle too small to hit is one visible "Pick a muscle" away (48 pt), and does what a tap does', async ({ page }) => {
  const errors = watchErrors(page);
  const { card } = await openSquat(page);
  const control = card.getByTestId('muscle-pick-control');
  await expect(control).toBeVisible();
  await expect(control).toContainText('Pick a muscle');
  const b = (await control.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(48);
  expect(b.width).toBeGreaterThanOrEqual(48);
  await card.getByTestId('muscle-a11y-pick').selectOption('calves');
  await expect(card.getByTestId('muscle-pick')).toContainText('Calves');
  await expect(card.getByTestId('muscle-exercises-link')).toBeVisible();
  await shot(page, 'pick-a-muscle');
  expect(errors).toEqual([]);
});

test('(1) a single 60 lb kept from "One weight" is never shown or logged as a bare bar under "Plates on a bar"', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  const sessions = await dbAll<{ id: string; endedAt?: number }>(page, 'sessions');
  const sid = sessions.find((s) => s.endedAt === undefined)!.id;
  // The row's weight as picked under "One weight" (another tab, or before the type changed).
  await page.evaluate((id) => {
    const row = { id: 'k60', load: { kind: 'single', unit: 'lb', total: 60 }, plates: [], unit: 'lb', reps: 8, rev: 1, own: { load: true }, pickKind: 'single' };
    localStorage.setItem('anygym-drafts', JSON.stringify({ [id]: { 'barbell-back-squat@0': row } }));
  }, sid);
  await page.reload();
  await expect(view).toBeVisible();
  await page.waitForTimeout(400);
  const first = view.getByTestId('set-todo').first();
  await expect(first.getByTestId('weight-cell')).toContainText('Pick');
  await expect(first.getByTestId('weight-cell')).not.toContainText('45');
  await expect(first.getByTestId('weight-cell')).not.toContainText('60');
  // The ✓ asks for a weight, never logs one.
  await first.getByTestId('check-blocked').tap();
  await expect(page.getByText('Pick a weight first')).toBeVisible();
  expect(await dbAll(page, 'sets')).toEqual([]);
  await shot(page, 'loaded-with-pick');
  expect(errors).toEqual([]);
});
