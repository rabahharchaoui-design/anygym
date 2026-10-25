import { beforeEach, describe, expect, it } from 'vitest';
import { handleCron, handleRequest } from '../handlers';
import type { Deps, Env } from '../env';
import { FakeD1 } from './fakeD1';

const ORIGIN = 'https://rabahharchaoui-design.github.io';
const BASE = 'https://anygym-api.example.workers.dev';
const device = { model: 'iPhone', os: 'iOS 18.2', viewport: '393x852', dpr: 3, standalone: true };

let seq = 0;
const rid = () => `req-${String(++seq).padStart(6, '0')}`;
const feedback = (over: Record<string, unknown> = {}) => ({
  requestId: rid(),
  message: 'The plate picker froze\nsecond line',
  appVersion: '0.1.0+abc1234',
  route: '/workout/:id',
  device,
  unit: 'lb',
  gymType: 'full',
  errors: ['TypeError: x is undefined'],
  ...over,
});
const crash = (over: Record<string, unknown> = {}) => ({
  requestId: rid(),
  signature: 'TypeError: x is undefined @ index-abc.js:1:200',
  message: 'TypeError: x is undefined',
  stack: 'at f (index-abc.js:1:200)',
  route: '/',
  appVersion: '0.1.0+abc1234',
  device,
  ...over,
});

let db: FakeD1;
let env: Env;
let pushes: Array<{ url: string; title: string; body: string }>;
let pending: Promise<unknown>[];
let clock: Date;
let ntfyOk: boolean;

const deps = (): Deps => ({
  now: () => clock,
  fetch: (async (url: string, init: RequestInit) => {
    pushes.push({ url, title: (init.headers as Record<string, string>).Title!, body: String(init.body) });
    return new Response('', { status: ntfyOk ? 200 : 500 });
  }) as unknown as typeof fetch,
  waitUntil: (p) => void pending.push(p),
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}, e: Env = env) {
  const req = new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'text/plain;charset=UTF-8', 'CF-Connecting-IP': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await handleRequest(req, e, deps());
  await Promise.all(pending.splice(0));
  return res;
}

beforeEach(() => {
  db = new FakeD1();
  env = { DB: db, NTFY_TOPIC: 'test-topic', ENVIRONMENT: 'production' };
  pushes = [];
  pending = [];
  clock = new Date('2026-10-25T14:10:00Z');
  ntfyOk = true;
});

