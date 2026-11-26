// PLAN M18a: "a 12 set workout showed Time 1 min". The saved start to save time is right (unit tests);
// this checks what a person SEES: the finish screen's Time, every digit whole, inside every box that
// can clip it and the screen, each rolling column landed on the right digit, and the same words in
// History's row and the workout's header. On every iPhone and the 320 floor, at normal and largest
// text, with and without reduced motion, and when the count up is cut short (left, tab hidden).
import { expect, test, type Locator, type Page } from './fixtures';

const MIN = 60_000;
const DAY = 86_400_000;
const SQUAT = 'barbell-back-squat';
const ROW = 'barbell-bent-over-row';
const bar = (total: number) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });
const DURATIONS = [9, 10, 41, 60, 61, 125];

const idb = (page: Page, records: Record<string, unknown[]>) =>
  page.evaluate(
    (recs) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(Object.keys(recs), 'readwrite');
          for (const n of Object.keys(recs)) for (const r of recs[n]!) tx.objectStore(n).put(r);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    records,
  );
const activeGym = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const q = req.result.transaction('gyms', 'readonly').objectStore('gyms').getAll();
          q.onsuccess = () => {
            req.result.close();
            resolve((q.result as { id: string; isActive: boolean }[]).find((g) => g.isActive)?.id ?? null);
          };
          q.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

/**
 * Seeds an earlier workout (so this is not the first, and no record or big moment covers the
 * stats) and a 12 set workout whose stored start to save time is `minutes`. Returns their ids.
 */
async function seed(page: Page): Promise<Record<number, string>> {
  await page.goto('./');
  await expect.poll(() => activeGym(page)).not.toBeNull();
  const gymId = (await activeGym(page))!;
  const sessions: unknown[] = [];
  const sets: unknown[] = [];
  const add = (id: string, start: number, minutes: number, reps: number, exerciseId = SQUAT, total = 135) => {
    sessions.push({ id, gymId, startedAt: start, endedAt: start + minutes * MIN, imported: false, exerciseIds: [exerciseId] });
    for (let i = 0; i < 12; i++) sets.push({ id: `${id}-${i}`, sessionId: id, exerciseId, order: i, kind: 'work', uncertain: false, reps, load: bar(total) });
  };
  const now = Date.now();
  add('time-base', now - 20 * DAY, 50, 8);
  // The widest Total lifted beside the Time (12 x 405 lb x 12 = "58,320 lb"), a tie with its history (no record).
  add('time-base-heavy', now - 19 * DAY, 50, 12, ROW, 405);
  add('time-heavy', now - 11 * DAY, 125, 12, ROW, 405);
  const ids: Record<number, string> = {};
  DURATIONS.forEach((m, i) => {
    ids[m] = `time-${m}`;
    add(ids[m]!, now - (10 - i) * DAY, m, 5);
  });
  await idb(page, { sessions, sets });
  return ids;
}

