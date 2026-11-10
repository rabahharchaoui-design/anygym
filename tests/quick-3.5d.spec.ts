import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, shotOn } from './workout-helpers';
import { pastIntake } from './helpers/quick';

// PLAN 3.5d: logging and Quick deck fixes. LAST TIME lines up by work set number and is – on warm up
// rows (set 1 keeps its last time after warm ups are logged); a warm up starts no rest timer; a More
// ideas tap scrolls the new card into view and glows once; the next member of a pair is a button in
// the bottom bar; the meta line never starts a line with a dot.

const DAY = 86_400_000;
const BAR185 = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };

async function seedHistory(page: Page) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const startedAt = Date.now() - 3 * DAY;
  await dbPut(page, {
    sessions: [{ id: 'seed-s1', gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat'] }],
    sets: [0, 1, 2].map((i) => ({ id: `seed-s1-${i}`, sessionId: 'seed-s1', exerciseId: 'barbell-back-squat', order: i, kind: 'work', reps: 10 - i, load: BAR185, uncertain: false })),
    profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { experience: '3y' } }],
  });
}

test.describe('3.5d logging', () => {
  test('LAST TIME is by work set: – on warm up rows, set 1 keeps its last time after logging, no rest after a warm up', async ({ page }) => {
    await seedHistory(page);
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    const todo = view.getByTestId('set-todo');
    await expect(todo.getByTestId('weight-cell')).toHaveText(['45', '90', '140', '185', '185', '185']);
    const lastOf = (row: ReturnType<typeof todo.nth>) => row.getByRole('button', { name: /last time/i }).innerText();
    expect(await Promise.all([0, 1, 2, 3, 4, 5].map((i) => lastOf(todo.nth(i))))).toEqual(['–', '–', '–', '185 × 10', '185 × 9', '185 × 8']);
    await shotOn(page, '3.5d', 'last-time-before', ['iPhone 15', 'iPhone SE']);
    // Log the three warm ups: no rest timer after any of them.
    for (let i = 1; i <= 3; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
    }
    await page.waitForTimeout(500);
    await expect(page.getByTestId('rest-timer')).toHaveCount(0);
    const loggedLast = (i: number) => loggedRows(view).nth(i).getByRole('button', { name: /Edit/ }).locator('span').first().innerText();
    // 3.5g: the three finished warm ups fold into one row; Show brings them back to read.
    await expect(view.getByTestId('warmups-done')).toHaveText(/3 warm ups done/);
    await view.getByTestId('warmups-done').getByRole('button').tap();
    expect(await Promise.all([0, 1, 2].map(loggedLast))).toEqual(['–', '–', '–']);
    // Set 1 (the first working set) still shows its own last time, after logging it too.
    await expect(todo.nth(0).getByRole('button', { name: /last time/i })).toHaveText('185 × 10');
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(4);
    expect(await loggedLast(3)).toBe('185 × 10');
    await expect(todo.nth(0).getByRole('button', { name: /last time/i })).toHaveText('185 × 9');
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await shotOn(page, '3.5d', 'last-time-after', ['iPhone 15', 'iPhone SE']);
  });
});

test.describe('3.5d round 3 logging', () => {
  test('All done counts work sets only: 3 warm ups and 3 work sets read "All 3 sets done"', async ({ page }) => {
    await seedHistory(page);
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    for (let i = 1; i <= 6; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
      await page.waitForTimeout(300);
    }
    await expect(view.getByTestId('set-todo')).toHaveCount(0);
    await expect(view.getByTestId('set-target')).toHaveText('All 3 sets done');
  });
});

