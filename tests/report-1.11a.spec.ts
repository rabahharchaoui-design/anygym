import sharp from 'sharp';
import { allowConsoleErrors, expect, test, type Page } from './fixtures';
import { mockReportApi } from './helpers/reportApi';
import { bar185, checkCurrent, exerciseView, loggedRows, quickWith, seedFinished } from './workout-helpers';
import { checkLayout, simulateSafeAreas } from './helpers/layout';

// PLAN 1.11a (SPEC 24): Settings → Help → Report a problem, crash reports with the Privacy toggle,
// and the app error screen. The Worker is always a local mock here (tests/fixtures.ts).

const SENT = 'Sent. Thanks, this goes straight to the builder.';
const DISCLOSURE =
  'Sends what you write, your screenshot if you add one, the app version, the screen you were on, your phone model, iOS version and screen size, lb or kg, your gym type and the last 20 app errors. Never your workouts, names or anything personal.';

async function openReport(page: Page) {
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.getByRole('button', { name: /Report a problem/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Report a problem' });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Throws an uncaught error in the page, as app code would. */
const throwInPage = (page: Page, message: string) =>
  page.evaluate((m) => {
    window.setTimeout(() => {
      throw new Error(m);
    });
  }, message);

test.describe('Report a problem', () => {
  test('Settings → Help → Report a problem → Send: only the listed fields leave the phone @matrix', async ({ page, context }) => {
    const sent = await mockReportApi(context);
    await simulateSafeAreas(page);
    const sheet = await openReport(page);
    await expect(sheet.getByText('What went wrong?')).toBeVisible();
    await expect(sheet.getByTestId('report-disclosure')).toHaveText(DISCLOSURE);
    await expect(sheet.getByRole('button', { name: 'Add a screenshot' })).toBeVisible();
    await checkLayout(page, { scope: '[role="dialog"]' });

    await sheet.getByTestId('report-text').fill('The rest timer stopped when I locked the phone');
    await sheet.getByTestId('report-send').tap();
    await expect(sheet.getByText(SENT, { exact: true })).toBeVisible();

    expect(sent).toHaveLength(1);
    const { path, body } = sent[0]!;
    expect(path).toBe('/feedback');
    expect(Object.keys(body).sort()).toEqual(['appVersion', 'device', 'errors', 'gymType', 'message', 'requestId', 'route', 'unit']);
    expect(body.message).toBe('The rest timer stopped when I locked the phone');
    expect(body.route).toBe('/');
    expect(body.appVersion).toMatch(/^\d+\.\d+\.\d+\+(dev|[0-9a-f]{4,12})$/);
    expect(body.unit).toMatch(/^(lb|kg)$/);
    expect(typeof body.gymType).toBe('string');
    expect(Array.isArray(body.errors)).toBe(true);
    const device = body.device as Record<string, unknown>;
    expect(Object.keys(device).sort()).toEqual(['dpr', 'model', 'os', 'standalone', 'viewport']);
    const vp = page.viewportSize()!;
    expect(device.viewport).toBe(`${vp.width}x${vp.height}`);

    // Done closes it; a second Send never happens.
    await sheet.getByRole('button', { name: 'Done' }).tap();
    await expect(page.getByRole('dialog', { name: 'Report a problem' })).toHaveCount(0);
    expect(sent).toHaveLength(1);
  });

  test('empty text: says what to do, sends nothing', async ({ page, context }) => {
    const sent = await mockReportApi(context);
    const sheet = await openReport(page);
    await sheet.getByTestId('report-send').tap();
    await expect(sheet.getByTestId('report-error')).toHaveText('Write what went wrong first.');
    expect(sent).toHaveLength(0);
  });

  test('a screenshot is shrunk on the phone to a JPEG at most 900 px wide, can be removed, and is sent', async ({ page, context }) => {
    const sent = await mockReportApi(context);
    const png = await sharp({ create: { width: 1290, height: 2796, channels: 3, background: { r: 30, g: 200, b: 90 } } }).png().toBuffer();
    const sheet = await openReport(page);
    await sheet.getByTestId('report-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: png });
    await expect(sheet.getByRole('img', { name: 'Your screenshot' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Remove screenshot' }).tap();
    await expect(sheet.getByRole('img', { name: 'Your screenshot' })).toHaveCount(0);
    await sheet.getByTestId('report-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: png });
    await expect(sheet.getByRole('img', { name: 'Your screenshot' })).toBeVisible();
    await sheet.getByTestId('report-text').fill('Look at the plates');
    await sheet.getByTestId('report-send').tap();
    await expect(sheet.getByText(SENT, { exact: true })).toBeVisible();
    const shot = Buffer.from(String(sent[0]!.body.screenshot), 'base64');
    expect(shot.length).toBeLessThan(300_000);
    const meta = await sharp(shot).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(900);
  });

  test('offline: saved on the phone in plain words, sent once when back online', async ({ page, context }) => {
    const sent = await mockReportApi(context);
    const sheet = await openReport(page);
    await context.setOffline(true);
    await sheet.getByTestId('report-text').fill('No signal in the basement');
    await sheet.getByTestId('report-send').tap();
    await expect(sheet.getByTestId('report-done')).toContainText('saved on this phone and sends by itself when you are back online');
    expect(sent).toHaveLength(0);
    await context.setOffline(false);
    await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
    expect(sent[0]!.body.message).toBe('No signal in the basement');
    await page.waitForTimeout(1500);
    expect(sent).toHaveLength(1);
  });

  test('three clicks on Send in one task deliver one report', async ({ page, context }) => {
    const sent = await mockReportApi(context);
    const sheet = await openReport(page);
    await sheet.getByTestId('report-text').fill('triple');
    await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>('[data-testid="report-send"]')!;
      b.click();
      b.click();
      b.click();
    });
    await expect(sheet.getByText(SENT, { exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(sent).toHaveLength(1);
  });

  test('a screenshot still being prepared when the sheet closes never lands in the next report', async ({ page, context }) => {
    const sent = await mockReportApi(context);
    await page.addInitScript(() => {
      const w = window as unknown as { __release: () => void; __live: Set<string> };
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      w.__release = release;
      const decode = window.createImageBitmap.bind(window);
      window.createImageBitmap = (async (...a: Parameters<typeof decode>) => {
        await gate;
        return decode(...a);
      }) as typeof window.createImageBitmap;
      w.__live = new Set();
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (o: Blob | MediaSource) => {
        const u = create(o);
        w.__live.add(u);
        return u;
      };
      URL.revokeObjectURL = (u: string) => {
        w.__live.delete(u);
        revoke(u);
      };
    });
    const png = await sharp({ create: { width: 400, height: 800, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
    let sheet = await openReport(page);
    await sheet.getByTestId('report-file').setInputFiles({ name: 'old.png', mimeType: 'image/png', buffer: png });
    await expect(sheet.getByRole('img', { name: 'Preparing the screenshot' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Report a problem' })).toHaveCount(0);
    await page.getByRole('button', { name: /Report a problem/ }).tap();
    sheet = page.getByRole('dialog', { name: 'Report a problem' });
    await expect(sheet).toBeVisible();
    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    await page.waitForTimeout(800);
    await expect(sheet.getByRole('img', { name: 'Your screenshot' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Add a screenshot' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __live: Set<string> }).__live.size)).toBe(0);
    await sheet.getByTestId('report-text').fill('no picture');
    await sheet.getByTestId('report-send').tap();
    await expect(sheet.getByText(SENT, { exact: true })).toBeVisible();
    expect(sent[0]!.body.screenshot).toBeUndefined();
  });

  test('nothing about reporting on Today or in the workout', async ({ page }) => {
    await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
    await expect(page.getByText(/Report a problem/)).toHaveCount(0);
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Report a problem|crash report/i)).toHaveCount(0);
  });
});

test.describe('crash reports', () => {
  test('an uncaught error sends one tiny report; the same one again today sends nothing', async ({ page, context }) => {
    allowConsoleErrors(/Test crash one/);
    const sent = await mockReportApi(context);
    await page.goto('./#/history');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await throwInPage(page, 'Test crash one');
    await expect.poll(() => sent.length).toBe(1);
    const { path, body } = sent[0]!;
    expect(path).toBe('/crash');
    expect(Object.keys(body).sort()).toEqual(['appVersion', 'device', 'message', 'requestId', 'route', 'signature', 'stack']);
    // PLAN 1.7k: never the error's own words, only its code, fixed text and our script location.
    expect(body.message).toBe('Error: details hidden');
    expect(JSON.stringify(body)).not.toContain('Test crash one');
    expect(body.route).toBe('/history');
    await throwInPage(page, 'Test crash one');
    await page.reload();
    await throwInPage(page, 'Test crash one');
    await page.waitForTimeout(2000);
    expect(sent).toHaveLength(1);
  });

  test('Send crash reports is on by default; off (kept after reload) sends nothing', async ({ page, context }) => {
    allowConsoleErrors(/Test crash two/);
    const sent = await mockReportApi(context);
    await page.goto('./#/settings');
    const toggle = page.getByRole('switch', { name: /Send crash reports/ });
    await expect(toggle).toBeChecked();
    await toggle.locator('xpath=ancestor::label').tap();
    // The switch moves once the choice is saved, so a reload right away shows the same.
    await expect(toggle).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole('switch', { name: /Send crash reports/ })).not.toBeChecked();
    await throwInPage(page, 'Test crash two');
    await page.waitForTimeout(2000);
    expect(sent).toHaveLength(0);
  });

  test('the error screen uses plain words, reports the crash and keeps the workout', async ({ page, context }) => {
    allowConsoleErrors(/Crash probe/);
    const sent = await mockReportApi(context);
    await page.addInitScript(() => localStorage.setItem('anygym-dev', '1'));
    await page.goto('./');
    await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
    await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
    const view = exerciseView(page, 'barbell-incline-bench-press');
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const url = page.url();

    await page.evaluate(() => window.dispatchEvent(new Event('anygym:crash-probe')));
    const screen = page.getByTestId('app-error');
    await expect(screen).toBeVisible();
    await expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    await expect(screen).toContainText('Your workout is saved. Reload to pick up where you left off.');
    await expect.poll(() => sent.filter((s) => s.path === '/crash').length).toBe(1);
    expect(sent[0]!.body.message).toMatch(/^Error: details hidden at [\w.-]+\.js:\d+:\d+$/);
    expect(JSON.stringify(sent[0]!.body)).not.toContain('Crash probe');
    expect(sent[0]!.body.route).toBe('/workout/:id/:exercise');
    expect(JSON.stringify(sent[0]!.body)).not.toContain(url.split('/workout/')[1]!.split('/')[0]!);

    await screen.getByRole('button', { name: 'Reload' }).tap();
    await expect(page).toHaveURL(url);
    await expect(loggedRows(exerciseView(page, 'barbell-incline-bench-press'))).toHaveCount(1);
  });
});
