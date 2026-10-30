import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { allowConsoleErrors, expect, test } from './fixtures';
import { corsHeaders } from '../workers/anygym-api/src/http';

// PLAN 2.0c group 6 (acceptance F): a real cross-origin browser fetch (another localhost port, the
// Worker's own CORS headers) can read Retry-After on a 429. A Response built in JavaScript skips
// CORS filtering, so only a browser request proves it. Without the expose header it reads null.

let server: Server;
let port = 0;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const origin = String(req.headers.origin ?? '');
    const headers: Record<string, string> = { ...corsHeaders(origin) };
    // The control path drops the expose header, like the Worker before 2.0c.
    if (req.url?.startsWith('/old/')) delete headers['Access-Control-Expose-Headers'];
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }
    req.resume();
    req.on('end', () => {
      res.writeHead(429, { ...headers, 'Content-Type': 'application/json', 'Retry-After': '120' });
      res.end('{"error":"rate"}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('acceptance F: the browser reads Retry-After: 120 from the Worker headers on another origin @matrix', async ({ page }) => {
  // The browser logs every 429 it receives; here the 429 is the point of the test.
  allowConsoleErrors(/status of 429/);
  await page.goto('./');
  const read = (path: string) =>
    page.evaluate(async (url) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: '{}', credentials: 'omit' });
      return { status: res.status, retryAfter: res.headers.get('Retry-After') };
    }, `http://127.0.0.1:${port}${path}`);
  expect(await read('/crash')).toEqual({ status: 429, retryAfter: '120' });
  // The same answer without the expose header: hidden from the app (the bug).
  expect(await read('/old/crash')).toEqual({ status: 429, retryAfter: null });
});
