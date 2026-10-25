import { expect, test, type BrowserContext, type Page } from './fixtures';
import { dbAll } from './workout-helpers';
import { killHard, launchPersistent, newProfileDir, relaunchOffline, removeProfileDir } from './helpers/kill';

// SPEC 13.3: the app killed mid workout restores exactly where it was (codex bughunt 0800 #6).
// A reload lets pagehide and unload run; here the browser process gets SIGKILL with a persistent
// profile (like iOS ending the app), then the same profile is opened again OFFLINE (the service
// worker serves the app). Every piece of state is compared with what was there before the kill:
// the workout, the screen (route and exercise), the pending row's draft values, the running hold,
// the rest deadline and every committed set.
//
// Relaunch: a phone that ends the app in the background brings back its last URL, so the test
// opens the same URL. Opening start_url instead shows the resume bar into the same workout
// (checked in the first test). Runs with each project's browser (WebKit or Chromium).

const STORAGE_KEYS = ['anygym-drafts', 'anygym-rest', 'anygym-extra-sets'] as const;
const storage = (page: Page) => page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), [...STORAGE_KEYS]);
const sorted = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

type Snapshot = { url: string; storage: Record<string, string | null>; sessions: unknown[]; sets: unknown[]; submissions: unknown[] };
async function snapshot(page: Page): Promise<Snapshot> {
  return {
    url: page.url(),
    storage: await storage(page),
    sessions: sorted(await dbAll<{ id: string }>(page, 'sessions')),
    sets: sorted(await dbAll<{ id: string }>(page, 'sets')),
    submissions: sorted(await dbAll<{ id: string }>(page, 'submissions')),
  };
}

const firstPage = async (ctx: BrowserContext) => ctx.pages()[0] ?? (await ctx.newPage());

/** Opens the app once online so the service worker installs (the first launch from the Home Screen). */
async function firstLaunch(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'), { timeout: 15_000 }).toBe('activated');
}

async function addOne(page: Page, query: string, name: string) {
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}

