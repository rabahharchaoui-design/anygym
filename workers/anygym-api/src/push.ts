// Phone alerts to G through ntfy (SPEC 24). The topic is a Worker secret; plain words, no personal data.
import type { Deps, Env } from './env';
import { returnPush, takePush } from './store';

export type Push = { title: string; body: string };
// Every push text is built by formatPush (src/lib/reporting/mask.ts, shared with the app).

/** Sends one push if there is a topic and this hour's budget allows it. True when it went out. */
export async function sendPush(env: Env, deps: Deps, push: Push): Promise<boolean> {
  const topic = env.NTFY_TOPIC?.trim();
  if (!topic) return false;
  const now = deps.now();
  if (!(await takePush(env.DB, now))) return false;
  try {
    const res = await deps.fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: push.title, 'Content-Type': 'text/plain; charset=utf-8' },
      body: push.body,
    });
    if (res.ok) return true;
  } catch {
    // ntfy unreachable: give the push back.
  }
  await returnPush(env.DB, now);
  return false;
}
