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

const guardPage = (page: Page) => {
  page.on('popup', (popup) => {
    log('popup', popup.url());
    void popup.close().catch(() => {});
  });
};

/** Applies the network guard to a context. Use it on contexts made with browser.newContext(). */
export async function guardContext(context: BrowserContext): Promise<BrowserContext> {
  await context.addInitScript(cancelExternalNavigation);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (isLocalUrl(url)) return route.continue();
    log('blocked', url);
    return route.abort('blockedbyclient');
  });
  for (const page of context.pages()) guardPage(page);
  context.on('page', guardPage);
  return context;
}

export const test = base.extend<{ networkGuard: void }>({
  networkGuard: [
    async ({ context }, use) => {
      await guardContext(context);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { BrowserContext, Locator, Page } from '@playwright/test';
