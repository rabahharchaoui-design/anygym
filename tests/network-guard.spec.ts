import { expect, test } from './fixtures';

// PLAN 1.10a: tapping the music buttons in a test must never reach the network or open an app.
test('music buttons stay real links but never leave the machine in tests', async ({ page, context }) => {
  const external: string[] = [];
  context.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') external.push(r.url());
  });
  const finished: string[] = [];
  context.on('requestfinished', (r) => finished.push(r.url()));

  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
  // PLAN 1.7c: the empty quick workout opens the exercise picker first; the music links sit in the day list.
  await page.getByRole('dialog', { name: 'Add exercise' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Add exercise' })).toHaveCount(0);

  const spotify = page.getByRole('link', { name: 'Open Spotify' });
  const music = page.getByRole('link', { name: 'Open Apple Music' });
  await expect(spotify).toHaveAttribute('href', 'https://open.spotify.com/');
  await expect(music).toHaveAttribute('href', 'https://music.apple.com/');

  await spotify.tap();
  await music.tap();
  await page.waitForTimeout(500);

  expect(await page.evaluate(() => (window as unknown as { __blockedNav: string[] }).__blockedNav)).toEqual([
    'https://open.spotify.com/',
    'https://music.apple.com/',
  ]);
  expect(context.pages()).toHaveLength(1);
  expect(page.url()).toMatch(/localhost:\d+\/anygym\/#\/workout\//);
  expect(finished.filter((u) => /music\.apple\.com|spotify\.com/.test(u))).toEqual([]);
  // Nothing external was even attempted by the app.
  expect(external).toEqual([]);
});

test('a direct external request is aborted by the route guard', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(() =>
    fetch('https://music.apple.com/', { mode: 'no-cors' }).then(
      () => 'reached',
      () => 'blocked',
    ),
  );
  expect(result).toBe('blocked');
});

test('the report API (SPEC 24) is answered by the guard mock and never reached', async ({ page }) => {
  await page.goto('./');
  const status = await page.evaluate(() =>
    fetch('https://anygym-api.rabahharchaoui.workers.dev/crash', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } }).then((r) => r.status),
  );
  // The real Worker refuses '{}' (400) and any origin but the live site (403): 201 is the mock.
  expect(status).toBe(201);
  const res = await page.evaluate(() => fetch('https://anygym-api.rabahharchaoui.workers.dev/feedback', { method: 'POST', body: 'x' }).then((r) => r.text()));
  expect(res).toBe('{"ok":true,"id":1}');
});

test('the report API stays mocked when the service worker controls the page', async ({ page }) => {
  // WebKit sends fetches of a page controlled by a service worker past context.route: the guard's
  // in-page layer must still answer them.
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const status = await page.evaluate(() =>
    fetch('https://anygym-api.rabahharchaoui.workers.dev/crash', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).then((r) => r.status, (e) => String(e)),
  );
  expect(status).toBe(201);
});
