import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { insetsOf } from './helpers/layout';
import { firstFix, live, move, openRun, startRun, wake, type Runner } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { numberEm, type DataFieldSize } from '../src/ui/dataFieldFit';

// PLAN M12 and M2 (SPEC 10, 12, 23; M-TEST): the Run tab in Monolith, from the start screen through
// the goal sheets and the countdown to the live data and map pages. Screenshots at the iPhone 15
// (the iPhone 15 Pro's size), the iPhone SE and the 320 x 568 floor land in reports/monolith/m2/
// (small JPEGs); the checks are the real test: no clipping, no sideways scroll, 44 pt targets,
// controls clear of the bottom safe area, at normal and at the largest text size.
//
// Worst case numbers (99.99 mi, 1:59:59, 59:59 per mile) would take hours of synthetic positions,
// so `paintWorst` writes them into the real fields of a real live run, with the same fit variable
// (--df-em, from ui/dataFieldFit) React would give them. Every honest state (no trusted pace, GPS
// lost, an interval run) is a real run state, reached through the real engine.

const PROFILES = ['iPhone 15', 'iPhone SE', '320 floor'];
const DIR = 'reports/monolith/m2';

test.use({ serviceWorkers: 'block', locale: 'en-US' });
test.beforeEach(() => {
  test.skip(!PROFILES.includes(test.info().project.name), 'M2 shots: iPhone 15, iPhone SE and the 320 floor');
});

const tag = () => test.info().project.name.replace(/ /g, '-');
async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${DIR}/${name}-${tag()}.jpg`, type: 'jpeg', quality: 70, animations: 'disabled' });
}

/** The phone's largest text size, as the 130% specs do it: every size and line height x1.3. */
async function largestText(page: Page, scope: string) {
  await page.evaluate((sel) => {
    const all = Array.from(document.querySelectorAll<HTMLElement>(`${sel}, ${sel} *`)).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of all) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);
  await page.waitForTimeout(300);
}

/** Writes printed values into the live run's fields, with the fit React would give them. */
async function paintWorst(page: Page, values: Record<string, string>) {
  const fits: Record<string, string> = {};
  for (const [id, v] of Object.entries(values)) {
    const size = (await page.getByTestId(id).getAttribute('data-size')) as DataFieldSize | null;
    fits[id] = numberEm(v, size ?? 'large').toFixed(3);
  }
  await page.evaluate(
    ([vals, em]) => {
      for (const [id, v] of Object.entries(vals)) {
        const n = document.querySelector<HTMLElement>(`[data-testid="${id}"] [data-value]`)!;
        n.textContent = v;
        n.style.setProperty('--df-em', em[id]!);
      }
    },
    [values, fits] as const,
  );
  await page.waitForTimeout(100);
}

/** Problems: anything off the side or under the bottom safe area, a number wider than its field, sideways scroll. */
async function clipping(page: Page, ids: string[]) {
  const bottomInset = insetsOf().bottom;
  return page.evaluate(
    ([list, inset]) => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      for (const id of list) {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) {
          out.push(`${id}: missing`);
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`${id}: off the side`);
        if (r.top < -0.5 || r.bottom > innerHeight + 0.5) out.push(`${id}: off the screen`);
      }
      for (const f of document.querySelectorAll('[data-testid="live-run"] [data-field]')) {
        const box = f.getBoundingClientRect();
        const n = f.querySelector('[data-value]')!;
        const range = document.createRange();
        range.selectNodeContents(n);
        const ink = range.getBoundingClientRect();
        if (ink.right > box.right + 0.5 || ink.left < box.left - 0.5) out.push(`${f.getAttribute('data-testid')}: number wider than its field`);
        if (ink.right > innerWidth + 0.5) out.push(`${f.getAttribute('data-testid')}: number off the screen`);
      }
      const controls = document.querySelector('[data-testid="live-controls"]');
      if (controls) {
        for (const c of controls.querySelectorAll('button')) {
          const r = c.getBoundingClientRect();
          if (r.bottom > innerHeight - inset + 0.5) out.push(`${c.getAttribute('data-testid')}: under the home indicator`);
        }
      }
      return out;
    },
    [ids, bottomInset] as const,
  );
}

async function targets(page: Page, ids: string[]) {
  for (const id of ids) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.width, `${id} 44 pt wide`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${id} 44 pt tall`).toBeGreaterThanOrEqual(44);
  }
}

