// PLAN 3.6i: the approved 3D icon set on the intake's goal tiles and place cards and on the Quick
// workout style cards. Each tile shows its picture in a slot that has its size before the picture
// arrives (nothing moves); the line icon shows while it loads, when it cannot load and when the phone
// saves data; the 20 icons are precached, so they show offline after one visit, and a phone whose
// cache has none of them still works with the line icons.
// Screenshots for the report: SHOTS_36I=1 writes /tmp/shots-3.6i/<name>-<phone>.png.
import { allowConsoleErrors, expect, test, type Locator, type Page } from './fixtures';
import { checkContrast } from './helpers/contrast';
import { checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { pastIntake } from './helpers/quick';

const GOALS = ['muscle', 'strength', 'fat_loss', 'tone', 'health', 'athletic', 'race', 'comeback'];
const PLACES = ['full', 'hotel', 'home', 'outdoors', 'mix'];
const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const TO_PLACE = { goal: 'muscle', goals: ['muscle'], units: US, days: 4, minutes: 45, experience: '3y' };
const ICON_URL = /\/icons3d\/[^/]+\.(avif|webp)(\?|$)/;

const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS_36I) await page.screenshot({ path: `/tmp/shots-3.6i/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

/** The intake at `step`, with the answers before it. */
async function intakeAt(page: Page, step: 'goal' | 'place') {
  // Never the load event: a test may be holding the pictures back, and the first step shows some.
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('intake')).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, step === 'goal' ? {} : TO_PLACE] as const);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', step);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
}

async function quickList(page: Page) {
  await pastIntake(page);
  await page.goto('./#/quick?min=30');
  await expect(page.locator('[data-concept]').first()).toBeVisible();
}

const slots = (page: Page) => page.locator('[data-icon3d]');
/** The goal tile's picture slot: 28 pt on every phone since M13 and M15 (IntakeRows.module.css). */
const GOAL_SLOT = 28;

/** Where every tile and its words are, relative to the first tile (so a scroll changes nothing). */
const boxes = (page: Page, tiles: string, words: string) =>
  page.evaluate(
    ([t, w]) => {
      const all = [...document.querySelectorAll(t!)];
      const o = all[0]!.getBoundingClientRect();
      const at = (el: Element) => {
        const r = el.getBoundingClientRect();
        return [r.left - o.left, r.top - o.top, r.width, r.height].map((n) => Math.round(n * 10) / 10);
      };
      return all.map((el) => [at(el), ...[...el.querySelectorAll(w!)].map(at)]);
    },
    [tiles, words] as const,
  );

/** Every slot shows its decoded picture, square, at `size`, with the line icon faded out under it. */
async function expectPictures(page: Page, size: number, names: string[]) {
  await expect(slots(page)).toHaveCount(names.length);
  for (const [i, name] of names.entries()) {
    const slot = slots(page).nth(i);
    await slot.scrollIntoViewIfNeeded();
    await expect(slot).toHaveAttribute('data-icon3d', name);
    await expect(slot).toHaveAttribute('data-state', 'shown');
    await expect(slot).toHaveAttribute('aria-hidden', 'true');
    const img = slot.locator('img');
    await expect(img).toHaveAttribute('alt', '');
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(img).toHaveAttribute('decoding', 'async');
    await expect(slot.locator('source[type="image/avif"]')).toHaveCount(1);
    const read = await img.evaluate((el: HTMLImageElement) => {
      const r = el.getBoundingClientRect();
      const s = el.parentElement!.parentElement!.getBoundingClientRect();
      return { natural: el.naturalWidth, attrs: [el.getAttribute('width'), el.getAttribute('height')], src: el.currentSrc, box: [r.width, r.height], slot: [s.width, s.height], opacity: getComputedStyle(el).opacity };
    });
    expect(read.natural, `${name} decoded`).toBeGreaterThan(0);
    expect(read.attrs, `${name} width and height set`).toEqual([String(read.natural), String(read.natural)]);
    expect(read.src).toMatch(new RegExp(`/icons3d/${name}\\.(avif|webp)$`));
    expect(read.slot, `${name} slot`).toEqual([size, size]);
    expect(read.box, `${name} fills its slot`).toEqual([size, size]);
    await expect(img).toHaveCSS('opacity', '1');
    await expect(slot.locator('svg')).toHaveCSS('opacity', '0');
  }
}

/** Every slot shows only its line icon: no picture in the page. */
async function expectLines(page: Page, count: number) {
  await expect(slots(page)).toHaveCount(count);
  await expect(page.locator('[data-icon3d][data-state="line"]')).toHaveCount(count);
  await expect(page.locator('[data-icon3d] img')).toHaveCount(0);
  for (const svg of await page.locator('[data-icon3d] svg').all()) await expect(svg).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-icon3d] svg')).toHaveCount(count);
}

test.beforeEach(async ({ page }) => {
  await simulateSafeAreas(page);
});

/** The text is whole once it is scrolled to (a screen at 130% text may scroll). */
const wholeInView = async (l: Locator) => {
  await l.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  return fullyShown(l);
};

const styleNames = (page: Page) => page.locator('[data-concept] [data-icon3d]').evaluateAll((els) => els.map((el) => el.getAttribute('data-icon3d')!));

// The service worker is off here, so the test can hold and block the picture requests itself.
test.describe('3D icons: pictures, slots and the line icon', () => {
  test.use({ serviceWorkers: 'block' });

  /** Holds every icon request until `release()`: the screen is read first with the line icons only. */
  async function hold(page: Page) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(ICON_URL, async (route) => {
      await gate;
      await route.continue();
    });
    return release;
  }

  test.describe('intake', () => {
    test.use({ intake: 'fresh' });

    test('the 8 goal tiles: line icon first, then the picture in the same slot, nothing moves; picked stays clear', async ({ page }) => {
      const release = await hold(page);
      await intakeAt(page, 'goal');
      await expect(page.locator('[data-icon3d][data-state="wait"]')).toHaveCount(8);
      await expect(slots(page).first().locator('svg')).toHaveCSS('opacity', '1');
      const before = await boxes(page, '[data-testid="q-goal"] > button', '[data-icon3d], span[class*="label"]');
      release();
      await expectPictures(page, GOAL_SLOT, GOALS.map((g) => `goal-${g}`));
      expect(await boxes(page, '[data-testid="q-goal"] > button', '[data-icon3d], span[class*="label"]')).toEqual(before);
      // The words on the tiles are the same words.
      await expect(page.getByTestId('q-goal-muscle')).toHaveText('Build muscle');
      await shot(page, 'goal');
      await page.getByTestId('q-goal-muscle').tap();
      await page.getByTestId('q-goal-health').tap();
      await expect(page.getByTestId('q-goal-muscle')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('q-goal-muscle-tag')).toHaveText('Main');
      await expect(page.getByTestId('q-goal-health-tag')).toHaveText('Also');
      // checkLayout waits for the press spring to settle; then every tile and label is where it was.
      await checkLayout(page, { primary: page.getByRole('button', { name: 'Continue' }) });
      expect(await boxes(page, '[data-testid="q-goal"] > button', '[data-icon3d], span[class*="label"]')).toEqual(before);
      await checkContrast(page);
      await shot(page, 'goal-picked');
    });

    test('the 5 place cards: the picture in a 28 pt slot, nothing moves', async ({ page }) => {
      const release = await hold(page);
      await intakeAt(page, 'place');
      await expect(page.locator('[data-icon3d][data-state="wait"]')).toHaveCount(5);
      const before = await boxes(page, '[data-testid="q-place"] button', '[data-icon3d], span[class*="text"], [data-ring]');
      release();
      // 28 pt on every phone since M13 and M15 (IntakeRows.module.css, ChoiceCard.module.css).
      await expectPictures(page, 28, PLACES.map((p) => `place-${p}`));
      expect(await boxes(page, '[data-testid="q-place"] button', '[data-icon3d], span[class*="text"], [data-ring]')).toEqual(before);
      await expect(page.getByTestId('q-place-hotel')).toContainText('Hotel gyms');
      await checkLayout(page);
      await checkContrast(page);
      await shot(page, 'place');
    });

    for (const step of ['goal', 'place'] as const) {
      test(`${step}: 130% text keeps every label whole and the layout sound`, async ({ page }) => {
        await intakeAt(page, step);
        await expect(page.locator('[data-icon3d][data-state="shown"]')).toHaveCount(step === 'goal' ? 8 : 5);
        await scaleText(page);
        await checkLayout(page);
        await shot(page, `${step}-130`);
        for (const label of await page.locator(`[data-testid="q-${step}"] button span[class*="label"]`).all()) expect(await wholeInView(label), await label.innerText()).toBe(true);
      });
    }

    test('a blocked picture: the line icons stay, the tiles work', async ({ page }) => {
      allowConsoleErrors(/icons3d/);
      await page.route(ICON_URL, (route) => route.abort());
      await intakeAt(page, 'goal');
      await expectLines(page, 8);
      await page.getByTestId('q-goal-tone').tap();
      await expect(page.getByTestId('q-goal-tone')).toHaveAttribute('aria-pressed', 'true');
      await checkLayout(page, { primary: page.getByRole('button', { name: 'Continue' }) });
      await shot(page, 'goal-blocked');
    });

    test('a phone saving data: no picture is asked for, the line icons show', async ({ page }) => {
      const asked: string[] = [];
      page.on('request', (r) => ICON_URL.test(r.url()) && asked.push(r.url()));
      await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }));
      await intakeAt(page, 'place');
      await expectLines(page, 5);
      await intakeAt(page, 'goal');
      await expectLines(page, 8);
      expect(asked).toEqual([]);
    });

    test('reduced motion: the picture and the line icon swap with no transition or animation', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await intakeAt(page, 'goal');
      await expect(page.locator('[data-icon3d][data-state="shown"]')).toHaveCount(8);
      const moving = await page.locator('[data-icon3d], [data-icon3d] *').evaluateAll((els) =>
        els.filter((el) => { const s = getComputedStyle(el); return s.animationName !== 'none' || s.transitionDuration.split(',').some((d) => parseFloat(d) > 0); }).map((el) => el.tagName),
      );
      expect(moving).toEqual([]);
    });
  });

  test('Quick workout: each style card carries its picture over the title, the card keeps its place and size', async ({ page }) => {
    const release = await hold(page);
    await quickList(page);
    const names = await styleNames(page);
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const n of names) expect(n).toMatch(/^style-(circuit|pump|strength|cardioCore|mobility|armsAbs|easy)$/);
    const before = await boxes(page, '[data-concept]', '[data-icon3d], [data-testid="concept-title"], [data-testid="concept-meta"]');
    release();
    await expectPictures(page, 44, names);
    expect(await boxes(page, '[data-concept]', '[data-icon3d], [data-testid="concept-title"], [data-testid="concept-meta"]')).toEqual(before);
    // Decoration only: the muscle picture is still the app's own drawing, never the 3D art.
    await expect(page.locator('[data-concept] [class*="conceptMap"] img')).toHaveCount(0);
    await page.evaluate(() => document.querySelector('[data-concept]')!.scrollIntoView({ block: 'center' }));
    await checkLayout(page);
    await checkContrast(page);
    await shot(page, 'quick');
    await scaleText(page);
    await checkLayout(page);
    for (const title of await page.getByTestId('concept-title').all()) expect(await wholeInView(title), await title.innerText()).toBe(true);
    await shot(page, 'quick-130');
  });

  test('Quick workout, blocked pictures: the line icons stay and a card still opens', async ({ page }) => {
    allowConsoleErrors(/icons3d/);
    await page.route(ICON_URL, (route) => route.abort());
    await quickList(page);
    const count = (await styleNames(page)).length;
    for (const slot of await slots(page).all()) await slot.scrollIntoViewIfNeeded();
    await expectLines(page, count);
    await shot(page, 'quick-blocked');
    await page.getByTestId('concept-pick').first().tap();
    await expect(page.getByTestId('deck-card')).toBeVisible();
  });
});

/** The same 130% computed font and line height scaling as the text-130 specs. */
async function scaleText(page: Page) {
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(150);
}

// The real service worker: the icons are part of the precache.
test.describe('3D icons offline', () => {
  /** The service worker has installed (its precache is whole) and controls this page. */
  async function controlled(page: Page) {
    await page.evaluate(async () => void (await navigator.serviceWorker.ready));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  }
  const cachedIcons = (page: Page) =>
    page.evaluate(async () => {
      let n = 0;
      for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) if (/\/icons3d\/[^/]+\.(avif|webp)/.test(req.url)) n++;
      return n;
    });
  const shown = (l: Locator) => l.evaluateAll((els) => els.filter((el) => el.getAttribute('data-state') === 'shown' && (el.querySelector('img')?.naturalWidth ?? 0) > 0).length);

  test.describe('intake', () => {
    test.use({ intake: 'fresh' });

    test('after one online visit the goal tiles and place cards show their pictures with no network', async ({ page, context }) => {
      await page.goto('./');
      await controlled(page);
      // Both formats of the 20 icons, and none of the art that waits for its screen.
      expect(await cachedIcons(page)).toBe(40);
      await context.setOffline(true);
      try {
        await intakeAt(page, 'goal');
        await expect.poll(() => shown(slots(page))).toBe(8);
        await shot(page, 'goal-offline');
        await intakeAt(page, 'place');
        await expect.poll(() => shown(slots(page))).toBe(5);
      } finally {
        await context.setOffline(false);
      }
    });
  });

  test('after one online visit Quick workout shows its pictures with no network', async ({ page, context }) => {
    await pastIntake(page);
    await controlled(page);
    await context.setOffline(true);
    try {
      await page.goto('./#/quick?min=30');
      await expect(page.locator('[data-concept]').first()).toBeVisible();
      const count = (await styleNames(page)).length;
      expect(count).toBeGreaterThanOrEqual(3);
      for (const slot of await slots(page).all()) await slot.scrollIntoViewIfNeeded();
      await expect.poll(() => shown(slots(page))).toBe(count);
    } finally {
      await context.setOffline(false);
    }
  });

  test('offline with none of the icons in the cache: the line icons show and Quick workout still works', async ({ page, context }) => {
    // The service worker still lists the icons, so it reports each miss itself: errors this test provokes on purpose.
    allowConsoleErrors(/Load failed/, /icons3d/);
    await pastIntake(page);
    await controlled(page);
    // A phone whose saved app has no icons (an older install): the pictures were never fetched by this page.
    await page.evaluate(async () => {
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const req of await cache.keys()) if (req.url.includes('/icons3d/')) await cache.delete(req);
      }
    });
    expect(await cachedIcons(page)).toBe(0);
    await context.setOffline(true);
    try {
      await page.goto('./#/quick?min=30');
      await expect(page.locator('[data-concept]').first()).toBeVisible();
      const count = (await styleNames(page)).length;
      for (const slot of await slots(page).all()) await slot.scrollIntoViewIfNeeded();
      await expectLines(page, count);
      await shot(page, 'quick-offline-cold');
      await page.getByTestId('concept-pick').first().tap();
      await expect(page.getByTestId('deck-card')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