test.describe('3.5d Quick', () => {
  test('a More ideas tap scrolls the new card into view, names the idea, removes the chip and glows once', async ({ page }) => {
    await pastIntake(page);
    await page.goto('./#/quick?min=30');
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    const more = page.getByTestId('more-ideas');
    await more.scrollIntoViewIfNeeded();
    const chip = more.locator('button[data-key]').first();
    const key = (await chip.getAttribute('data-key'))!;
    await shotOn(page, '3.5d', 'more-before', ['iPhone 15', 'iPhone SE']);
    await chip.tap();
    const card = page.locator(`[data-concept][data-key="${key}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-flash', 'true');
    // In view (the page scrolled to it), whatever the viewport.
    await expect.poll(async () => {
      const b = await card.boundingBox();
      const h = page.viewportSize()!.height;
      return !!b && b.y >= 0 && b.y + b.height <= h + 1;
    }).toBe(true);
    await shotOn(page, '3.5d', 'more-after', ['iPhone 15', 'iPhone SE']);
    // The chosen idea is named on the card, and its chip left the row (the card it replaced is the way back).
    await expect(card.getByTestId('concept-title')).not.toHaveText('');
    await expect(more.locator(`button[data-key="${key}"]`)).toHaveCount(0);
    // The glow is brief.
    await expect(card).not.toHaveAttribute('data-flash', 'true', { timeout: 3000 });
  });

  test('no note under the cards', async ({ page }) => {
    await pastIntake(page, ['dumbbells', 'adjustable_bench']);
    await page.goto('./#/quick?min=30');
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    await expect(page.getByTestId('quick-fewer')).toHaveCount(0);
  });

  test('the new style names, and a meta line that never starts a line with a dot', async ({ page }) => {
    await pastIntake(page);
    for (const m of [15, 30]) {
      await page.goto(`./#/quick?min=${m}`);
      await expect(page.locator('[data-concept]').first()).toBeVisible();
      const titles = await page.getByTestId('concept-title').allTextContents();
      expect(titles.join('|')).not.toMatch(/Superset pump|finisher/);
      const dotFirst = await page.getByTestId('concept-meta').evaluateAll((els) =>
        els.flatMap((e) => Array.from(e.children).filter((c) => (c.textContent ?? '').trim().startsWith('·')).map((c) => c.textContent)),
      );
      expect(dotFirst).toEqual([]);
      // ~T min stays on one line.
      const wrapped = await page.getByTestId('concept-meta').evaluateAll((els) => els.flatMap((e) => Array.from(e.children).filter((c) => /min$/.test(c.textContent ?? '') && c.getClientRects().length > 1).map((c) => c.textContent)));
      expect(wrapped).toEqual([]);
    }
    await shotOn(page, '3.5d', 'meta-line', ['iPhone SE', 'iPhone 15']);
  });

  test('inside a pair, Next in the pair is a button in the bottom bar after a set', async ({ page }) => {
    test.setTimeout(120_000);
    await pastIntake(page);
    await page.goto('./#/quick?min=30');
    const pump = page.locator('[data-concept="pump"]');
    await expect(pump).toBeVisible();
    const n = Number(((await pump.getByTestId('concept-meta').textContent()) ?? '').match(/^(\d+) exercises/)?.[1] ?? 0);
    await pump.tap();
    for (let k = 0; k < n; k++) await page.getByTestId('deck-keep').tap();
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('exercise-view').or(page.locator('[data-testid^="exercise-"]')).first()).toBeVisible();
    type S = { endedAt?: number; exerciseIds: string[] };
    const sess = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    // Weights from last time, so the first tap logs a set (a first time lift asks for a weight).
    const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
    const start = Date.now() - 6 * DAY;
    const loadOf = (id: string) => (/^single-arm/.test(id) ? { kind: 'single', unit: 'lb', total: 30 } : /dumbbell|kettlebell/.test(id) ? { kind: 'dumbbell_each', unit: 'lb', total: 20 } : /^barbell|^hip-thrust|^deadlift|^overhead-press/.test(id) ? { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } : { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 });
    await dbPut(page, {
      sessions: [{ id: 'seed-loads', gymId, startedAt: start, endedAt: start + 3_000_000, imported: false, exerciseIds: sess.exerciseIds }],
      sets: sess.exerciseIds.map((id, i) => ({ id: `seed-loads-${i}`, sessionId: 'seed-loads', exerciseId: id, order: i, kind: 'work', uncertain: false, reps: 10, load: loadOf(id) })),
    });
    await page.reload();
    await expect(checkCurrent(page)).toBeVisible();
    await expect(page.getByTestId('group-next')).toHaveCount(0);
    await checkCurrent(page).tap();
    const next = page.getByTestId('group-next');
    await expect(next).toBeVisible();
    await expect(next).toContainText('Next in the pair:');
    const box = (await next.boundingBox())!;
    const vh = page.viewportSize()!.height;
    // In the bottom bar: inside the last 100 pt of the screen, at least 48 pt tall.
    expect(box.y + box.height).toBeGreaterThan(vh - 100);
    expect(box.height).toBeGreaterThanOrEqual(48);
    await shotOn(page, '3.5d', 'pair-next', ['iPhone 15', 'iPhone SE']);
    await next.tap();
    await expect(page.getByTestId('group-next')).toHaveCount(0);
  });
});
