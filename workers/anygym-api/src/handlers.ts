// POST /feedback and POST /crash (SPEC 24), and the 15 minute "bug fixed" cron.
import type { Deps, Env } from './env';
import { allowedOrigins, corsHeaders, hashIp, json, readCapped, TooLarge } from './http';
import { sendPush, type Push } from './push';
import { formatPush } from '../../../src/lib/reporting/mask';
import { DuplicateRequest, ensureTables, findReceipt, hourOf, insertFeedback, markFixedSeen, newlyFixed, prune, takeRate, upsertCrash } from './store';
import { checkCrash, checkFeedback } from './validate';

const DEFAULT_SALT = 'anygym-api';

export async function handleRequest(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const kind = url.pathname === '/feedback' ? 'feedback' : url.pathname === '/crash' ? 'crash' : null;
  if (!kind) return json(404, { error: 'not found' });

  // Only the app's own origin (production) gets in; no CORS headers for anyone else.
  const origin = req.headers.get('Origin') ?? '';
  if (!allowedOrigins(env).has(origin)) return json(403, { error: 'origin' });
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method' }, { ...cors, Allow: 'POST, OPTIONS' });

  let text: string;
  try {
    text = await readCapped(req);
  } catch (e) {
    if (e instanceof TooLarge) return json(413, { error: 'too large' }, cors);
    return json(400, { error: 'body' }, cors);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'json' }, cors);
  }
  const checked = kind === 'feedback' ? ({ kind, r: checkFeedback(body) } as const) : ({ kind, r: checkCrash(body) } as const);
  if (!checked.r.ok) return json(400, { error: checked.r.error }, cors);
  const { requestId } = checked.r.value;

  const db = env.DB;
  await ensureTables(db);
  const now = deps.now();

  // Every request counts against the hourly limit, replays of a known request id included.
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await takeRate(db, await hashIp(ip, env.IP_SALT ?? DEFAULT_SALT), now))) {
    const retry = Math.max(1, Math.ceil((Date.parse(`${hourOf(now)}:00:00Z`) + 3_600_000 - now.getTime()) / 1000));
    return json(429, { error: 'rate' }, { ...cors, 'Retry-After': String(retry) });
  }

  // A retry of a request that already made its row gets that row back.
  const done = await findReceipt(db, requestId);
  if (done !== null) return json(200, { ok: true, id: done, duplicate: true }, cors);

  let id: number;
  let push: Push | null = null;
  try {
    if (checked.kind === 'feedback' && checked.r.ok) {
      const f = checked.r.value;
      id = await insertFeedback(db, requestId, f, now);
      push = formatPush('feedback', { id, message: f.message, route: f.route });
    } else if (checked.kind === 'crash' && checked.r.ok) {
      const c = checked.r.value;
      const r = await upsertCrash(db, requestId, c, now);
      id = r.id;
      if (r.isNew) push = formatPush('crash', { id, message: c.message, route: c.route });
    } else {
      throw new Error('unreachable');
    }
  } catch (e) {
    if (e instanceof DuplicateRequest) {
      const twin = await findReceipt(db, requestId);
      return json(200, { ok: true, id: twin, duplicate: true }, cors);
    }
    return json(500, { error: 'store' }, cors);
  }
  if (push) deps.waitUntil(sendPush(env, deps, push).catch(() => false));
  return json(201, { ok: true, id }, cors);
}

/** Every 15 minutes: one push per report that turned 'fixed', then prune old counters. */
export async function handleCron(env: Env, deps: Deps): Promise<number> {
  const db = env.DB;
  await ensureTables(db);
  let pushed = 0;
  for (const row of await newlyFixed(db, deps.now())) {
    const sent = await sendPush(env, deps, formatPush('fixed', { id: row.id, route: row.route }));
    // Without a topic there is nobody to tell: mark it seen. Out of budget or ntfy down: next run.
    if (!sent && env.NTFY_TOPIC?.trim()) break;
    await markFixedSeen(db, row.id, deps.now());
    if (sent) pushed++;
  }
  await prune(db, deps.now());
  return pushed;
}
