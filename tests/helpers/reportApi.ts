// SPEC 24: a stand in for the anygym-api Worker that keeps every report the app sends.
import { onReportApi, type BrowserContext } from '../fixtures';

export type SentReport = { path: string; body: Record<string, unknown> };

/** Captures the report API calls of a context (the guard keeps them off the network). */
export async function mockReportApi(context: BrowserContext, status = 201): Promise<SentReport[]> {
  const sent: SentReport[] = [];
  onReportApi(context, (call) => {
    if (call.method !== 'POST') return { status: 204, body: '' };
    sent.push({ path: call.path, body: JSON.parse(call.body ?? 'null') });
    return { status, body: JSON.stringify({ ok: status < 300, id: sent.length }) };
  });
  return sent;
}