describe('origin and CORS', () => {
  it('accepts the production origin and answers with its CORS header', async () => {
    const res = await post('/feedback', feedback());
    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('rejects other origins and a missing origin, with no CORS header', async () => {
    for (const o of ['https://evil.example', 'http://localhost:4173', '']) {
      const res = await post('/feedback', feedback(), { Origin: o });
      expect(res.status).toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(db.rows('SELECT * FROM reports')).toHaveLength(0);
  });

  it('production ignores DEV_ORIGINS; a dev environment honors it', async () => {
    const local = { Origin: 'http://localhost:4174' };
    expect((await post('/feedback', feedback(), local, { ...env, DEV_ORIGINS: 'http://localhost:4174' })).status).toBe(403);
    expect((await post('/feedback', feedback(), local, { ...env, ENVIRONMENT: 'dev', DEV_ORIGINS: 'http://localhost:4173,http://localhost:4174' })).status).toBe(201);
    expect((await post('/feedback', feedback(), { Origin: 'http://localhost:5000' }, { ...env, ENVIRONMENT: 'dev', DEV_ORIGINS: 'http://localhost:4174' })).status).toBe(403);
  });

  it('answers the preflight, refuses other methods and unknown paths', async () => {
    const opt = await handleRequest(new Request(`${BASE}/crash`, { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env, deps());
    expect(opt.status).toBe(204);
    expect(opt.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    const get = await handleRequest(new Request(`${BASE}/crash`, { headers: { Origin: ORIGIN } }), env, deps());
    expect(get.status).toBe(405);
    expect((await post('/nope', feedback())).status).toBe(404);
  });
});

describe('validation', () => {
  it('stores a valid feedback row as open with only allowlisted fields', async () => {
    const res = await post('/feedback', { ...feedback({ screenshot: 'QUJD' }), email: 'someone@example.com', history: [1, 2] });
    expect(res.status).toBe(201);
    const [row] = db.rows('SELECT * FROM reports');
    expect(row).toMatchObject({ kind: 'feedback', status: 'open', seen_count: 1, route: '/workout/:id', app_version: '0.1.0+abc1234', screenshot_b64: 'QUJD' });
    expect(row!.device).toBe('iPhone · iOS 18.2 · 393x852 @3x · home screen');
    expect(JSON.parse(String(row!.context_json))).toEqual({ unit: 'lb', gymType: 'full', errors: ['TypeError: x is undefined'], device });
    expect(JSON.stringify(row)).not.toContain('someone@example.com');
  });

  it.each([
    ['empty message', { message: '   ' }],
    ['huge message', { message: 'x'.repeat(4001) }],
    ['bad request id', { requestId: 'a b' }],
    ['bad route', { route: 'workout' }],
    ['bad unit', { unit: 'stone' }],
    ['too many errors', { errors: Array.from({ length: 21 }, () => 'e') }],
    ['bad device', { device: { ...device, dpr: 'x' } }],
    ['bad screenshot', { screenshot: 'not base64!' }],
  ])('rejects %s', async (_name, over) => {
    expect((await post('/feedback', feedback(over))).status).toBe(400);
  });

  it('rejects bad JSON and crash bodies missing fields', async () => {
    expect((await post('/feedback', '{nope')).status).toBe(400);
    expect((await post('/crash', crash({ signature: '' }))).status).toBe(400);
    expect((await post('/crash', crash({ stack: 5 }))).status).toBe(400);
    expect(db.rows('SELECT * FROM reports')).toHaveLength(0);
  });

  it('rejects bodies over 1 MB, declared or streamed', async () => {
    const big = JSON.stringify(feedback({ message: 'x'.repeat(1_000_001) }));
    expect((await post('/feedback', big)).status).toBe(413);
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < 11; i++) c.enqueue(new Uint8Array(100_000));
        c.close();
      },
    });
    const req = new Request(`${BASE}/feedback`, { method: 'POST', headers: { Origin: ORIGIN }, body: stream, duplex: 'half' } as RequestInit);
    expect((await handleRequest(req, env, deps())).status).toBe(413);
  });
});

describe('rate limit', () => {
  it('allows 20 requests per hashed IP per hour, then 429 with Retry-After; other IPs and the next hour are fine', async () => {
    for (let i = 0; i < 20; i++) expect((await post('/crash', crash({ signature: `s${i}` }))).status).toBe(201);
    const blocked = await post('/crash', crash({ signature: 'over' }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBe(50 * 60);
    expect((await post('/crash', crash({ signature: 'other-ip' }), { 'CF-Connecting-IP': '198.51.100.1' })).status).toBe(201);
    clock = new Date('2026-10-25T15:00:01Z');
    expect((await post('/crash', crash({ signature: 'next-hour' }))).status).toBe(201);
    // The raw IP is never stored.
    expect(JSON.stringify(db.rows('SELECT * FROM rate'))).not.toContain('203.0.113.7');
  });
});

describe('idempotency', () => {
  it('replaying a known request id still counts against the hourly limit', async () => {
    const body = feedback();
    expect((await post('/feedback', body)).status).toBe(201);
    for (let i = 0; i < 19; i++) expect((await post('/feedback', body)).status).toBe(200);
    expect((await post('/feedback', body)).status).toBe(429);
  });

  it('a repeated request id returns the same row and adds nothing', async () => {
    const body = feedback();
    const first = (await (await post('/feedback', body)).json()) as { id: number };
    const again = await post('/feedback', body);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, id: first.id, duplicate: true });
    expect(db.rows('SELECT * FROM reports')).toHaveLength(1);
    expect(pushes).toHaveLength(1);
  });

  it('a retried crash does not bump seen_count', async () => {
    const body = crash();
    await post('/crash', body);
    await post('/crash', body);
    expect(db.rows('SELECT seen_count FROM reports')).toEqual([{ seen_count: 1 }]);
  });
});

describe('privacy of pushes', () => {
  const PRIVATE = ['Quentin', 'Privateperson', '602', '555-1234', 'a@b.co'];

  it('feedback, crash and fixed pushes are masked, short and carry the screen', async () => {
    const text = 'Quentin Privateperson, phone 602-555-1234, mail a@b.co and the timer froze when I locked the phone again and again';
    await post('/feedback', feedback({ message: `${text}\nsecond line Quentin`, route: '/workout/:id' }));
    await post('/crash', crash({ message: `Error: ${text}`, signature: 'p1' }));
    await handleCron(env, deps()); // baseline
    db.raw.exec("UPDATE reports SET status = 'fixed'");
    await handleCron(env, deps());
    expect(pushes.map((p) => p.title)).toEqual(['AnyGym: new bug report', 'AnyGym: new crash', 'AnyGym: bug fixed', 'AnyGym: bug fixed']);
    for (const p of pushes) for (const secret of PRIVATE) expect(p.body, secret).not.toContain(secret);
    const [fb, cr, fixed] = pushes;
    expect(fb!.body.split('\n')[0]!.length).toBeLessThanOrEqual(80);
    expect(fb!.body).toMatch(/^\[name\] \[name\], phone \[phone\], mail \[email\]/);
    expect(fb!.body.endsWith('\nScreen: /workout/:id')).toBe(true);
    expect(cr!.body).toContain('Screen: /');
    pushes = [];
    await post('/feedback', feedback({ message: 'Smith machine stuck' }));
    expect(pushes[0]!.body).toBe('Smith machine stuck\nScreen: /workout/:id');
    expect(fixed!.body).toBe('Report #1 · Screen: /workout/:id\nClose and reopen the app to get it.');
  });
});

describe('atomic store', () => {
  it('a failure after the receipt and the row were written leaves nothing; the retry makes exactly one row', async () => {
    const body = feedback();
    db.onBatchStatement = (sql) => {
      if (sql.startsWith('UPDATE api_receipts')) throw new Error('worker killed');
    };
    expect((await post('/feedback', body)).status).toBe(500);
    expect(db.rows('SELECT * FROM reports')).toHaveLength(0);
    expect(db.rows('SELECT * FROM api_receipts')).toHaveLength(0);
    db.onBatchStatement = undefined;
    const ok = await post('/feedback', body);
    expect(ok.status).toBe(201);
    expect((await post('/feedback', body)).status).toBe(200);
    expect(db.rows('SELECT * FROM reports')).toHaveLength(1);
    expect(db.rows('SELECT request_id, report_id FROM api_receipts')).toEqual([{ request_id: body.requestId, report_id: 1 }]);
  });

  it('a twin that committed first: the second gets the same row, no 409, no second row', async () => {
    const body = crash();
    db.beforeBatch = (sqls) => {
      if (!sqls[0]!.startsWith('INSERT INTO api_receipts')) return;
      db.beforeBatch = undefined;
      db.raw.exec("INSERT INTO reports (kind, signature, message, status) VALUES ('crash', 'twin', 'm', 'open')");
      db.raw.prepare('INSERT INTO api_receipts (request_id, report_id, created_at) VALUES (?, 1, ?)').run(body.requestId, 'x');
    };
    const res = await post('/crash', body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 1, duplicate: true });
    expect(db.rows('SELECT * FROM reports')).toHaveLength(1);
  });

  it('the crash receipt links to the open row it bumped', async () => {
    await post('/crash', crash({ signature: 'same' }));
    const second = crash({ signature: 'same' });
    await post('/crash', second);
    expect(db.rows(`SELECT report_id FROM api_receipts WHERE request_id = '${second.requestId}'`)).toEqual([{ report_id: 1 }]);
  });
});

describe('crash dedupe', () => {
  it('the same signature on an open crash bumps seen_count and last_seen_at; a new row once that crash is closed', async () => {
    const a = (await (await post('/crash', crash())).json()) as { id: number };
    clock = new Date('2026-10-25T14:20:00Z');
    const b = (await (await post('/crash', crash())).json()) as { id: number };
    expect(b.id).toBe(a.id);
    expect(db.rows('SELECT seen_count, last_seen_at, created_at FROM reports')).toEqual([{ seen_count: 2, last_seen_at: '2026-10-25 14:20:00', created_at: '2026-10-25 14:10:00' }]);
    db.raw.exec("UPDATE reports SET status = 'fixed'");
    const c = (await (await post('/crash', crash())).json()) as { id: number };
    expect(c.id).not.toBe(a.id);
  });
});

describe('ntfy pushes', () => {
  it('feedback pushes its first line and the screen; a new crash pushes, a repeat does not', async () => {
    await post('/feedback', feedback());
    await post('/crash', crash());
    await post('/crash', crash());
    expect(pushes.map((p) => p.title)).toEqual(['AnyGym: new bug report', 'AnyGym: new crash']);
    expect(pushes[0]!.body).toBe('The plate picker froze\nScreen: /workout/:id');
    expect(pushes[0]!.url).toBe('https://ntfy.sh/test-topic');
  });

  it('no topic: no pushes, rows still stored', async () => {
    env = { ...env, NTFY_TOPIC: undefined };
    expect((await post('/feedback', feedback())).status).toBe(201);
    expect(pushes).toHaveLength(0);
  });

  it('at most 10 pushes an hour in total', async () => {
    for (let i = 0; i < 14; i++) await post('/crash', crash({ signature: `sig-${i}` }), { 'CF-Connecting-IP': `10.0.0.${i}` });
    expect(pushes).toHaveLength(10);
    clock = new Date('2026-10-25T15:01:00Z');
    await post('/feedback', feedback());
    expect(pushes).toHaveLength(11);
  });

  it('a failed ntfy call gives its push back', async () => {
    ntfyOk = false;
    await post('/feedback', feedback());
    expect(db.rows("SELECT value FROM api_meta WHERE key LIKE 'push:%'")).toEqual([{ value: '0' }]);
  });
});

describe('fixed cron', () => {
  it('first run records already fixed rows silently; later fixes push once with the reopen hint', async () => {
    await post('/feedback', feedback());
    await post('/crash', crash());
    pushes = [];
    db.raw.exec("UPDATE reports SET status = 'fixed' WHERE id = 1");
    expect(await handleCron(env, deps())).toBe(0);
    db.raw.exec("UPDATE reports SET status = 'fixed' WHERE id = 2");
    expect(await handleCron(env, deps())).toBe(1);
    expect(pushes).toEqual([{ url: 'https://ntfy.sh/test-topic', title: 'AnyGym: bug fixed', body: 'Report #2 · Screen: /\nClose and reopen the app to get it.' }]);
    expect(await handleCron(env, deps())).toBe(0);
    expect(pushes).toHaveLength(1);
  });

  it('respects the hourly budget and catches up on a later run', async () => {
    await handleCron(env, deps()); // baseline
    for (let i = 0; i < 12; i++) await post('/crash', crash({ signature: `f-${i}` }), { 'CF-Connecting-IP': `10.1.0.${i}` });
    clock = new Date('2026-10-25T16:00:00Z');
    pushes = [];
    db.raw.exec("UPDATE reports SET status = 'fixed'");
    expect(await handleCron(env, deps())).toBe(10);
    expect(await handleCron(env, deps())).toBe(0);
    clock = new Date('2026-10-25T17:00:00Z');
    expect(await handleCron(env, deps())).toBe(2);
  });

  it('prunes rate counters older than two days', async () => {
    db.raw.exec("INSERT INTO rate (ip_hash, hour, n) VALUES ('old', '2026-10-20T01', 3), ('new', '2026-10-25T13', 1)");
    await handleCron(env, deps());
    expect(db.rows('SELECT ip_hash FROM rate')).toEqual([{ ip_hash: 'new' }]);
  });
});
