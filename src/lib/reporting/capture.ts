// Crash reports (SPEC 24): window errors, unhandled rejections and React error boundaries send a
// tiny report (message, stack, route, version, device). The message is allowlisted (mask.ts
// autoMessage: error code, fixed text, script location), never the error's own words. Each
// signature (message plus first stack frame) is sent at most once per day per phone, and only
// while Send crash reports is on.
// Reporting never logs, so it can never report itself.
import { newId } from '../../db/ids';
import { enqueueCrash } from '../../db/reports';
import { APP_VERSION } from './config';
import { currentRoute, describeValue, deviceInfo, installConsoleRing, noteRoute, ownScript, pushError } from './diagnostics';
import { autoMessage, autoSignature, maskStack, stackRefs } from './mask';
import { crashReports, type CrashPreference } from './preferences';
import { transport, type Transport } from './transport';
import type { CrashPayload } from './types';

export { ownScript };

/** The first frame of a (masked) stack that points into a script: 'index-abc.js:12:345'. */
export const firstFrame = (stack: string): string => stackRefs(stack, 1) || 'no-stack';

/** Only frames from our own scripts, as 'file.js:line:col'. */
export const cleanStack = (stack: string): string => maskStack(stack, ownScript);

/** The same bug gives the same signature: automatic message plus first frame of the masked stack. */
export const crashSignature = (message: string, maskedStack: string): string => autoSignature(message, maskedStack);

export function buildCrash(error: unknown, fallbackStack = ''): CrashPayload | null {
  const described = describeValue(error);
  const raw = error instanceof Error && typeof error.stack === 'string' && error.stack ? error.stack : fallbackStack;
  // Browser noise, not an app bug: layout observer warnings, and cross origin errors with no detail.
  if (/ResizeObserver loop/i.test(described) || (/^Script error\.?$/.test(described) && !raw)) return null;
  const stack = cleanStack(raw);
  // Never the error's own words: its approved code, a fixed text and where it happened.
  const first = firstFrame(stack);
  const message = autoMessage(described, first === 'no-stack' ? null : first);
  return { requestId: newId(), signature: crashSignature(message, stack), message, stack, route: currentRoute(), appVersion: APP_VERSION, device: deviceInfo() };
}

type Deps = { prefs?: CrashPreference; transport?: Transport; now?: () => number };

/** Queues and sends a crash report if allowed and not already sent today. True when queued. */
export async function captureCrash(error: unknown, fallbackStack = '', deps: Deps = {}): Promise<boolean> {
  try {
    const payload = buildCrash(error, fallbackStack);
    if (!payload) return false;
    pushError(payload.message);
    // The saved choice, read now: another tab may have just turned it off.
    if (!(await (deps.prefs ?? crashReports).fresh())) return false;
    if (!(await enqueueCrash(payload, (deps.now ?? Date.now)()))) return false;
    void (deps.transport ?? transport).drain();
    return true;
  } catch {
    return false;
  }
}

let installed = false;

/**
 * Wires reporting into the app once: the console error ring, the screen tracker, crash listeners,
 * and sending what waits in the queue at start, on coming back online and on returning to the app.
 */
export function installReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  installConsoleRing();
  noteRoute(window.location.hash || '/');
  window.addEventListener('hashchange', () => noteRoute(window.location.hash || '/'));
  window.addEventListener('error', (e: ErrorEvent) => {
    const where = e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : '';
    void captureCrash(e.error ?? e.message, where);
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => void captureCrash(e.reason));
  window.addEventListener('online', () => void transport.drain(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void transport.drain(true);
  });
  // After first paint, so a waiting report never competes with the app starting.
  window.setTimeout(() => void transport.drain(true), 1500);
}
