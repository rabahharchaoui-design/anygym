// D1 access. The tables reports and rate already exist (SPEC 24) and their schema is never changed
// here. This Worker adds three small tables of its own, created if missing:
//   api_receipts:   request id → report id, so a retried request never adds a second row
//   api_meta:       tiny key/value (the hourly push counter, the fixed rows baseline)
//   api_fixed_seen: report ids already announced as fixed
import type { D1Like, D1PreparedStatement } from './env';
import { PUSHES_PER_HOUR, RATE_PER_HOUR } from './limits';
import { deviceLine, type Crash, type Feedback } from './validate';

export const OWN_TABLES = [
  'CREATE TABLE IF NOT EXISTS api_receipts (request_id TEXT PRIMARY KEY, report_id INTEGER, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS api_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS api_fixed_seen (report_id INTEGER PRIMARY KEY, at TEXT NOT NULL)',
];

const ready = new WeakSet<D1Like>();

/** Creates this Worker's own tables once per isolate. */
export async function ensureTables(db: D1Like): Promise<void> {
  if (ready.has(db)) return;
  await db.batch(OWN_TABLES.map((sql) => db.prepare(sql)));
  ready.add(db);
}

/** UTC hour bucket, e.g. 2026-10-25T14. */
export const hourOf = (d: Date): string => d.toISOString().slice(0, 13);
const iso = (d: Date): string => d.toISOString();