test.describe('M12 run start', () => {
  test('start screen, goal sheets, run settings and the pocket explainer: words, lines, no boxes @matrix', async ({ page, context }) => {
    await stubTiles(page);
    await openRun(page, context, { pocket: true });
    await targets(page, ['run-start', 'run-type-free', 'run-type-distance', 'run-type-time', 'run-type-intervals', 'gps-chip', 'run-settings']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, 'start-free');
    await page.getByTestId('run-type-distance').tap();
    await expect(page.getByTestId('goal-sheet-distance')).toBeVisible();
    await shot(page, 'goal-sheet-distance');
    await page.getByTestId('distance-5-km').tap();
    await expect(page.getByTestId('goal-sheet-distance')).toBeHidden();
    await shot(page, 'start-distance');
    await page.getByTestId('run-type-time').tap();
    await expect(page.getByTestId('goal-sheet-time')).toBeVisible();
    await shot(page, 'goal-sheet-time');
    await page.keyboard.press('Escape');
    await page.getByTestId('run-type-intervals').tap();
    await expect(page.getByTestId('goal-sheet-intervals')).toBeVisible();
    await shot(page, 'goal-sheet-intervals');
    await page.getByTestId('interval-beginner').tap();
    await expect(page.getByTestId('goal-sheet-intervals')).toBeHidden();
    await shot(page, 'start-intervals');
    await largestText(page, '[data-testid="run-screen"]');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await shot(page, 'start-intervals-largest-text');
    await page.reload();
    await page.getByTestId('run-settings').tap();
    await expect(page.getByTestId('run-settings-sheet')).toBeVisible();
    await shot(page, 'run-settings');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('run-settings-sheet')).toBeHidden();
    await page.getByTestId('run-start').tap();
    await expect(page.getByTestId('pocket-sheet')).toBeVisible();
    await shot(page, 'pocket-explainer');
  });
});

test.describe('M2 live run', () => {
  test('countdown: one giant white digit, Cancel as words @matrix', async ({ page, context }) => {
    await openRun(page, context);
    await page.getByTestId('run-start').tap();
    await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', '3');
    await targets(page, ['run-count-cancel']);
    await shot(page, 'countdown');
  });

  test('data page: honest blanks at the start, the worst case numbers fit, 44 pt controls @matrix', async ({ page, context }) => {
    const r: Runner = await startRun(page, context);
    await wake(page);
    await shot(page, 'live-data-start-blank');
    await move(r, 30);
    await wake(page);
    const ids = ['live-big', 'live-small-time', 'live-small-pace', 'live-pause', 'live-lock', 'live-end', 'live-controls'];
    await targets(page, ['live-pause', 'live-lock', 'live-end']);
    expect(await clipping(page, ids)).toEqual([]);
    await shot(page, 'live-data');
    await paintWorst(page, { 'live-big-field': '99.99', 'live-small-time': '1:59:59', 'live-small-pace': '59:59' });
    expect(await clipping(page, ids)).toEqual([]);
    await shot(page, 'live-data-worst');
    await largestText(page, '[data-testid="live-run"]');
    expect(await clipping(page, ids)).toEqual([]);
    await shot(page, 'live-data-worst-largest-text');
  });

  test('data page: GPS lost, paused, locked @matrix', async ({ page, context }) => {
    const r: Runner = await startRun(page, context);
    await move(r, 8);
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('live-note')).toHaveText('GPS lost · time on hold');
    await wake(page);
    expect(await clipping(page, ['live-note', 'live-big', 'live-small-pace'])).toEqual([]);
    await shot(page, 'live-data-gps-lost');
    await page.getByTestId('live-pause').tap();
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
    await targets(page, ['live-resume']);
    await shot(page, 'live-data-paused');
    await page.getByTestId('live-resume').tap();
    await page.getByTestId('live-lock').tap();
    await targets(page, ['live-unlock']);
    await shot(page, 'live-locked');
  });

  test('data page: an interval run keeps its ring and RUN or WALK @matrix', async ({ page, context }) => {
    await openRun(page, context);
    await page.getByTestId('run-type-intervals').tap();
    await page.getByTestId('interval-beginner').tap();
    await page.getByTestId('run-start').tap();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await firstFix(page, context);
    const r: Runner = { page, context, north: 0 };
    await move(r, 4);
    await wake(page);
    await expect(page.getByTestId('interval-name')).toHaveText('RUN');
    const ids = ['interval-face', 'live-small-distance', 'live-small-time', 'live-small-pace', 'live-controls'];
    expect(await clipping(page, ids)).toEqual([]);
    await shot(page, 'live-intervals');
    await largestText(page, '[data-testid="live-run"]');
    expect(await clipping(page, ids)).toEqual([]);
    await shot(page, 'live-intervals-largest-text');
  });

  test('map page: the route, one stat row, Pause over the line @matrix', async ({ page, context }) => {
    await stubTiles(page);
    const r: Runner = await startRun(page, context);
    await move(r, 12);
    await page.clock.runFor(40_000);
    r.north += 120;
    await move(r, 10);
    await wake(page);
    await page.getByTestId('live-dot-1').tap();
    await expect(live(page)).toHaveAttribute('data-page', '1');
    await expect(page.getByTestId('live-map')).toHaveAttribute('data-dashed', /[1-9]/);
    await page.waitForTimeout(500); // the page spring settles
    await targets(page, ['live-pause', 'live-lock', 'live-end']);
    expect(await clipping(page, ['live-map-readout', 'live-pause', 'live-controls'])).toEqual([]);
    await shot(page, 'live-map');
  });
});
