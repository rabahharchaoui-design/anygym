import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { checkLayout } from './helpers/layout';
import { holdFor, move, startRun } from './helpers/run';
import { stubTiles } from './helpers/tiles';

// PLAN 4.6 (SPEC 12.9, 12.12): the finish screen, the run in History, its detail, the records list
// and heatmap, the share card and the GPX export. One synthetic run (a fast second kilometer, so
// there is a best split), stepped like verify-4.3.

test.use({ serviceWorkers: 'block', locale: 'en-GB', acceptDownloads: true });

const SHOTS = process.env.SHOTS_46 ?? '/tmp/w46-shots';
const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

/** A 2.1 km run: the first km at 3 m/s, the rest at 4 m/s. Ends on the summary, the big moment skipped. */
async function runIt(page: Page, context: Parameters<typeof startRun>[1]) {
  await stubTiles(page);
  const r = await startRun(page, context);
  await move(r, 67);
  await move(r, 55, 5, 4);
  await holdFor(page, page.getByTestId('live-end'), 1250);
  await expect(page.getByTestId('run-summary')).toHaveAttribute('data-verdict', 'ok');
  const big = page.getByTestId('celebrate-big');
  if (await big.isVisible().catch(() => false)) await page.clock.runFor(3000);
  await expect(big).toHaveCount(0, { timeout: 10_000 });
  return r;
}

test.describe('4.6 finish, history, share, GPX', () => {
  test('finish screen: saved check, best split, new records, share card, GPX @matrix', async ({ page, context }) => {
    await runIt(page, context);
    const summary = page.getByTestId('run-summary');
    await expect(page.getByTestId('summary-saved')).toHaveText('Run saved');
    // Saved before the numbers: it sits above the distance.
    const [a, b] = await Promise.all([page.getByTestId('summary-saved').boundingBox(), page.getByTestId('summary-distance').boundingBox()]);
    expect(a!.y).toBeLessThan(b!.y);
    // Two timed splits: the faster one (Km 2) is the one marked Best.
    const splits = page.getByTestId('summary-splits').locator('li');
    await expect(splits).toHaveCount(2);
    await expect(splits.nth(1)).toContainText('Best');
    await expect(splits.nth(0)).not.toContainText('Best');
    // A first run holds the records it could cover: the longest run (and no mile or 5 km it never ran).
    await expect(summary).toContainText('Longest run');
    await expect(summary).not.toContainText('Fastest 5 km');
    await expect(summary).toContainText('Fastest mile');
    await shot(page, 'finish');
    await checkLayout(page, { scope: '[data-testid="run-summary"]' });

    // GPX: a real file, well formed, one track.
    const gpxDownload = page.waitForEvent('download');
    await page.getByTestId('run-export-gpx').tap();
    const gpx = await gpxDownload;
    expect(gpx.suggestedFilename()).toMatch(/^AnyGym-run-\d{4}-\d{2}-\d{2}\.gpx$/);
    const text = readFileSync((await gpx.path())!, 'utf8');
    expect(text.startsWith('<?xml')).toBe(true);
    expect(text).toContain('<gpx version="1.1"');
    expect((text.match(/<trkpt /g) ?? []).length).toBeGreaterThan(100);
    expect(text).not.toContain('<ele>');

    // Share card: a sheet with the card, privacy on by default; the file is a PNG.
    await page.getByTestId('run-share-card').tap();
    await expect(page.getByTestId('run-share-sheet')).toBeVisible();
    await expect(page.getByRole('switch', { name: /Hide start and end/ })).toBeChecked();
    await expect(page.getByTestId('run-share-go')).toBeEnabled();
    await shot(page, 'share');
    const pngDownload = page.waitForEvent('download');
    await page.getByTestId('run-share-go').tap();
    const png = readFileSync((await (await pngDownload).path())!);
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.length).toBeGreaterThan(5_000);

    await page.keyboard.press('Escape');
    await page.getByTestId('summary-done').tap();
    await expect(page.getByTestId('run-summary')).toBeHidden();
  });

  test('History lists the run, its detail, the records and the heatmap @matrix', async ({ page, context }) => {
    await runIt(page, context);
    await page.getByTestId('summary-done').tap();
    await page.goto('./#/history');
    const row = page.getByTestId('history-run-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(/2\.\d\d km · \d+:\d\d/);
    await shot(page, 'history');
    await checkLayout(page);

    await row.tap();
    await expect(page.getByTestId('run-detail')).toBeVisible();
    await expect(page.getByTestId('detail-distance')).toContainText('km');
    await expect(page.getByTestId('summary-splits').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('detail-records')).toContainText('Longest run');
    await expect(page.getByTestId('run-share-card')).toBeVisible();
    await expect(page.getByTestId('run-export-gpx')).toBeVisible();
    await shot(page, 'detail');
    await checkLayout(page);

    await page.goto('./#/history/runs');
    const records = page.getByTestId('run-record');
    await expect(records).toHaveCount(5);
    await expect(records.filter({ hasText: 'Fastest 10 km' })).toContainText('Not yet');
    await expect(records.filter({ hasText: 'Longest run' })).toContainText(/2\.\d\d km/);
    await shot(page, 'records');
    await page.getByRole('radio', { name: 'Heatmap' }).tap();
    await expect(page.getByTestId('run-heatmap')).toBeVisible();
    await expect(page.getByTestId('heatmap')).toHaveAttribute('data-solid', '1');
    await shot(page, 'heatmap');
    await checkLayout(page);
  });

  test('History with no runs shows no run row and no records link @matrix', async ({ page }) => {
    await page.goto('./#/history');
    await expect(page.getByTestId('history-run-row')).toHaveCount(0);
    await expect(page.getByTestId('history-runs-link')).toHaveCount(0);
  });
});
