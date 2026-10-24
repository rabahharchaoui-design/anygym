import { expect, test, type Locator, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';

// Written against the built PLAN 1.6/1.7/1.10c controls. Do not run beside the port owner's suite.
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone WebKit coverage');
});

async function dbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const connection = req.result;
      const tx = connection.transaction(name, 'readonly');
      const read = tx.objectStore(name).getAll();
      tx.oncomplete = () => { connection.close(); resolve(read.result as T[]); };
      tx.onabort = () => { connection.close(); reject(tx.error); };
    };
  }), store);
}

const logButton = (page: Page) => page.getByTestId('action-bar').getByRole('button').first();

async function addExercise(page: Page, query: string, name: string) {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}

async function fitsWithoutScrolling(page: Page, controls: Locator[]) {
  // Assert before tapping: actionability's auto-scroll could otherwise conceal the defect.
  await expect.poll(() => page.getByRole('main').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  expect(await page.getByRole('main').evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  for (const control of controls) {
    await expect(control).toBeInViewport({ ratio: 1 });
    // Also detect coverage by the action bar/rest dock and clipping by scroll containers.
    expect(await control.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [[0.1, 0.1], [0.9, 0.1], [0.5, 0.5], [0.1, 0.9], [0.9, 0.9]].every(([x, y]) => {
        const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
        return hit !== null && (hit === el || el.contains(hit));
      });
    })).toBe(true);
  }
}

test('SE: a stack with added weight keeps reps, pin and Log set reachable before and during rest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });
  try {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await addExercise(page, 'leg press', 'Leg Press');
    await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Machine with a pin/ }).tap();
    const card = page.getByTestId('exercise-leg-press');
    const pin = card.getByRole('radio', { name: 'Pin at 15 lb', exact: true });
    await pin.tap();
    await card.getByRole('button', { name: 'Add weight', exact: true }).tap();
    const added = card.getByRole('group', { name: 'Added weight on the pin', exact: true });
    await added.getByRole('button', { name: '2', exact: true }).tap();
    await added.getByRole('button', { name: 'Decimal point', exact: true }).tap();
    await added.getByRole('button', { name: '5', exact: true }).tap();
    await expect(logButton(page)).toHaveText('Log set · 10 × 17.5 lb');
    const controls = [card.getByRole('heading', { name: 'Leg Press' }), card.getByTestId('set-target'), card.getByTestId('stack-total'), pin, card.getByRole('button', { name: 'Fewer reps' }), card.getByRole('button', { name: 'More reps' }), logButton(page)];
    await fitsWithoutScrolling(page, controls);
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await fitsWithoutScrolling(page, [...controls, card.getByTestId('set-row')]);
    expect((await dbAll<WorkoutSet>(page, 'sets'))[0]!.load).toEqual({ kind: 'stack', unit: 'lb', total: 17.5, stackValue: 15, added: 2.5 });
  } finally {
    expect(errors).toEqual([]);
  }
});

test('SE: timed set controls stay unobscured when the next hold starts during rest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });
  try {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await addExercise(page, 'plank', 'Plank');
    const card = page.getByTestId('exercise-plank');
    const target = card.getByTestId('set-target');
    const heading = card.getByRole('heading', { name: 'Plank', exact: true });
    await fitsWithoutScrolling(page, [heading, target, card.getByRole('button', { name: 'Start timer', exact: true }), logButton(page)]);
    await card.getByRole('button', { name: 'Start timer', exact: true }).tap();
    await expect(logButton(page)).toBeEnabled();
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await expect(logButton(page)).toBeDisabled();
    await fitsWithoutScrolling(page, [heading, target, card.getByRole('button', { name: 'Start timer', exact: true }), card.getByTestId('set-row'), logButton(page)]);
    await card.getByRole('button', { name: 'Start timer', exact: true }).tap();
    await expect(logButton(page)).toBeEnabled();
    await fitsWithoutScrolling(page, [heading, target, card.getByRole('button', { name: 'Stop timer', exact: true }), card.getByTestId('set-row'), logButton(page)]);
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    const saved = await dbAll<WorkoutSet>(page, 'sets');
    expect(new Set(saved.map((s) => s.id)).size).toBe(2);
    for (const set of saved) {
      expect(set.seconds).toBeGreaterThan(0);
      expect(set.reps).toBeUndefined();
      expect(set.load).toEqual({ kind: 'timed', unit: 'lb', total: 0 });
    }
  } finally {
    expect(errors).toEqual([]);
  }
});

test('offline reload keeps plates and reps on an unknown EZ bar until its weight is answered', async ({ page, context }) => {
  const errors = watchErrors(page);
  try {
    await page.goto('./');
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await expect(page).toHaveURL(/#\/workout\//);
    // As in fixes-1.10c.spec.ts: EZ curl is not in the temporary plan exercise picker yet.
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('anygym');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const connection = req.result;
        const tx = connection.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        const read = store.getAll();
        read.onsuccess = () => {
          const session = (read.result as Session[]).find((s) => s.endedAt === undefined)!;
          store.put({ ...session, exerciseIds: ['ez-bar-curl'] });
        };
        tx.oncomplete = () => { connection.close(); resolve(); };
        tx.onabort = () => { connection.close(); reject(tx.error); };
      };
    }));
    await page.reload();
    const card = page.getByTestId('exercise-ez-bar-curl');
    await card.getByRole('button', { name: 'How do you load this?' }).tap();
    await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Plates on a bar/ }).tap();
    await context.setOffline(true);
    await card.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
    await card.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
    await card.getByRole('button', { name: 'More reps' }).tap();
    await expect(card.getByTestId('plate-total')).toContainText('+ bar');
    await expect(logButton(page)).toBeDisabled();
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual([]);
    await page.reload();
    await expect(card.getByTestId('plate-total')).toContainText('+ bar');
    await expect(card.getByTestId('stepper-reps')).toHaveText('11');
    await expect(logButton(page)).toHaveText('Set the bar weight first');
    await expect(logButton(page)).toBeDisabled();
    await card.getByRole('button', { name: 'Set bar weight', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'EZ curl bar', exact: true });
    for (const digit of '25') await sheet.getByRole('button', { name: digit, exact: true }).tap();
    await sheet.getByRole('button', { name: 'Save bar weight', exact: true }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(card.getByTestId('plate-total')).toHaveText('55lb');
    await expect(logButton(page)).toHaveText('Log set · 11 × 55 lb');
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    const saved = await dbAll<WorkoutSet>(page, 'sets');
    expect(saved[0]).toMatchObject({ reps: 11, load: { kind: 'barbell', unit: 'lb', total: 55, barWeight: 25, perSide: [10, 5] } });
    await page.reload();
    await expect(card.getByTestId('plate-total')).toHaveText('55lb');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(saved);
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});
