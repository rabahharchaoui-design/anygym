// CORS, origin checks and a body reader that stops at the size limit.
import type { Env } from './env';
import { MAX_BODY_BYTES, PROD_ORIGIN } from './limits';

/** The origins allowed to post. DEV_ORIGINS counts only outside production. */
export function allowedOrigins(env: Env): Set<string> {
  const set = new Set([PROD_ORIGIN]);
  if (env.ENVIRONMENT && env.ENVIRONMENT !== 'production' && env.DEV_ORIGINS) {
    for (const o of env.DEV_ORIGINS.split(',')) if (o.trim()) set.add(o.trim());
  }
  return set;
}

export const corsHeaders = (origin: string): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  // The app reads Retry-After on a 429 to wait as long as asked (PLAN 2.0c); CORS hides it otherwise.
  'Access-Control-Expose-Headers': 'Retry-After',
  Vary: 'Origin',
});

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

export class TooLarge extends Error {}

/** Reads the body as text, refusing more than MAX_BODY_BYTES even without a Content-Length. */
export async function readCapped(req: Request, max = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > max) throw new TooLarge();
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** SHA-256 of the client IP with a salt: the raw IP is never stored. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
