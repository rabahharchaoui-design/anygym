import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, navIdle, watchErrors } from './workout-helpers';

// PLAN 3.6d (audit A1 BLOCKER): a backup taken on a phone that uses a coach tuned copy of "Your plan"
// restores on a new phone. Before the fix the new phone said "This backup is damaged. Nothing was
// changed." because the plan pointer named the tuned id, which only the old phone knew in memory.
//
// Phone 1 answers the questions (flexible schedule), applies a coach tip to Your plan and uses it,
// backs up. Then everything on the phone is wiped (IndexedDB, localStorage, the app reloaded: a new
// phone), and the file is restored through Settings, the only door a user has.

test.use({ intake: 'fresh' });

type PlanRow = { id: string; source: string };
type StateRow = { id: string; planId: string; pendingDayIndices?: number[]; nextDayIndex: number };

const ANSWERS = {
  goal: 'muscle',
  goals: ['muscle'],
  units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' },
  focus: ['balance'],
  // Answers whose generated plan gets the coach's "freq" tip (checked against the generator). A
  // "never" answer keeps a curated plan from counting as a true match, so Your plan is built.
  never: ['burpee'],
  experience: '1_2y',
  days: 3,
  minutes: 60,
  place: 'full',
  equipmentFor: 'full',
  style: 'mix',
  cardio: 'little',
  scheduleStyle: 'flexible',
};

const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });

async function buildYourPlan(page: Page): Promise<string> {
  await page.goto('./');
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', 'goal');
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'about', answers: a })), ANSWERS);
  await page.reload();
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', 'about');
  await page.getByTestId('skip').tap();
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', 'reveal');
  await navIdle(page);
  await page.getByTestId('reveal-cta').locator('button[data-variant="primary"]').tap();
  await expect(page).toHaveURL(/#\/$/);
  await expect.poll(async () => (await dbAll<PlanRow>(page, 'plans')).filter((p) => p.source === 'generated').length).toBe(1);
  return (await dbAll<PlanRow>(page, 'plans')).find((p) => p.source === 'generated')!.id;
}

async function useTunedCopy(page: Page, planId: string): Promise<StateRow> {
  await page.goto(`./#/plans/${planId}`);
  await page.getByTestId('coach-tips-toggle').tap();
  await page.getByTestId('coach-tips').getByRole('button', { name: /^Apply:/ }).first().tap();
  await expect(page.getByTestId('tuned-copy')).toBeVisible();
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect.poll(async () => (await dbAll<StateRow>(page, 'planState'))[0]?.planId ?? '').toMatch(new RegExp(`^${planId}~`));
  const state = (await dbAll<StateRow>(page, 'planState'))[0]!;
  // Starting a day writes the rotation still to do (db/workoutStart.ts); put it as that does, so the
  // file holds exactly the pointer the audit's phone had, without a workout in progress.
  if (!state.pendingDayIndices) {
    await dbPut(page, { planState: [{ ...state, pendingDayIndices: [1, 2] }] });
    await page.reload();
  }
  return (await dbAll<StateRow>(page, 'planState'))[0]!;
}

async function backUp(page: Page): Promise<string> {
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  await expect(page.getByText('Backup saved')).toBeVisible();
  return download.path();
}

async function becomeNewPhone(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        localStorage.clear();
        const req = indexedDB.deleteDatabase('anygym');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
  );
  await page.goto('about:blank');
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  expect(await dbAll(page, 'plans')).toEqual([]);
}

test('a backup with a coach tuned Your plan in use restores on a new phone, plan and place kept', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await noShare(page);
  const planId = await buildYourPlan(page);
  const state = await useTunedCopy(page, planId);
  expect(state.pendingDayIndices?.length).toBeGreaterThan(0);

  const path = await backUp(page);
  const file = JSON.parse(readFileSync(path, 'utf8')) as { tables: { planState: StateRow[]; coachLifts?: unknown[]; efforts?: unknown[] } };
  expect(file.tables.planState[0]).toEqual(state);
  // A7: the coach's tables travel too (none written yet here, but carried).
  expect(file.tables.coachLifts).toEqual([]);
  expect(file.tables.efforts).toEqual([]);

  await becomeNewPhone(page);
  await page.getByTestId('restore-file').setInputFiles(path);
  await expect(page.getByText('This backup is damaged')).toHaveCount(0);
  const sheet = page.getByRole('dialog', { name: 'Restore backup' });
  await expect(sheet).toBeVisible();
  const replace = page.getByTestId('restore-replace');
  await replace.tap();
  await expect(replace).toHaveAccessibleName(/^Replace Tap again/);
  await replace.tap();
  await expect(page.getByText(/^Restored/)).toBeVisible();

  expect((await dbAll<StateRow>(page, 'planState'))[0]).toEqual(state);
  // The tuned copy is known on the new phone at once: its page shows it, and Today has no load error.
  await page.goto(`./#/plans/${encodeURIComponent(state.planId)}`);
  await expect(page.getByTestId('tuned-copy')).toBeVisible();
  await page.goto('./');
  await expect(page.getByText(/could not be loaded|couldn't read/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});
