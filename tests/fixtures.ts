import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

// PLAN 1.10a: every spec imports test and expect from here, never from @playwright/test.
// Tests must never leave the machine: on macOS a tap on the Music or Spotify button
// (https://music.apple.com, https://open.spotify.com) gets handed to the native app.
// Three layers stop that:
//   1. an init script cancels clicks on external links and external window.open calls,
//   2. context.route aborts every request whose host is not localhost or 127.0.0.1,
//   3. any popup that still opens is closed at once.
// Everything blocked is appended to test-results/network-guard.log so a run can be audited.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// SPEC 24: the report API (the anygym-api Worker). It never reaches the network in the normal suite:
//   - an init script answers the app's fetch calls to it inside the page (a page controlled by the
//     PWA service worker sends fetches past context.route in WebKit, so the route alone is not
//     enough), through the __pwReportApi binding: offline (setOffline) it fails like no signal,
//     otherwise a spec's own handler (tests/helpers/reportApi.ts) or the default mock answers 201;
//   - context.route also answers the host with the mock, for anything else that tries.
// Only a dedicated live test may ever talk to the real Worker.
export const REPORT_API_ORIGIN = 'https://anygym-api.rabahharchaoui.workers.dev';
const REPORT_API_HOST = new URL(REPORT_API_ORIGIN).hostname;
export const REPORT_CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export type ReportApiCall = { path: string; method: string; body: string | null };
export type ReportApiAnswer = { status: number; body: string };
type ReportApiHandler = (call: ReportApiCall) => ReportApiAnswer;
const reportHandlers = new WeakMap<BrowserContext, ReportApiHandler>();
const DEFAULT_REPORT_ANSWER: ReportApiAnswer = { status: 201, body: '{"ok":true,"id":1}' };

/** Lets a spec see and answer the report API calls of a context (tests/helpers/reportApi.ts). */
export const onReportApi = (context: BrowserContext, handler: ReportApiHandler) => void reportHandlers.set(context, handler);

// Runs in the page before the app.
function mockReportApiInPage(origin: string) {
  const original = window.fetch.bind(window);
  const w = window as unknown as { __pwReportApi: (c: { path: string; method: string; body: string | null }) => Promise<{ offline?: boolean; status: number; body: string }> };
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(origin)) return original(input, init);
    const body = typeof init?.body === 'string' ? init.body : null;
    const answer = await w.__pwReportApi({ path: new URL(url).pathname, method: init?.method ?? 'GET', body });
    if (answer.offline) throw new TypeError('Load failed');
    return new Response(answer.body, { status: answer.status, headers: { 'Content-Type': 'application/json' } });
  };
}
const LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'network-guard.log');

export const isLocalUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return true;
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
};