/** The phone's largest text size, as the 130% specs do it: every size x1.3. */
async function largestText(page: Page) {
  await page.evaluate(() => {
    // Every size is read first, then all are set: a child's size never compounds its parent's.
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
}

type Seen = { shown: string; problems: string[] };

/**
 * What the Time shows on screen: the characters of the visible face (each rolling column read from
 * the transform of its strip, in whole glyph steps) and every way a glyph is cut: a zero box, off
 * the screen, outside an ancestor that clips, or a column resting between two digits.
 */
const seen = (value: Locator): Promise<Seen> =>
  value.evaluate((el) => {
    const problems: string[] = [];
    const face = el.querySelector('[aria-hidden="true"]');
    const inside = (r: DOMRect, b: { left: number; right: number; top: number; bottom: number }) => r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
    // The glyph's own box: a rolling column's window has 0.1em of empty padding above and below
    // (Odometer.module.css .digit --pad), which may be clipped without cutting the digit.
    const glyphBox = (node: Element): DOMRect => {
      const r = node.getBoundingClientRect();
      const cs = getComputedStyle(node);
      const top = parseFloat(cs.paddingTop) || 0;
      const bottom = parseFloat(cs.paddingBottom) || 0;
      return new DOMRect(r.x, r.y + top, r.width, Math.max(0, r.height - top - bottom));
    };
    const check = (node: Element, what: string) => {
      const r = glyphBox(node);
      if (r.width <= 0 || r.height <= 0) problems.push(`${what}: no box`);
      if (!inside(r, { left: 0, top: 0, right: innerWidth, bottom: innerHeight })) problems.push(`${what}: off screen`);
      for (let a = node.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/hidden|clip|scroll|auto/.test(`${s.overflowX} ${s.overflowY}`) || s.clipPath !== 'none') {
          if (!inside(r, a.getBoundingClientRect())) problems.push(`${what}: clipped by ${a.className || a.tagName}`);
        }
      }
    };
    if (!face) {
      check(el, 'words');
      return { shown: el.textContent ?? '', problems };
    }
    let shown = '';
    Array.from(face.children).forEach((c, i) => {
      const literal = c.getAttribute('data-c');
      if (literal !== null) {
        shown += literal;
        if (literal.trim()) check(c, `char ${i}`);
        return;
      }
      const strip = getComputedStyle(c, '::before');
      const ty = strip.transform === 'none' ? 0 : new DOMMatrixReadOnly(strip.transform).m42;
      const step = parseFloat(strip.height) / 10;
      const digit = Math.round(-ty / step);
      if (Math.abs(-ty - digit * step) > 0.5) problems.push(`digit ${i}: between glyphs`);
      shown += String(digit);
      check(c, `digit ${i}`);
    });
    return { shown, problems };
  });

/** Waits until the count up has landed: the face shows the words and no animation is left on it. */
async function settled(value: Locator, words: string) {
  await expect.poll(async () => (await seen(value)).shown).toBe(words);
  await expect.poll(() => value.evaluate((el) => document.getAnimations().filter((a) => el.contains((a.effect as KeyframeEffect | null)?.target as Node)).length)).toBe(0);
}

/** Opens a workout's finish screen and checks its Time as a person sees it, once the count up has landed. */
async function finishTime(page: Page, id: string, words: string, opts: { large: boolean; motion: string }) {
  await page.goto(`./#/workout/${id}/done`);
  const value = page.getByTestId('finish-duration');
  await expect(value).toHaveText(words);
  if (opts.large) await largestText(page);
  await value.scrollIntoViewIfNeeded();
  await settled(value, words);
  const s = await seen(value);
  const box = (await value.boundingBox())!;
  const face = await value.evaluate((el) => el.querySelector('[aria-hidden="true"]')?.getBoundingClientRect().width ?? 0);
  expect(s.problems, `${words} ${opts.large ? 'largest text' : 'normal text'} ${opts.motion}: ${s.problems.join('; ')} (value ${box.width.toFixed(1)} wide, number ${face.toFixed(1)})`).toEqual([]);
  // The Time never runs into the Sets tile beside it.
  const time = (await value.boundingBox())!;
  const sets = (await page.getByTestId('finish-sets').boundingBox())!;
  expect(time.x + time.width <= sets.x + 0.5 || time.y + time.height <= sets.y + 0.5 || sets.y + sets.height <= time.y + 0.5, `${words} overlaps Sets`).toBe(true);
}

/** The same words in History: the row's main number and the workout's header, whole (no ellipsis, inside the screen). */
async function historyTime(page: Page, id: string, words: string) {
  await page.goto('./#/history');
  const row = page.locator(`[data-testid="history-row"][href$="/history/${id}"]`);
  await row.scrollIntoViewIfNeeded();
  const main = row.getByText(words, { exact: true });
  await expect(main).toBeVisible();
  const whole = (l: Locator) => l.evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5 && el.getBoundingClientRect().right <= innerWidth + 0.5 && el.getBoundingClientRect().left >= -0.5);
  expect(await whole(main), `${words} cut in the History row`).toBe(true);
  await row.tap();
  const meta = page.getByTestId('history-meta');
  await expect(meta).toContainText(words);
  expect(await whole(meta), `${words} cut in the workout header`).toBe(true);
}

for (const minutes of DURATIONS) {
  const words = `${minutes} min`;
  test(`M18a Time "${words}" for 12 sets: every digit whole and right on the finish screen, normal and largest text, with and without reduced motion; History agrees @matrix`, async ({ page }) => {
    test.setTimeout(120_000);
    const ids = await seed(page);
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion });
      for (const large of [false, true]) await finishTime(page, ids[minutes]!, words, { large, motion: reducedMotion });
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await historyTime(page, ids[minutes]!, words);
  });
}

test('M18a Time "125 min" beside the widest Total lifted ("58,320 lb"): still whole, normal and largest text @matrix', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  for (const large of [false, true]) await finishTime(page, 'time-heavy', '125 min', { large, motion: 'no-preference' });
  await expect(page.getByTestId('finish-total')).toHaveText('58,320 lb');
  // Known, for M18b's stats redesign (not the Time): at largest text on the 320 floor the unit of a
  // 5 digit Total lifted ("58,320 l") is cut by its tile's ellipsis. Noted, not asserted here.
  const total = await seen(page.getByTestId('finish-total'));
  if (total.problems.length) test.info().annotations.push({ type: 'M18b', description: `Total lifted cut: ${total.problems.join('; ')}` });
});

test('M18a Time: a count up cut short (the screen left, the tab hidden) still lands on the right digits @matrix', async ({ page, context }) => {
  test.setTimeout(120_000);
  const ids = await seed(page);
  const value = page.getByTestId('finish-duration');
  for (const minutes of [41, 125]) {
    const words = `${minutes} min`;
    // Left mid count up, then opened again.
    await page.goto(`./#/workout/${ids[minutes]}/done`);
    await expect(value).toHaveText(words);
    await page.goto('./#/history');
    await page.goto(`./#/workout/${ids[minutes]}/done`);
    await settled(value, words);
    expect((await seen(value)).problems).toEqual([]);
    // The tab hidden mid count up (another tab in front), then shown again.
    await page.goto('./#/');
    await page.goto(`./#/workout/${ids[minutes]}/done`);
    const other = await context.newPage();
    await other.bringToFront();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await other.close();
    await page.bringToFront();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(value).toHaveText(words);
    await settled(value, words);
    expect((await seen(value)).problems).toEqual([]);
  }
});