test.describe('killed mid workout, relaunched offline', () => {
  test.describe.configure({ retries: 0 });
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  test('mid draft and mid rest: route, draft weight and reps, rest deadline and committed sets come back exactly', async ({}, info) => {
    const dir = newProfileDir();
    let ctx: BrowserContext | null = null;
    try {
      ctx = await launchPersistent(info, dir);
      let page = await firstPage(ctx);
      await firstLaunch(page);
      await addOne(page, 'back squat', 'Barbell Back Squat');
      const view = () => page.getByTestId('exercise-barbell-back-squat');
      // Set 1: 135, logged (committed), which starts the rest ring.
      await view().getByTestId('weight-cell').first().tap();
      const picker = page.getByRole('dialog', { name: 'Pick the weight' });
      await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
      await picker.getByRole('button', { name: 'Done' }).tap();
      await expect(picker).toHaveCount(0);
      await view().getByTestId('check-current').tap();
      await expect(view().getByTestId('set-row')).toHaveCount(1);
      await expect(page.getByTestId('rest-timer')).toBeVisible();
      // Set 2, not logged: 155 and one more rep (the draft).
      await view().getByTestId('weight-cell').first().tap();
      await picker.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
      await picker.getByRole('button', { name: 'Done' }).tap();
      await expect(picker).toHaveCount(0);
      const repsBefore = Number(await view().getByTestId('reps-cell').first().textContent());
      await view().getByTestId('reps-cell').first().tap();
      await view().getByRole('button', { name: 'More reps' }).tap();
      await view().getByRole('button', { name: 'Done', exact: true }).tap();
      await expect(view().getByTestId('reps-cell').first()).toHaveText(String(repsBefore + 1));
      await expect(view().getByTestId('weight-cell').first()).toHaveText('155');
      const check = await view().getByTestId('check-current').getAttribute('aria-label');
      const before = await snapshot(page);
      expect(JSON.parse(before.storage['anygym-rest']!)).toMatchObject({ endsAt: expect.any(Number) });
      expect(before.sets).toHaveLength(1);
      expect(before.url).toMatch(/#\/workout\/[\w-]+\/barbell-back-squat$/);

      await killHard(ctx, dir);
      ctx = await relaunchOffline(info, dir);
      page = await firstPage(ctx);
      await page.goto(before.url);
      await expect(view()).toBeVisible();
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
      // Every stored piece is exactly as before the kill.
      const after = await snapshot(page);
      expect(after).toEqual(before);
      // And the screen shows it: one logged set, the draft row, the same ✓, the rest still counting.
      await expect(view().getByTestId('set-row')).toHaveCount(1);
      await expect(view().getByTestId('weight-cell').first()).toHaveText('155');
      await expect(view().getByTestId('reps-cell').first()).toHaveText(String(repsBefore + 1));
      await expect(view().getByTestId('check-current')).toHaveAttribute('aria-label', check!);
      await expect(page.getByTestId('rest-timer')).toBeVisible();
      const left = Math.round((JSON.parse(before.storage['anygym-rest']!).endsAt - Date.now()) / 1000);
      const shown = await page.getByTestId('rest-clock').textContent();
      const [m, s] = shown!.trim().split(':').map(Number);
      expect(Math.abs(m! * 60 + s! - left)).toBeLessThanOrEqual(2);
      // Logging the draft offline writes exactly those values, once.
      await view().getByTestId('check-current').tap();
      await expect(view().getByTestId('set-row')).toHaveCount(2);
      const sets = (await dbAll<{ order: number; reps: number; load: { total: number } }>(page, 'sets')).sort((a, b) => a.order - b.order);
      expect(sets.map((x) => [x.load.total, x.reps])).toEqual([
        [135, (before.sets[0] as { reps: number }).reps],
        [155, repsBefore + 1],
      ]);

      // From start_url (the app opened fresh): the resume bar leads back into the same workout.
      await page.goto('./');
      await page.getByRole('button', { name: /^Resume Quick workout · in progress · 2 sets/ }).tap();
      await expect(page).toHaveURL(new RegExp(`#/workout/${(before.sessions[0] as { id: string }).id}`));
    } finally {
      await ctx?.close().catch(() => {});
      removeProfileDir(dir);
    }
  });

  test('mid hold: the running stopwatch keeps its start, and shows the right time after the relaunch', async ({}, info) => {
    const dir = newProfileDir();
    let ctx: BrowserContext | null = null;
    try {
      ctx = await launchPersistent(info, dir);
      let page = await firstPage(ctx);
      await firstLaunch(page);
      await addOne(page, 'plank', 'Plank');
      const view = () => page.getByTestId('exercise-plank');
      await view().getByTestId('hold-cell').first().tap();
      await expect(view().getByTestId('hold-cell').first()).toHaveAttribute('data-hold', 'running');
      await page.waitForTimeout(2500);
      const before = await snapshot(page);
      const drafts = JSON.parse(before.storage['anygym-drafts']!);
      const watch = (Object.values(drafts).flatMap((d) => Object.values(d as object)) as Array<{ watch?: { startedAt: number | null } }>).find((d) => d?.watch)?.watch;
      expect(watch?.startedAt).toEqual(expect.any(Number));

      await killHard(ctx, dir);
      ctx = await relaunchOffline(info, dir);
      page = await firstPage(ctx);
      await page.goto(before.url);
      await expect(view()).toBeVisible();
      expect(await snapshot(page)).toEqual(before);
      await expect(view().getByTestId('hold-cell').first()).toHaveAttribute('data-hold', 'running');
      // The clock reads the time since the stored start (within 2 s), the kill did not pause it.
      const expected = Math.floor((Date.now() - watch!.startedAt!) / 1000);
      const text = (await view().getByTestId('timer-clock').textContent())!.trim();
      const shown = text.includes(':') ? Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]) : Number(text.replace(/\D/g, ''));
      expect(Math.abs(shown - expected)).toBeLessThanOrEqual(2);
      expect(expected).toBeGreaterThanOrEqual(2); // it kept counting through the kill
    } finally {
      await ctx?.close().catch(() => {});
      removeProfileDir(dir);
    }
  });
});
