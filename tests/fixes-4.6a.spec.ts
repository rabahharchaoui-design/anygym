import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, watchErrors } from './workout-helpers';

// PLAN 4.6a: review fixes for 4.6 and 4.4b that show on screen. Each test failed before its fix.

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

const DAY = 86_400_000;
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;

/** A finished run going north from a park, `meters` long, at 3 m/s with a position every 5 s. */
function runRow(id: string, meters: number, startedAt: number) {
  const steps = Math.max(1, Math.round(meters / 15));
  const points = Array.from({ length: steps + 1 }, (_, i) => [40.7812 + (i * (meters / steps)) / M_PER_DEG, -73.9665, startedAt + i * 5000, 5]);
  const movingSec = steps * 5;
  return { id, startedAt, endedAt: startedAt + movingSec * 1000, type: 'free', movingSec, elapsedSec: movingSec, distanceM: meters, points, gaps: [], splits: [], splitUnit: 'km', timedM: meters };
}

/** Opens the app once (it makes its database), then writes the runs. */
async function seedRuns(page: Page, runs: unknown[]) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  await dbPut(page, { runs });
}

test.describe('4.6a review fixes on screen', () => {
  test('(1) a kept run under 50 m says it was too short, not that there was no GPS', async ({ page }) => {
    const errors = watchErrors(page);
    await seedRuns(page, [runRow('short-run', 30, Date.now() - DAY)]);
    await page.goto('./#/history/run/short-run');
    const plain = page.getByTestId('run-detail-plain');
    await expect(plain).toHaveText('Under 50 m was recorded. That is too little for an honest distance or pace.');
    await expect(plain).not.toContainText('no GPS');
    expect(errors).toEqual([]);
  });
});
