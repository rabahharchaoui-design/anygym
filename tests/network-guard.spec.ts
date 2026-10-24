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