const log = (kind: string, url: string) => {
  const title = (() => {
    try {
      return base.info().titlePath.join(' > ');
    } catch {
      return '(outside a test)';
    }
  })();
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()}\t${kind}\t${url}\t${title}\n`);
  } catch {
    // Logging must never fail a test.
  }
};

// Runs in the page before the app. Keeps the app's links real, only stops the navigation.
function cancelExternalNavigation() {
  const local = (href: string) => {
    try {
      const u = new URL(href, location.href);
      if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return true;
      return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    } catch {
      return false;
    }
  };
  const w = window as unknown as { __blockedNav: string[] };
  w.__blockedNav = [];
  window.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a && !local(a.href)) {
        e.preventDefault();
        w.__blockedNav.push(a.href);
      }
    },
    true,
  );
  const open = window.open.bind(window);
  window.open = (url?: string | URL, ...rest: [string?, string?]) => {
    if (url !== undefined && !local(String(url))) {
      w.__blockedNav.push(String(url));
      return null;
    }
    return open(url, ...rest);
  };
}

// ---------------------------------------------------------------------------------------------
// SPEC 13.3: any console error or unhandled promise rejection during any test is a FAIL.
// Every page of every guarded context (the test's own context, contexts made with
// browser.newContext() + guardContext, persistent contexts in kill.ts, and every popup) reports
// console.error, uncaught exceptions and unhandled rejections into the running test's collector.
// The automatic `errorTrap` fixture asserts the collector is empty at teardown.
//
// Documented allowlist (the only exemptions; never broad substrings in app tests):
//   - allowConsoleErrors(/pattern/) inside a test, for errors that test provokes on purpose
//     (a deliberate rejection). Used by: loads.spec (the dev page's error log) and harness.spec.
//   - "Failed to load resource" for a request the network guard aborted, or one that failed while
//     the test had set its context offline (setOffline(true), or kill.ts's offline relaunch),
//     matched by the exact URL of the message, and Chromium's service worker script check while
//     offline. Any other failed request (online, not cancelled by a navigation) is an error.
// ---------------------------------------------------------------------------------------------

type Collector = { errors: string[]; allow: RegExp[]; failedUrls: Set<string> };
const collectors = new Map<string, Collector>();

const currentCollector = (): Collector | undefined => {
  try {
    return collectors.get(base.info().testId);
  } catch {
    return undefined;
  }
};

/** Lets the running test emit errors matching these patterns (only for errors it provokes on purpose). */
export function allowConsoleErrors(...patterns: RegExp[]) {
  const c = currentCollector();
  if (!c) throw new Error('allowConsoleErrors must be called inside a test');
  c.allow.push(...patterns);
}

/** The errors collected so far in this test (after the allowlist). */
export function collectedErrors(): string[] {
  const c = currentCollector();
  return c ? unexpected(c) : [];
}

const unexpected = (c: Collector) =>
  c.errors.filter((e) => {
    if (c.allow.some((r) => r.test(e))) return false;
    // Browser noise for a request that was meant to fail (aborted by the guard, or sent while the
    // test had the context offline), by the exact URL only. No URL, no exemption.
    const m = /^console: Failed to load resource.* \[(.+)\]$/.exec(e);
    return !(m && c.failedUrls.has(m[1]!));
  });

// Runs in the page before the app: unhandled rejections and uncaught errors go to the collector
// through the __pwReportError binding, even in engines that do not raise `pageerror` for them.
function reportRejections() {
  const send = (text: string) => {
    const w = window as unknown as { __pwReportError?: (t: string) => void };
    try {
      w.__pwReportError?.(text);
    } catch {
      // The binding is gone while the page closes.
    }
  };
  const describe = (v: unknown) => (v instanceof Error ? `${v.name}: ${v.message}` : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());
  window.addEventListener('unhandledrejection', (e) => send(`unhandledrejection: ${describe(e.reason)}`));
}

const watched = new WeakSet<BrowserContext>();
const offline = new WeakMap<BrowserContext, boolean>();

/** Marks a context as offline (kill.ts launches persistent contexts with `offline: true`). */
export const markOffline = (context: BrowserContext, value = true) => void offline.set(context, value);

/** Wires a context's pages into the running test's error collector (idempotent). */
export async function trapErrors(context: BrowserContext): Promise<void> {
  if (watched.has(context)) return;
  watched.add(context);
  const route = () => currentCollector();
  // Requests that fail while the test set the context offline are expected to fail.
  const setOffline = context.setOffline.bind(context);
  context.setOffline = async (value: boolean) => {
    offline.set(context, value);
    return setOffline(value);
  };
  await context.exposeBinding('__pwReportError', (_src, text: string) => route()?.errors.push(String(text)));
  await context.addInitScript(reportRejections);
  const watchPage = (page: Page) => {
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // Chromium's service worker update check while the test has the context offline.
      if (offline.get(context) && m.text() === 'An unknown error occurred when fetching the script.') return;
      const url = m.location()?.url;
      route()?.errors.push(`console: ${m.text()}${url && /^Failed to load resource/.test(m.text()) ? ` [${url}]` : ''}`);
    });
    page.on('pageerror', (e) => route()?.errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      const c = route();
      if (!c) return;
      if (offline.get(context) || c.failedUrls.has(r.url())) {
        c.failedUrls.add(r.url());
        return;
      }
      // Online, not aborted by the guard: a failed request is an error (WebKit does not always log
      // one to the console). A request the browser cancelled itself (navigation) is not a failure.
      const why = r.failure()?.errorText ?? '';
      if (/ERR_ABORTED|cancell?ed/i.test(why)) return;
      c.errors.push(`requestfailed: ${r.url()} (${why})`);
    });
  };
  for (const page of context.pages()) watchPage(page);
  context.on('page', watchPage);
}

const guardPage = (page: Page) => {
  page.on('popup', (popup) => {
    log('popup', popup.url());
    void popup.close().catch(() => {});
  });
};

const guarded = new WeakSet<BrowserContext>();

/**
 * Applies the network guard and the error trap to a context (idempotent). Contexts a test makes
 * with browser.newContext() / browser.newPage() get it automatically (the `guardNewContexts`
 * fixture); call it yourself only for persistent contexts (kill.ts does).
 */
export async function guardContext(context: BrowserContext): Promise<BrowserContext> {
  if (guarded.has(context)) return context;
  guarded.add(context);
  await trapErrors(context);
  await context.addInitScript(cancelExternalNavigation);
  await context.exposeBinding('__pwReportApi', (_src, call: ReportApiCall) => {
    log('mocked', `${REPORT_API_ORIGIN}${call.path}`);
    if (offline.get(context)) return { offline: true, status: 0, body: '' };
    return (reportHandlers.get(context) ?? (() => DEFAULT_REPORT_ANSWER))(call);
  });
  await context.addInitScript(mockReportApiInPage, REPORT_API_ORIGIN);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocalUrl(url)) return route.continue();
    if (new URL(url).hostname === REPORT_API_HOST) {
      log('mocked', url);
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: REPORT_CORS });
      const call = { path: new URL(url).pathname, method: route.request().method(), body: route.request().postData() };
      const answer = (reportHandlers.get(context) ?? (() => DEFAULT_REPORT_ANSWER))(call);
      return route.fulfill({ status: answer.status, headers: REPORT_CORS, contentType: 'application/json', body: answer.body });
    }
    log('blocked', url);
    currentCollector()?.failedUrls.add(url);
    return route.abort('blockedbyclient');
  });
  for (const page of context.pages()) guardPage(page);
  context.on('page', guardPage);
  return context;
}

export const test = base.extend<{ errorTrap: void; guardNewContexts: void; networkGuard: void }>({
  // Set up first, so the collector exists before any page or context of the test.
  errorTrap: [
    async ({}, use, info) => {
      const c: Collector = { errors: [], allow: [], failedUrls: new Set() };
      collectors.set(info.testId, c);
      await use();
      collectors.delete(info.testId);
      const bad = unexpected(c);
      if (bad.length) throw new Error(`SPEC 13.3: ${bad.length} console error(s) or unhandled rejection(s) during the test:\n  ${bad.join('\n  ')}`);
    },
    { auto: true },
  ],
  // Every context the test makes itself is guarded before any of its pages load.
  guardNewContexts: [
    async ({ browser, errorTrap: _ }, use) => {
      const newContext = browser.newContext.bind(browser);
      const newPage = browser.newPage.bind(browser);
      browser.newContext = async (...args: Parameters<typeof newContext>) => guardContext(await newContext(...args));
      browser.newPage = async (...args: Parameters<typeof newPage>) => {
        const ctx = await browser.newContext(...args);
        const page = await ctx.newPage();
        page.once('close', () => void ctx.close().catch(() => {}));
        return page;
      };
      try {
        await use();
      } finally {
        browser.newContext = newContext;
        browser.newPage = newPage;
      }
    },
    { auto: true },
  ],
  networkGuard: [
    async ({ context, errorTrap: _ }, use) => {
      await guardContext(context);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { BrowserContext, Locator, Page } from '@playwright/test';
