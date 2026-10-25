// anygym-api (SPEC 24): the Cloudflare Worker entry.
import type { Env } from './env';
import { handleCron, handleRequest } from './handlers';
import { json } from './http';

type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    try {
      return await handleRequest(req, env, { now: () => new Date(), fetch: (...a) => fetch(...a), waitUntil: (p) => ctx.waitUntil(p) });
    } catch {
      return json(500, { error: 'server' });
    }
  },
  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    ctx.waitUntil(handleCron(env, { now: () => new Date(), fetch: (...a) => fetch(...a), waitUntil: (p) => ctx.waitUntil(p) }));
  },
};
