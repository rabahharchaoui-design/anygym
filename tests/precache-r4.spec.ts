import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// PLAN R4 (4): the badge pictures (about 6 MB) and the stamp pictures wait for their screens (M18c,
// M18d, M19f cache their own art); the offline precache leaves them out, so a first visit stays light.
test('R4 no badge or stamp picture is in the service worker precache', async () => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one phone is enough: it reads the build');
  const dist = process.env.PW_DIST ?? 'dist';
  const sw = readFileSync(`${dist}/sw.js`, 'utf8');
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] ?? "");
  expect(urls.length).toBeGreaterThan(20);
  expect(urls.filter((u) => /(^|\/)(badges|stamps)\//.test(u))).toEqual([]);
  // The app shell is still there.
  expect(urls).toContain('index.html');
});
