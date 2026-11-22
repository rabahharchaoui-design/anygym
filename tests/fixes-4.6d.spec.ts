import { test, expect } from './fixtures';
import { checkLayout, fullyShown } from './helpers/layout';
import { fix, holdFor, move, startRun, wake } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { dbAll, dbPut } from './workout-helpers';

test.use({ serviceWorkers: 'block', locale: 'en-GB' });
const caption = /A GPS gap of up to 5 minutes at a believable speed adds its straight-line distance to the total, but not to the average pace\. A longer or faster gap adds no distance\./;

test('a dashed gap is explained on the finish and saved run screens', async ({ page, context }) => {
  await stubTiles(page);
  const runner = await startRun(page, context);
  await move(runner, 5);
  await page.clock.runFor(60_000);
  runner.north += 180;
  await fix(runner);
  await move(runner, 3);
  await wake(page);
  await holdFor(page, page.getByTestId('live-end'), 1250);
  const summary = page.getByTestId('run-summary');
  await expect(summary).toHaveAttribute('data-verdict', 'ok');
  const big = page.getByTestId('celebrate-big');
  if (await big.isVisible().catch(() => false)) await page.clock.runFor(3000);
  await expect(big).toHaveCount(0);
  const note = summary.getByText(caption);
  await expect(note).toBeVisible();
  await note.scrollIntoViewIfNeeded();
  expect(await fullyShown(note)).toBe(true);
  await checkLayout(page, { scope: '[data-testid="run-summary"]' });
  await page.getByTestId('summary-done').tap();
  await page.goto('./#/history');
  await page.getByTestId('history-run-row').first().tap();
  const detail = page.getByTestId('run-detail');
  const savedNote = detail.getByText(caption);
  await expect(savedNote).toBeVisible();
  await savedNote.scrollIntoViewIfNeeded();
  expect(await fullyShown(savedNote)).toBe(true);
  await checkLayout(page);
});

test('a continuous run has no dashed caption', async ({ page, context }) => {
  await stubTiles(page);
  const runner = await startRun(page, context);
  await move(runner, 5);
  await wake(page);
  await holdFor(page, page.getByTestId('live-end'), 1250);
  await expect(page.getByTestId('run-summary')).toHaveAttribute('data-verdict', 'ok');
  await expect(page.getByText(caption)).toHaveCount(0);
  const big = page.getByTestId('celebrate-big');
  if (await big.isVisible().catch(() => false)) await page.clock.runFor(3000);
  await expect(big).toHaveCount(0);
  await page.getByTestId('summary-done').tap();
  await page.goto('./#/history');
  await page.getByTestId('history-run-row').first().tap();
  await expect(page.getByTestId('run-detail')).toBeVisible();
  await expect(page.getByText(caption)).toHaveCount(0);
});

test('Today names a muscle supported by yesterday and the next plan day', async ({ page }) => {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);
  await dbPut(page, {
    planState: [{ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [] }],
    sessions: [{ id: 'y', gymId: gym.id, startedAt: yesterday.getTime(), endedAt: yesterday.getTime() + 1000, imported: false }],
    sets: [{ id: 's', sessionId: 'y', exerciseId: 'hip-abductor', order: 0, kind: 'work', reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 }, uncertain: false }],
  });
  await page.reload();
  await expect(page.getByTestId('coach-line')).toContainText('outer hips yesterday');
  // The same glute drawing alone does not turn glutes into outer hips.
  await dbPut(page, { sets: [{ id: 's', sessionId: 'y', exerciseId: 'Barbell_Glute_Bridge', order: 0, kind: 'work', reps: 8, load: { kind: 'bodyweight', unit: 'lb', total: 0 }, uncertain: false }] });
  await page.reload();
  await expect(page.getByTestId('coach-line')).toHaveCount(0);
});
