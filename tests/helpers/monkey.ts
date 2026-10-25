// Monkey test helper (SPEC 13.3: "90 seconds of random taps and swipes on each main screen with no
// console errors and no stuck states"). Seeded, so a failure replays with the same seed.
//   - taps at random points of the viewport and swipes in random directions,
//   - never taps anything that ends or wipes data (Finish, Replace, Delete all, Restore, Import,
//     Back up, file pickers, external links), judged by the element under the point,
//   - every few actions: any open sheet must close within 2 s of Escape (or the back gesture),
//   - fails at once on a console error or unhandled rejection (tests/fixtures.ts collector),
//   - wanders back to its screen when it has left it for a while, through the app's own controls
//     (back buttons, Minimize, the tab bar, the resume bar), checking each step responds,
//   - at the end the app must still respond: no sheet left, back to the tabs through the UI, the
//     tab bar navigates. The page is never reloaded or re-opened: a stuck screen stays stuck and
//     fails the test.
//   - counts what was OBSERVABLY done (PLAN 1.7i (10)): an action counts as effective only when
//     the page reacted (the DOM changed outside the running clocks, something scrolled, or the
//     route changed), not when it was merely attempted,
//   - every few actions checks the page still takes taps in place: when the screen has controls
//     but a layer on top takes every tap meant for them (a transparent overlay), it fails at once,
//     in the same document, before any way back is tried.
// Swipes use mouse drags (pointer events): Playwright has no touch move API in WebKit
// (touchscreen only taps), so native touch panning is not exercised here.
import { collectedErrors, expect, type Page } from '../fixtures';
import { rng } from './history-fixture';

export type MonkeyOptions = {
  /** Where the monkey starts and returns to (a URL relative to baseURL). */
  home: string;
  durationMs?: number;
  seed?: number;
};

/** Words of controls the monkey never presses. */
const AVOID = /^(finish|replace|replace everything|delete all|restore|import|import \d+ sets?|back up|finish without (it|them))\b/i;

/** What is under (x, y): 'ok', or why the point is skipped. Runs in the page. */
function judge([x, y, avoid]: [number, number, string]): string {
  const el = document.elementFromPoint(x, y);
  if (!el) return 'nothing';
  const control = el.closest('button, a, input, label, select, textarea, [role="button"], [role="radio"], [role="link"]') as HTMLElement | null;
  if (!control) return 'ok';
  if (control instanceof HTMLInputElement && control.type === 'file') return 'file input';
  if (control.closest('label')?.querySelector('input[type="file"]')) return 'file input';
  const testid = control.getAttribute('data-testid') ?? '';
  if (/^(backup|restore|import-history|import-confirm|import-file|restore-file)$/.test(testid)) return `testid ${testid}`;
  if (control instanceof HTMLAnchorElement) {
    try {
      const u = new URL(control.href, location.href);
      if (u.origin !== location.origin) return 'external link';
    } catch {
      return 'bad link';
    }
  }
  const words = (control.getAttribute('aria-label') ?? control.textContent ?? '').trim();
  return new RegExp(avoid, 'i').test(words) ? `avoid "${words.slice(0, 40)}"` : 'ok';
}

const openSheets = (page: Page) => page.getByRole('dialog');

/** Every open sheet closes within 2 s of Escape, else of the back gesture: never a stuck sheet. */
async function closeSheets(page: Page) {
  for (let round = 0; round < 4 && (await openSheets(page).count()) > 0; round++) {
    const before = await openSheets(page).count();
    if (before === 0) break; // it finished closing on its own
    await page.keyboard.press('Escape');
    const closed = await expect
      .poll(() => openSheets(page).count(), { timeout: 2000 })
      .toBeLessThan(before)
      .then(() => true)
      .catch(() => false);
    if (closed) continue;
    // Android's back button (and iOS's edge swipe) step back through the sheet's history entry.
    await page.goBack().catch(() => {});
    await expect.poll(() => openSheets(page).count(), { timeout: 2000, message: 'a sheet did not close within 2 s of Escape or back' }).toBeLessThan(before);
  }
  await expect(openSheets(page)).toHaveCount(0);
}

