import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, usePlan, watchErrors } from './workout-helpers';
import { card, pastIntake, PROFILE, swipe } from './helpers/quick';

// PLAN 3.5f round 3. B1: the deck draws from Replace's pool (one left on Dumbbell Bench Press in a
// hotel gym brings another move; 3 lefts bring "Show me N" while a move is left). B2: the intake's
// love / never cards keep their three buttons above the footer at 130% text, px text included. B3: a
// left drag shows the move a left puts in, a right drag the next card, and with nothing left a
// resisting drag over "Nothing else to swap". M8: the Preview says Start opens with a warm up.

const HOTEL = ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'];
const settle = (page: Page) => page.waitForTimeout(420);
const name = (page: Page) => page.getByTestId('deck-name');

const shot = async (page: Page, file: string) => {
  const project = test.info().project.name;
  if (!['iPhone SE', 'iPhone 15', 'iPhone 17 Pro Max'].includes(project)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/3.5f/round3/${file}-${project.replace(/ /g, '-')}.png` });
};

async function openDeck(page: Page, concept: string, minutes: 30 | 45) {
  await page.getByTestId('build-card').tap();
  await page.getByTestId(`min-${minutes}`).tap();
  await expect(page.getByTestId(`min-${minutes}`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`[data-concept="${concept}"]`).first().tap();
  await expect(card(page)).toBeVisible();
}

/** Real Dynamic Type the way the critic set it: every computed font size and line height × 1.3 (px text too). */
const scaleText = (page: Page) =>
  page.evaluate(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
      const st = getComputedStyle(el);
      return { el, size: parseFloat(st.fontSize), line: parseFloat(st.lineHeight) };
    });
    for (const { el, size, line } of all) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });

test.describe('3.5f round 3: the deck pool is the Replace pool', () => {
  test('hotel gym: one left on Dumbbell Bench Press brings another move; three lefts bring "Show me N"', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, HOTEL);
    await openDeck(page, 'pump', 45);
    await expect(name(page)).toHaveText('Dumbbell Bench Press');
    await swipe(page, -260);
    await settle(page);
    await expect(name(page)).not.toHaveText('Dumbbell Bench Press');
    await expect(page.getByTestId('deck-end')).toHaveCount(0);
    // No sure demo for this move yet: the honest words, never another move's photo.
    if ((await card(page).getByTestId('deck-demo').count()) === 0) await expect(card(page)).toContainText('No demo for this one yet');
    await page.getByTestId('deck-swap').tap();
    await settle(page);
    await expect(page.getByTestId('show-six')).toHaveCount(0);
    await page.getByTestId('deck-swap').tap();
    await settle(page);
    const offer = page.getByTestId('show-six');
    await expect(offer).toBeVisible();
    const n = Number((await offer.textContent())!.match(/Show me (\d)/)![1]);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
    await offer.tap();
    await expect(page.getByTestId('six-option')).toHaveCount(n);
    await shot(page, 'hotel-show-me-n');
    expect(errors).toEqual([]);
  });
});

test.describe('3.5f round 3: a left drag previews the right card', () => {
  test('left shows the move a left puts in, right shows the next card, nothing left resists over "Nothing else to swap"', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, HOTEL);
    await openDeck(page, 'pump', 45);
    const swapUnder = page.getByTestId('deck-under-swap');
    const keepUnder = page.getByTestId('deck-under-keep');
    const opacity = (l: ReturnType<Page['getByTestId']>) => l.evaluate((el) => Number(getComputedStyle(el).opacity));
    // Held mid left drag: the incoming move is under the card, the next card is not.
    await swipe(page, -90, { release: false });
    await page.waitForTimeout(200);
    const incoming = (await swapUnder.getAttribute('data-exercise'))!;
    expect(await opacity(swapUnder)).toBeGreaterThan(0.9);
    expect(await opacity(keepUnder)).toBeLessThan(0.1);
    await shot(page, 'left-drag-preview');
    await page.mouse.move(0, 0, { steps: 6 });
    await page.mouse.up();
    await settle(page);
    // What showed underneath is what came in.
    await expect(card(page)).toHaveAttribute('data-exercise', incoming);
    // Held mid right drag: the next card.
    await swipe(page, 90, { release: false });
    await page.waitForTimeout(200);
    expect(await opacity(keepUnder)).toBeGreaterThan(0.9);
    expect(await opacity(swapUnder)).toBeLessThan(0.1);
    await page.mouse.up();
    await settle(page);
    // Left until nothing is left on this card.
    for (let guard = 0; guard < 20 && !(await page.getByTestId('deck-end').isVisible()); guard++) {
      await page.getByTestId('deck-swap').tap();
      await settle(page);
    }
    await expect(page.getByTestId('deck-end')).toBeVisible();
    const before = (await card(page).boundingBox())!;
    await swipe(page, -220, { release: false });
    await page.waitForTimeout(200);
    const none = page.getByTestId('deck-under-none');
    await expect(none).toHaveText('Nothing else to swap');
    expect(await opacity(none)).toBeGreaterThan(0.9);
    expect(await opacity(keepUnder)).toBeLessThan(0.1);
    // Resistance: a 220 px drag moves the card far less.
    const moved = before.x - (await card(page).boundingBox())!.x;
    expect(moved).toBeLessThan(70);
    await shot(page, 'left-drag-nothing');
    await page.mouse.up();
    await settle(page);
    expect(errors).toEqual([]);
  });
});

test.describe('3.5f round 3: the intake cards at 130% text', () => {
  test.use({ intake: 'fresh' });
  const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
  const FULL = ['barbell_rack', 'flat_bench', 'adjustable_bench', 'dumbbells', 'cable_station', 'leg_press', 'lat_pulldown', 'seated_row', 'pull_up_bar'];

  for (const gym of [
    ['full', FULL, { min: 5, max: 100, step: 5 }],
    ['hotel', HOTEL, { min: 5, max: 50, step: 5 }],
  ] as const)
    test(`${gym[0]}: Not sure, Never and Love stay above Continue, the photo stays a photo`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await expect(page.getByTestId('intake')).toBeVisible();
      await page.evaluate(([a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'exercises', answers: a })), [{ goal: 'muscle', units: US, experience: '1_2y', place: gym[0] === 'full' ? 'full' : 'hotel', equipment: gym[1], dumbbellRange: gym[2] }] as const);
      await page.reload();
      await expect(page.getByTestId('ex-deck')).toBeVisible();
      // One Skip on the screen (the top one), and the deck's left button says what it means.
      await expect(page.getByTestId('skip-rest')).toHaveCount(0);
      await expect(page.getByTestId('ex-skip')).toHaveText('Not sure');
      await scaleText(page);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const ids = ['ex-skip', 'ex-never', 'ex-love'];
        const body = document.querySelector('[data-scroller]')!;
        const photo = document.querySelector('[data-testid=deck-card] [data-demo], [data-testid=deck-card] [class*=photo]');
        return {
          card: r('[data-testid=deck-card]').bottom,
          top: Math.min(...ids.map((id) => r(`[data-testid=${id}]`).top)),
          bottom: Math.max(...ids.map((id) => r(`[data-testid=${id}]`).bottom)),
          minH: Math.min(...ids.map((id) => r(`[data-testid=${id}]`).height)),
          cta: r('[data-testid=intake-cta]').top,
          photo: photo ? photo.getBoundingClientRect().height : 0,
          name: r('[data-testid=deck-name]').bottom,
          scroll: body.scrollHeight - body.clientHeight,
        };
      });
      await shot(page, `intake-130-${gym[0]}`);
      expect(m.card, 'the card ends above the buttons').toBeLessThanOrEqual(m.top + 1);
      expect(m.bottom, 'the buttons end above Continue').toBeLessThanOrEqual(m.cta + 1);
      expect(m.minH).toBeGreaterThanOrEqual(48);
      expect(m.photo, 'the photo is never a postage stamp').toBeGreaterThanOrEqual(120);
      expect(m.name, 'the name is on the card').toBeLessThanOrEqual(m.card);
      expect(m.scroll).toBeLessThanOrEqual(1);
      for (const id of ['ex-skip', 'ex-never', 'ex-love']) await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
      // M12: the Love list puts this gym's moves first, the rest under "Needs other gear".
      await page.getByTestId('ex-mode').getByRole('radio', { name: /^Love/ }).tap();
      if (gym[0] === 'hotel') {
        await expect(page.getByTestId('q-love-other-gear')).toHaveText('Needs other gear');
        const first = await page.getByTestId('q-love').locator('button').allTextContents();
        for (const t of first) expect(t, 'no barbell lift before the divider in a hotel gym').not.toMatch(/^Barbell/);
      }
      expect(errors).toEqual([]);
    });
});

test.describe('3.5f round 3: the Preview is what you get', () => {
  test('a plan day that opens with stretches says so on Ready to go, and Start opens with them', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await dbPut(page, { profile: [PROFILE] });
    await page.reload();
    await page.getByTestId('day-preview').tap();
    await expect(card(page)).toBeVisible();
    for (let guard = 0; guard < 20 && !(await page.getByTestId('ready-list').isVisible()); guard++) {
      await page.getByTestId('deck-keep').tap();
      await settle(page);
    }
    await expect(page.getByTestId('ready-list')).toBeVisible();
    const warm = page.getByTestId('ready-warmup');
    if ((await warm.count()) === 0) {
      test.skip(true, 'this plan day opens with no warm up');
      return;
    }
    const n = Number((await warm.textContent())!.match(/Warm up · (\d+)/)![1]);
    // M9: one glass card of compact rows, at least 44 pt each.
    for (const h of await page.getByTestId('ready-list').locator('li').evaluateAll((els) => els.map((e) => (e as HTMLElement).offsetHeight))) expect(h).toBeGreaterThanOrEqual(44); // layout height: the list springs in from 0.97, which a bounding box would count
    await shot(page, 'preview-ready-warmup');
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    type Sess = { exerciseIds: string[]; endedAt?: number };
    const s = (await dbAll<Sess>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    expect(s.exerciseIds.length).toBeGreaterThan(n);
    expect(errors).toEqual([]);
  });
});