/** Counts one request for this IP hash this hour; false once it is over the limit. */
export async function takeRate(db: D1Like, ipHash: string, now: Date): Promise<boolean> {
  const row = await db
    .prepare('INSERT INTO rate (ip_hash, hour, n) VALUES (?, ?, 1) ON CONFLICT (ip_hash, hour) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(ipHash, hourOf(now))
    .first<{ n: number }>();
  return (row?.n ?? 1) <= RATE_PER_HOUR;
}

export async function findReceipt(db: D1Like, requestId: string): Promise<number | null> {
  const row = await db.prepare('SELECT report_id FROM api_receipts WHERE request_id = ?').bind(requestId).first<{ report_id: number | null }>();
  return row?.report_id ?? null;
}

/** Thrown when a twin request with the same id committed first (the receipt already exists). */
export class DuplicateRequest extends Error {}

const isUniqueViolation = (e: unknown) => /UNIQUE|PRIMARY KEY|constraint/i.test(String((e as Error)?.message ?? e));

/**
 * One D1 batch (a single transaction): claim the request id, write the report (or bump the open
 * crash with the same signature), and link the receipt to that row. A kill or failure anywhere
 * leaves nothing behind, so a retry is never stuck and never makes a second row.
 */
async function storeAtomically(db: D1Like, requestId: string, now: Date, write: D1PreparedStatement, linkSql: string, linkArgs: unknown[]): Promise<Record<string, unknown>> {
  try {
    const results = await db.batch([
      db.prepare('INSERT INTO api_receipts (request_id, report_id, created_at) VALUES (?, NULL, ?)').bind(requestId, iso(now)),
      write,
      db.prepare(`UPDATE api_receipts SET report_id = (${linkSql}) WHERE request_id = ?`).bind(...linkArgs, requestId),
    ]);
    const row = results[1]?.results?.[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error('insert failed');
    return row;
  } catch (e) {
    if (isUniqueViolation(e) && (await findReceipt(db, requestId)) !== null) throw new DuplicateRequest();
    throw e;
  }
}

export async function insertFeedback(db: D1Like, requestId: string, f: Feedback, now: Date): Promise<number> {
  const context = JSON.stringify({ unit: f.unit, gymType: f.gymType, errors: f.errors, device: f.device });
  const write = db
    .prepare(
      "INSERT INTO reports (kind, created_at, last_seen_at, message, route, app_version, device, context_json, screenshot_b64, status) VALUES ('feedback', ?, ?, ?, ?, ?, ?, ?, ?, 'open') RETURNING id",
    )
    .bind(sqlTime(now), sqlTime(now), f.message, f.route, f.appVersion, deviceLine(f.device), context, f.screenshot);
  // The receipt insert came first, so last_insert_rowid() is this report's id.
  const row = await storeAtomically(db, requestId, now, write, 'SELECT last_insert_rowid()', []);
  return Number(row.id);
}

/** A crash with the signature of an open crash bumps that row instead of adding one. */
export async function upsertCrash(db: D1Like, requestId: string, c: Crash, now: Date): Promise<{ id: number; isNew: boolean }> {
  const t = sqlTime(now);
  const write = db
    .prepare(
      "INSERT INTO reports (kind, created_at, last_seen_at, signature, message, stack, route, app_version, device, context_json, status) VALUES ('crash', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open') " +
        "ON CONFLICT (signature) WHERE status = 'open' AND kind = 'crash' DO UPDATE SET seen_count = seen_count + 1, last_seen_at = excluded.last_seen_at RETURNING id, seen_count",
    )
    .bind(t, t, c.signature, c.message, c.stack, c.route, c.appVersion, deviceLine(c.device), JSON.stringify({ device: c.device }));
  const row = await storeAtomically(db, requestId, now, write, "SELECT id FROM reports WHERE kind = 'crash' AND status = 'open' AND signature = ?", [c.signature]);
  return { id: Number(row.id), isNew: Number(row.seen_count) === 1 };
}

/** Takes one push from this hour's budget (max 10 an hour, all pushes together). */
export async function takePush(db: D1Like, now: Date): Promise<boolean> {
  const row = await db
    .prepare("INSERT INTO api_meta (key, value) VALUES (?, '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING value")
    .bind(`push:${hourOf(now)}`)
    .first<{ value: string | number }>();
  return Number(row?.value ?? 1) <= PUSHES_PER_HOUR;
}

/** Gives back a push that was not sent (ntfy failed), so a later one can use it. */
export const returnPush = (db: D1Like, now: Date) =>
  db.prepare('UPDATE api_meta SET value = CAST(value AS INTEGER) - 1 WHERE key = ?').bind(`push:${hourOf(now)}`).run();

export type FixedRow = { id: number; kind: string; message: string | null; route: string | null };

/**
 * Rows that turned 'fixed' since the last check. The first run only records the rows already fixed
 * (no pushes for history).
 */
export async function newlyFixed(db: D1Like, now: Date, limit = PUSHES_PER_HOUR): Promise<FixedRow[]> {
  const base = await db.prepare("SELECT value FROM api_meta WHERE key = 'fixed_baseline'").first<{ value: string }>();
  if (!base) {
    await db.batch([
      db.prepare("INSERT INTO api_fixed_seen (report_id, at) SELECT id, ? FROM reports WHERE status = 'fixed' ON CONFLICT (report_id) DO NOTHING").bind(iso(now)),
      db.prepare("INSERT INTO api_meta (key, value) VALUES ('fixed_baseline', ?) ON CONFLICT (key) DO NOTHING").bind(iso(now)),
    ]);
    return [];
  }
  const res = await db
    .prepare("SELECT id, kind, message, route FROM reports WHERE status = 'fixed' AND id NOT IN (SELECT report_id FROM api_fixed_seen) ORDER BY id LIMIT ?")
    .bind(limit)
    .all<FixedRow>();
  return res.results;
}

export const markFixedSeen = (db: D1Like, id: number, now: Date) =>
  db.prepare('INSERT INTO api_fixed_seen (report_id, at) VALUES (?, ?) ON CONFLICT (report_id) DO NOTHING').bind(id, iso(now)).run();

/** Drops rate counters and push counters older than two days, receipts older than 30 days. */
export async function prune(db: D1Like, now: Date): Promise<void> {
  const twoDays = new Date(now.getTime() - 2 * 86_400_000);
  const month = new Date(now.getTime() - 30 * 86_400_000);
  await db.batch([
    db.prepare('DELETE FROM rate WHERE hour < ?').bind(hourOf(twoDays)),
    db.prepare("DELETE FROM api_meta WHERE key LIKE 'push:%' AND key < ?").bind(`push:${hourOf(twoDays)}`),
    db.prepare('DELETE FROM api_receipts WHERE created_at < ?').bind(iso(month)),
  ]);
}

/** SQLite datetime('now') format, matching the table defaults. */
export const sqlTime = (d: Date): string => d.toISOString().slice(0, 19).replace('T', ' ');