/** Installs the reaction counter in the page (once per document): DOM changes outside clocks, scrolls, route changes. */
const installCounter = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __monkeySeen?: number };
    if (w.__monkeySeen !== undefined) return;
    w.__monkeySeen = 0;
    const clock = '[role="timer"], [data-testid="rest-timer"], [data-testid="timer-clock"], [data-testid="elapsed"]';
    new MutationObserver((list) => {
      for (const m of list) {
        const t = m.target instanceof Element ? m.target : m.target.parentElement;
        if (t && !t.closest(clock)) {
          w.__monkeySeen!++;
          return;
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    addEventListener('scroll', () => w.__monkeySeen!++, { capture: true, passive: true });
    addEventListener('hashchange', () => w.__monkeySeen!++);
  });

/** The page's reaction count: -1 in a new document (the counter is gone: a reload), null while it cannot be read. */
const reactions = (page: Page) => page.evaluate(() => (window as unknown as { __monkeySeen?: number }).__monkeySeen ?? -1).catch(() => null);

/**
 * Runs in the page: null when the screen takes taps, else what takes them instead. The screen is
 * blocked when it shows enabled controls (in the top sheet, if one is open) and the element at the
 * middle of EVERY one of them is something else that is not part of a sheet: a layer over the page.
 */
function tapBlocker(): string | null {
  if (document.documentElement.dataset.nav) return null; // a view transition holds input on purpose
  const visible = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible);
  const scope = dialogs.length ? dialogs[dialogs.length - 1]! : document.body;
  const controls = [...scope.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="tab"], [role="radio"]')].filter((el) => {
    if (!visible(el) || el.closest('[inert]') || (el as HTMLButtonElement).disabled || getComputedStyle(el).pointerEvents === 'none') return false;
    const r = el.getBoundingClientRect();
    const x = (r.left + r.right) / 2;
    const y = (r.top + r.bottom) / 2;
    return r.width > 0 && r.height > 0 && x > 0 && y > 0 && x < innerWidth && y < innerHeight;
  });
  if (!controls.length) return null;
  let blocker: Element | null = null;
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    if (!top || top === el || el.contains(top) || top.closest('[role="dialog"]')) return null;
    blocker ??= top;
  }
  return `${blocker!.tagName.toLowerCase()}${blocker!.id ? `#${blocker!.id}` : ''}.${String(blocker!.className).slice(0, 30)} takes every tap meant for the ${controls.length} controls on the screen`;
}

/** Fails at once when a layer takes every tap and does not go within 2 s (never reloads first). */
async function assertTakesTaps(page: Page) {
  let blocked: string | null = null;
  for (let t = 0; t < 20; t++) {
    blocked = await page.evaluate(tapBlocker).catch(() => null);
    if (!blocked) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`stuck screen at ${await page.evaluate(() => location.hash).catch(() => '?')}: ${blocked}`);
}

const failOnErrors = () => {
  const errors = collectedErrors();
  if (errors.length) throw new Error(`console errors during the monkey test:\n  ${errors.join('\n  ')}`);
};

