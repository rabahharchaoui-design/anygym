import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

// PLAN D0: G's Nov 19 hand review hides 39 catalog demos (8 wrong demo, 31 fix cues). Each one, opened
// in a workout's exercise screen, shows the honest empty state: no photo anywhere, the equipment tile,
// "Demo coming soon" in its sheet, and its text cues when the catalog has them. An approved one shows
// its photos.

const review = JSON.parse(readFileSync('data/reviews/demo-review-2026-11-19.json', 'utf8')) as { decisions: Record<string, { verdict: string }> };
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { id: string; name: string }[] };
const cueFile = JSON.parse(readFileSync('data/exercise-cues.json', 'utf8')) as { exercises: Record<string, { cues: { text: string }[] }> };
const NAME = new Map(catalog.exercises.map((e) => [e.id, e.name]));
const HIDDEN = Object.keys(review.decisions).filter((id) => review.decisions[id]!.verdict !== 'approved');

/** An open workout holding the given exercises, written straight to the database once the app made its gym. */
async function seedWorkout(page: Page, ids: string[]): Promise<string> {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  return page.evaluate(
    (exerciseIds) =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const read = db.transaction('gyms', 'readonly').objectStore('gyms').getAll();
          read.onsuccess = () => {
            const gym = (read.result as { id: string; isActive: boolean }[]).find((g) => g.isActive)!;
            const id = 'd0-review';
            const tx = db.transaction('sessions', 'readwrite');
            tx.objectStore('sessions').put({ id, gymId: gym.id, startedAt: Date.now(), imported: false, exerciseIds });
            tx.oncomplete = () => {
              db.close();
              resolve(id);
            };
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
    ids,
  );
}

test('every demo G hid shows the honest empty state with its cues in the exercise screen', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one phone: the 39 exercises are the point, not the layout');
  test.setTimeout(240_000);
  expect(HIDDEN.length).toBe(39);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sid = await seedWorkout(page, HIDDEN);
  for (const id of HIDDEN) {
    const name = NAME.get(id)!;
    await page.goto(`./#/workout/${sid}/${encodeURIComponent(id)}`);
    const view = page.getByTestId(`exercise-${id}`);
    await expect(view, id).toBeVisible();
    // No photo of it anywhere on the screen, no hero: the compact header with the equipment tile.
    await expect(view.getByTestId('ex-hero'), id).toHaveCount(0);
    await expect(page.locator('img[alt$="start position"], img[alt$="end position"]'), id).toHaveCount(0);
    // A move with no known loading asks how it is loaded first: closed, the exercise screen stays.
    const ask = page.getByRole('dialog', { name: 'How do you load this?' });
    if (await ask.isVisible()) {
      await ask.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(ask).toHaveCount(0);
    }
    // Its sheet: "Demo coming soon" in place of the photos, and the catalog's own cues when it has them.
    await view.getByTestId('ex-head').getByRole('button', { name: `How to do ${name}` }).tap();
    const sheet = page.getByTestId('exercise-sheet');
    await expect(sheet, id).toBeVisible();
    await expect(sheet.getByTestId('demo-soon'), id).toContainText('Demo coming soon');
    await expect(sheet.locator('img'), id).toHaveCount(0);
    const cues = (cueFile.exercises[id]?.cues ?? []).map((c) => c.text);
    if (cues.length) for (const cue of cues) await expect(sheet.getByTestId('cues'), id).toContainText(cue);
    else await expect(sheet.getByTestId('cues'), id).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('an approved demo shows its photos, a hidden one in the same workout does not', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one phone');
  const sid = await seedWorkout(page, ['Barbell_Squat', 'Barbell_Deadlift', 'Russian_Twist']);
  await page.goto(`./#/workout/${sid}/Barbell_Squat`);
  const squat = page.getByTestId('exercise-Barbell_Squat');
  await expect(squat.getByTestId('ex-hero')).toBeVisible();
  await expect(squat.locator('img[alt$="start position"]')).toHaveJSProperty('complete', true);
  for (const id of ['Barbell_Deadlift', 'Russian_Twist']) {
    await page.goto(`./#/workout/${sid}/${id}`);
    await expect(page.getByTestId(`exercise-${id}`).getByTestId('ex-head')).toBeVisible();
    await expect(page.locator('img[alt$="start position"]')).toHaveCount(0);
  }
});

test('plans are unaffected: a plan row whose demo G hid stays in the workout with the empty state and its cues', async ({ page }) => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one phone');
  // The 8 plan rows that map exactly to a hidden catalog demo; each keeps its match, muscles and cues.
  const rows: Array<[string, string]> = [['deadlift', 'Barbell_Deadlift'], ['romanian-deadlift', 'Romanian_Deadlift'], ['dumbbell-bench-press', 'Dumbbell_Bench_Press'], ['dead-bug', 'Dead_Bug']];
  const sid = await seedWorkout(page, rows.map(([p]) => p));
  await page.goto(`./#/workout/${sid}`);
  for (const [planId] of rows) await expect(page.getByTestId(`row-${planId}`)).toBeVisible();
  for (const [planId, catalogId] of rows) {
    await page.goto(`./#/workout/${sid}/${planId}`);
    const view = page.getByTestId(`exercise-${planId}`);
    await expect(view).toBeVisible();
    await expect(view.getByTestId('ex-hero')).toHaveCount(0);
    await expect(page.locator('img[alt$="start position"]')).toHaveCount(0);
    // The How to card on the page keeps the catalog's cues (a sure match), and the muscle card.
    const tips = view.getByTestId('form-tips');
    for (const cue of cueFile.exercises[catalogId]!.cues.map((c) => c.text)) await expect(tips).toContainText(cue);
    await expect(view.getByTestId('muscle-card')).toBeVisible();
  }
});