/** Runs the monkey on `home`. Returns what it did, for the log. */
export async function monkey(page: Page, { home, durationMs = 90_000, seed = 1 }: MonkeyOptions) {
  const r = rng(seed);
  const vp = page.viewportSize()!;
  const norm = (h: string) => (h === '' ? '#/' : h);
  let homeUrl = norm(new URL(home, 'http://localhost/anygym/').hash);
  const stats = { taps: 0, swipes: 0, skipped: 0, sheetsClosed: 0, returns: 0, escapes: 0, effective: 0 };
  const end = Date.now() + durationMs;
  await installCounter(page);
  let away = 0;
  let step = 0;
  while (Date.now() < end) {
    step++;
    const x = Math.round(4 + r.next() * (vp.width - 8));
    const y = Math.round(4 + r.next() * (vp.height - 8));
    const roll = r.next();
    const seenBefore = await reactions(page);
    if (roll < 0.72) {
      const verdict = await page.evaluate(judge, [x, y, AVOID.source] as [number, number, string]).catch(() => 'navigating');
      if (verdict === 'ok') {
        await page.touchscreen.tap(x, y).catch(() => {});
        stats.taps++;
      } else stats.skipped++;
    } else if (roll < 0.92) {
      // A swipe: mostly vertical scrolls, sometimes sideways (next exercise, back from the edge).
      const sideways = r.next() < 0.35;
      const dx = sideways ? (r.next() < 0.5 ? -1 : 1) * (80 + r.next() * 200) : (r.next() - 0.5) * 30;
      const dy = sideways ? (r.next() - 0.5) * 20 : (r.next() < 0.5 ? -1 : 1) * (60 + r.next() * 300);
      const sx = sideways && dx > 0 && r.next() < 0.5 ? 6 : x; // sometimes from the left edge
      const verdict = await page.evaluate(judge, [sx, y, AVOID.source] as [number, number, string]).catch(() => 'navigating');
      if (verdict === 'ok') {
        await page.mouse.move(sx, y);
        await page.mouse.down();
        await page.mouse.move(Math.max(1, Math.min(vp.width - 1, sx + dx)), Math.max(1, Math.min(vp.height - 1, y + dy)), { steps: 6 });
        await page.mouse.up();
        stats.swipes++;
      } else stats.skipped++;
    } else {
      await page.keyboard.press('Escape');
      stats.escapes++;
    }
    // A human's pace (and time for the screen to react), 20 to 120 ms between actions.
    await page.waitForTimeout(20 + Math.floor(r.next() * 100));
    failOnErrors();
    // Only what the page visibly did counts (a new document after a reload would read -1).
    const seenAfter = await reactions(page);
    if (roll < 0.92 && seenBefore !== null && seenAfter !== null && seenBefore >= 0 && seenAfter > seenBefore) stats.effective++;
    if (seenAfter === -1) throw new Error('the page was reloaded or replaced during the monkey test (a recovery reload is a failure)');
    if (step % 6 === 0) await assertTakesTaps(page);
    if (step % 12 === 0 && (await openSheets(page).count()) > 0) {
      await closeSheets(page);
      stats.sheetsClosed++;
    }
    // Wandered off its screen for a while (or into a screen the monkey must not use): back home.
    const hash = norm(await page.evaluate(() => location.hash).catch(() => homeUrl));
    away = hash === homeUrl ? 0 : away + 1;
    if (away > 25) {
      await settle(page);
      await assertTakesTaps(page);
      await closeSheets(page);
      await goHome(page, homeUrl);
      homeUrl = norm(await page.evaluate(() => location.hash)); // a new workout's id, if it changed
      stats.returns++;
      away = 0;
    }
  }
  // Still responsive: no sheet left, back to the tabs through the UI, the tab bar navigates.
  await settle(page);
  await assertTakesTaps(page);
  await closeSheets(page);
  failOnErrors();
  await toTabs(page);
  for (const name of ['History', 'Today']) {
    await tapTab(page, name);
    await expect(page.getByRole('heading', { level: 1, name }), `the ${name} tab did not respond`).toBeVisible();
  }
  failOnErrors();
  return stats;
}

/**
 * Lets the last random action land (a tap that starts a workout navigates after a write) so the way
 * back starts from where the app really is: the route and sheet count hold still for 500 ms, at most
 * 3 s. Never fails on its own; a screen that keeps moving is checked by what follows.
 */
async function settle(page: Page) {
  const state = () => page.evaluate(() => `${location.hash}|${document.documentElement.dataset.nav ?? ''}|${document.querySelectorAll('[role="dialog"]').length}`).catch(() => 'navigating');
  let last = await state();
  for (let still = 0, t = 0; still < 5 && t < 30; t++) {
    await page.waitForTimeout(100);
    const now = await state();
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

const hashOf = (page: Page) => page.evaluate(() => (location.hash === '' ? '#/' : location.hash));

/** The tab bar is up and takes taps (not hidden behind a workout or a pushed screen). */
const tabsUp = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Main"]')].some((nav) => {
      if (nav.closest('[data-hidden], [inert]')) return false;
      const r = nav.getBoundingClientRect();
      return r.height > 0 && r.top < innerHeight - 20;
    }),
  );

/**
 * Back to a main tab through the app's own way back: a "Back to …" button, Minimize workout, or the
 * finish screen's Done. Each tap must change the screen within 3 s, else the screen is stuck.
 */
async function toTabs(page: Page) {
  for (let i = 0; i < 8 && !(await tabsUp(page)); i++) {
    const back = page.locator('[aria-label^="Back to"]:visible, [aria-label="Minimize workout"]:visible');
    const done = page.getByRole('button', { name: 'Done', exact: true });
    const target = (await back.count()) ? back.first() : (await done.count()) ? done.first() : null;
    // Just arrived on a tab screen: the tab bar slides back up a moment after the route changes.
    if (!target && (await expect.poll(() => tabsUp(page), { timeout: 3000 }).toBe(true).then(() => true, () => false))) break;
    expect(target, `no way back through the UI from ${await hashOf(page)}`).not.toBeNull();
    const label = (await target!.getAttribute('aria-label').catch(() => null)) ?? 'Done';
    const before = await hashOf(page);
    // A thumb taps where the button is, even while a large title or spring is still moving.
    await target!.tap({ timeout: 3000 }).catch(async () => {
      if ((await hashOf(page)) !== before) return; // it landed: the button left with its screen
      const b = await target!.boundingBox({ timeout: 1000 }).catch(() => null);
      if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    });
    // A second tap if the first went nowhere (a person taps again), then it must have responded.
    if (!(await expect.poll(() => hashOf(page), { timeout: 3000 }).not.toBe(before).then(() => true, () => false))) {
      await target!.tap({ timeout: 3000 }).catch(() => {});
      await expect.poll(() => hashOf(page), { timeout: 3000, message: `the screen did not respond to ${label} (tapped twice)` }).not.toBe(before);
    }
  }
  await expect.poll(() => tabsUp(page), { timeout: 3000, message: 'the tab bar did not come back' }).toBe(true);
}

/** Back to the monkey's screen through the UI: tabs, then the screen's own entry point. */
async function goHome(page: Page, homeUrl: string) {
  await toTabs(page);
  const tab = async (name: string, heading: string) => {
    await tapTab(page, name);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  };
  if (homeUrl === '#/') return tab('Today', 'Today');
  if (homeUrl === '#/plans') return tab('Plans', 'Plans');
  if (homeUrl === '#/history') return tab('History', 'History');
  if (homeUrl.startsWith('#/plans/')) {
    await tab('Plans', 'Plans');
    await page.getByTestId(`plan-${homeUrl.slice('#/plans/'.length)}`).tap();
  } else if (homeUrl === '#/settings') {
    await tab('Today', 'Today');
    await page.getByRole('link', { name: 'Settings' }).tap();
  } else if (homeUrl.startsWith('#/workout/')) {
    await tab('Today', 'Today');
    // The resume bar ("Resume Quick workout · …") or the plan day card's Resume. The monkey may
    // have ended the workout itself (an emptied workout is discarded): then it carries on from Today.
    const resume = page.getByRole('button', { name: /^Resume\b/ }).first();
    if (!(await resume.waitFor({ timeout: 3000 }).then(() => true, () => false))) return;
    await resume.tap();
    await expect.poll(() => hashOf(page), { timeout: 3000 }).toMatch(/^#\/workout\//);
    const ex = homeUrl.split('/')[3];
    if (ex && (await hashOf(page)) !== homeUrl) {
      const row = page.getByTestId(`row-${decodeURIComponent(ex)}`);
      // The monkey may have removed that exercise (Remove has Undo): then it carries on from here.
      if (!(await row.isVisible())) return;
      await row.tap();
    }
  }
  // Same screen; the monkey may have started a new workout meanwhile (another session id).
  if (homeUrl.startsWith('#/workout/') && !(await hashOf(page)).startsWith('#/workout/')) return;
  const kind = (h: string) => h.replace(/^#\/workout\/[^/]+/, '#/workout/:id');
  await expect.poll(async () => kind(await hashOf(page)), { timeout: 3000, message: `could not get back to ${homeUrl} through the UI` }).toBe(kind(homeUrl));
}

/**
 * Taps a tab like a thumb: where it is, even if Playwright finds it "not stable" (a spring still
 * moving under load). Logs what was moving, for the report; the screen must still respond.
 */
async function tapTab(page: Page, name: string, lateNavigations = 1) {
  const link = page.locator('nav[aria-label="Main"]:not([data-hidden]) a').filter({ hasText: new RegExp(`^${name}$`) });
  await link.tap({ timeout: 5000 }).catch(async () => {
    // The monkey's last random tap can land a moment later (Quick workout writes its session, then
    // opens the workout over the tabs). That is the app responding, not a stuck screen: go back to
    // the tabs through the UI once more and tap again. A second time is a failure.
    if (lateNavigations > 0 && !(await tabsUp(page))) {
      console.log(`monkey: a late navigation to ${await hashOf(page)} covered the tabs; back through the UI`);
      await toTabs(page);
      return tapTab(page, name, lateNavigations - 1);
    }
    console.log(`monkey: the ${name} tab was not stable after 5 s`, JSON.stringify(await page.evaluate(() => ({ nav: document.documentElement.dataset.nav, sheets: document.documentElement.dataset.sheets, hash: location.hash }))));
    const b = await link.boundingBox({ timeout: 2000 }).catch(() => null);
    expect(b, `the tab bar is gone (${name})`).not.toBeNull();
    await page.touchscreen.tap(b!.x + b!.width / 2, b!.y + b!.height / 2);
  });
}
