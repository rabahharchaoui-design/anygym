import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';
import { dbAll, dbPut, usePlan, watchErrors } from './workout-helpers';
import { card, longPress, pastIntake, PROFILE, swipe } from './helpers/quick';

// PLAN 3.5f: swipe to curate everywhere it helps. The one shared deck in its four places (Quick
// workout, Preview of today's plan day before Start, the intake's love / never screen, Replace),
// many lefts ("Show me 6" after 3 lefts on a slot, the honest end, "Hide it for good?" once after 3
// workouts), a why line on every card that is a fact from data/coach-facts.json with two more
// sentences behind the info button, and the calm card face (name, sets x reps, one why line).

type Fact = { id: string; line: string; more: string };
const FACTS = new Map((JSON.parse(readFileSync('data/coach-facts.json', 'utf8')) as { facts: Fact[] }).facts.map((f) => [f.id, f]));
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A fact's text with its {words} as wildcards: what a card may show for it. */
const shape = (text: string) => new RegExp(`^${esc(text).replace(/\\\{\w+\\\}/g, '.+')}$`);

const shot = async (page: Page, name: string) => {
  const project = test.info().project.name;
  if (!['iPhone SE', 'iPhone 15', 'iPhone 17 Pro Max'].includes(project)) return;
  await page.waitForTimeout(450); // let springs settle
  await page.screenshot({ path: `reports/shots/3.5f/${name}-${project.replace(/ /g, '-')}.png` });
};

/** The top card's why line is a fact of the file, word for word (its {words} filled in). */
async function expectFact(scope: Page | Locator) {
  const why = scope.getByTestId('deck-why');
  await expect(why).toBeVisible();
  const fact = FACTS.get((await why.getAttribute('data-fact')) ?? '');
  expect(fact, 'the line names a fact of data/coach-facts.json').toBeDefined();
  expect((await why.textContent())!.trim()).toMatch(shape(fact!.line));
  return fact!;
}

const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

async function openDeck(page: Page, concept: string, minutes: 15 | 30 | 45 | 60 = 30) {
  await page.getByTestId('build-card').tap();
  await page.getByTestId(`min-${minutes}`).tap();
  await expect(page.getByTestId(`min-${minutes}`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`[data-concept="${concept}"]`).first().tap();
  await expect(card(page)).toBeVisible();
}

const name = (page: Page) => page.getByTestId('deck-name');
const settle = (page: Page) => page.waitForTimeout(420);

test.describe('3.5f the deck in Quick workout', () => {
  test('a calm card: name, sets x reps, one curated why line; the rest behind the info button', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openDeck(page, 'strength');
    // Three things on the face, no badges: the name, sets x reps and the why line.
    await expect(name(page)).toBeVisible();
    await expect(page.getByTestId('deck-sets')).toContainText(/\d+ sets? × /);
    const fact = await expectFact(page);
    await expect(card(page)).not.toContainText('Swapped in');
    await expect(card(page).getByTestId('deck-never')).toHaveCount(0);
    // Two lines under the name, nothing else drawn (the card's place is read out, and shown in the bar).
    // Round 2: the screen reader only place ("1 of 6", 1 px, clipped) is not a drawn line: count the drawn ones.
    const drawn = await card(page).locator('p:visible').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 2).length);
    expect(drawn).toBe(2);
    await expect(page.getByTestId('deck-count')).toHaveText(/^1 of \d+$/);
    // One primary action: Keep is lime; Start is glass until the deck is done.
    await expect(page.getByTestId('quick-start').locator('button')).toHaveAttribute('data-variant', 'secondary');
    // Every control is at least 48 pt.
    for (const id of ['deck-info', 'deck-never', 'deck-swap', 'deck-keep']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.width, id).toBeGreaterThanOrEqual(48);
      expect(box.height, id).toBeGreaterThanOrEqual(48);
    }
    await noSideScroll(page);
    await shot(page, 'quick-deck');
    // The info button: the same line, then the fact's two sentences, then sets and rest.
    await page.getByTestId('deck-info').tap();
    const sheet = page.getByTestId('fact-sheet');
    await expect(sheet).toBeVisible();
    expect((await sheet.getByTestId('fact-more').textContent())!.trim()).toMatch(shape(fact.more));
    await expect(sheet).toContainText(/Rest .+ between sets/);
    await shot(page, 'quick-info');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // The info tap decided nothing.
    await expect(page.getByTestId('deck-count')).toHaveText(/^1 of /);
    // Every card of the deck shows a fact; the last Keep makes Start the lime action.
    const total = Number((await page.getByTestId('deck-count').textContent())!.split(' of ')[1]);
    for (let i = 0; i < total; i++) {
      await expectFact(page);
      await page.getByTestId('deck-keep').tap();
      await settle(page);
    }
    await expect(page.getByTestId('ready-list')).toBeVisible();
    await expect(page.getByTestId('quick-start').locator('button')).toHaveAttribute('data-variant', 'primary');
    expect(errors).toEqual([]);
  });

  test('many lefts: from the third left on a slot the line offers "Show me 6", a tap uses one, and the end is said honestly', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openDeck(page, 'strength', 45);
    const seen: string[] = [];
    // A card with a deep enough pool (3 lefts and still a choice): the line above the card offers "Show me N".
    const six = page.getByTestId('six-sheet');
    const offer = page.getByTestId('show-six');
    let lefts = 0;
    for (let guard = 0; guard < 60 && !(await offer.isVisible()); guard++) {
      seen.push((await name(page).textContent())!);
      // Before the third left the offer is never there.
      await expect(offer).toHaveCount(0);
      if (lefts % 2 === 0) await swipe(page, -260);
      else await page.getByTestId('deck-swap').tap();
      await settle(page);
      lefts++;
      const out = (await page.getByTestId('swap-label').textContent()) === 'No other option here';
      if (out || (lefts >= 3 && !(await offer.isVisible()))) {
        // This slot ran out (or has one move left): keep it, try the next card.
        await page.getByTestId('deck-keep').tap();
        await settle(page);
        lefts = 0;
        seen.length = 0;
      }
    }
    expect(lefts).toBe(3);
    // It never rises by itself: a tap opens it.
    await expect(six).toHaveCount(0);
    expect((await offer.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await offer.tap();
    await expect(six).toBeVisible();
    const options = six.getByTestId('six-option');
    const n = await options.count();
    expect(n).toBeGreaterThan(1);
    expect(n, 'never more than six, never padded').toBeLessThanOrEqual(6);
    const names = await options.allTextContents();
    expect(new Set(names).size).toBe(names.length);
    // Nothing already swiped away comes back in the grid.
    for (const s of seen) expect(names).not.toContain(s);
    await shot(page, 'show-me-6');
    const pick = names[n - 1]!;
    await options.nth(n - 1).tap();
    await expect(six).toBeHidden();
    await expect(name(page)).toHaveText(pick);
    await expectFact(page);
    // Left until nothing is left: every move once, then the honest end, and the card stays.
    const shown = new Set([...seen, pick]);
    for (let guard = 0; guard < 30; guard++) {
      await page.getByTestId('deck-swap').tap();
      await settle(page);
      if (await page.getByTestId('deck-end').isVisible()) break;
      const now = (await name(page).textContent())!;
      expect(shown.has(now), `${now} came back`).toBe(false);
      shown.add(now);
    }
    await expect(page.getByTestId('deck-end')).toHaveText('That is every move your gym has for this');
    await expect(page.getByTestId('show-six')).toHaveCount(0);
    await shot(page, 'honest-end');
    const last = (await name(page).textContent())!;
    await swipe(page, -260);
    await settle(page);
    await expect(name(page)).toHaveText(last);
    // Hide is a button too (the hold's twin), with Undo.
    await page.getByTestId('deck-never').tap();
    await expect(page.getByTestId('deck-hint')).toContainText(`${last} hidden`);
    await page.getByTestId('deck-hint').getByRole('button', { name: 'Undo' }).tap();
    await expect(name(page)).toHaveText(last);
    expect(errors).toEqual([]);
  });

  test('3 lefts on one move across workouts ask once "Hide it for good?"', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openDeck(page, 'strength');
    // The first card that has something to swap in.
    for (let guard = 0; guard < 8; guard++) {
      await page.getByTestId('deck-swap').tap();
      await settle(page);
      if ((await page.getByTestId('swap-label').textContent()) !== 'No other option here') break;
      await page.getByTestId('deck-keep').tap();
      await settle(page);
    }
    type P = { id: string; dislikes?: { soft?: Record<string, number>; never?: string[]; lefts?: Record<string, string[]>; asked?: string[] } };
    const profile = async () => (await dbAll<P>(page, 'profile'))[0]!;
    await expect.poll(async () => Object.keys((await profile()).dislikes?.lefts ?? {}).length).toBe(1);
    const id = Object.keys((await profile()).dislikes!.lefts!)[0]!;
    // One workout so far: not asked.
    await expect(page.getByTestId('hide-ask')).toHaveCount(0);
    // Two earlier workouts already swiped it away. (Round 2: a reload mid deck comes back to the deck;
    // Back first, so the reload is a new visit.)
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    await dbPut(page, { profile: [{ ...PROFILE, dislikes: { lefts: { [id]: ['deck-1', 'deck-2'] } } }] });
    await page.reload();
    await page.getByTestId('min-30').tap();
    await page.locator('[data-concept="strength"]').first().tap();
    await expect(card(page)).toBeVisible();
    // Its card again.
    let found = false;
    for (let guard = 0; guard < 12 && !found; guard++) {
      if ((await card(page).getAttribute('data-exercise')) === id) found = true;
      else {
        await page.getByTestId('deck-keep').tap();
        await settle(page);
        if (await page.getByTestId('ready-list').isVisible()) break;
      }
    }
    expect(found, 'the move is on the deck again').toBe(true);
    await swipe(page, -260);
    const ask = page.getByTestId('hide-ask');
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('Hide it for good?');
    await shot(page, 'hide-for-good');
    await page.getByTestId('hide-no').tap();
    await expect(ask).toBeHidden();
    // Asked once, whatever the answer; saying no never hides it.
    const after = (await profile()).dislikes!;
    expect(after.asked).toEqual([id]);
    expect(after.never ?? []).not.toContain(id);
    expect(after.lefts![id]).toHaveLength(3);
    expect(errors).toEqual([]);
  });

  test('an area day from More ideas: a big lift first, laid out by the smart structure', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.getByTestId('build-card').tap();
    await page.getByTestId('min-45').tap();
    await page.getByTestId('more-focus-chest').tap();
    const chest = page.locator('[data-concept="focus"]');
    await expect(chest.getByTestId('concept-title')).toHaveText('Chest day');
    await shot(page, 'quick-choose');
    await chest.tap();
    await expect(card(page)).toBeVisible();
    // The first card is the big lift, and its line says why it goes first.
    const fact = await expectFact(page);
    expect(fact.id).toBe('first-chest');
    await expect(page.getByTestId('deck-why')).toContainText('first: you lift the most weight while fresh');
    await page.getByTestId('quick-start').tap();
    await expect(page).toHaveURL(/#\/workout\/[^/]+\/[^/]+$/);
    const s = (await dbAll<{ quickStyle?: string; endedAt?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    expect(s.quickStyle).toBe('focus:chest');
    expect(errors).toEqual([]);
  });

  // Round 2 (G's rule 5, calm card face): an idea card shows its title, one why line and
  // "N exercises · ~T min" with the mini map; the style, effort, pairs and rounds, a short card's
  // reason and the gear are behind its ⓘ (48 pt).
  for (const pct of [100, 130])
    test(`calm idea cards at ${pct}%: three things on the face, the rest behind ⓘ`, async ({ page }) => {
      const errors = watchErrors(page);
      await pastIntake(page);
      await page.getByTestId('build-card').tap();
      await page.getByTestId('min-30').tap();
      await expect(page.locator('[data-concept]').first()).toBeVisible();
      if (pct !== 100) await page.evaluate((p) => (document.documentElement.style.fontSize = `${p}%`), pct);
      await page.waitForTimeout(200);
      const cards = page.locator('[data-concept]');
      expect(await cards.count()).toBeLessThanOrEqual(4);
      await expect(page.getByTestId('more-ideas')).toBeVisible();
      for (const c of await cards.all()) {
        await expect(c.getByTestId('concept-meta')).toHaveText(/^\d+ exercises? · ~\d+ min$/);
        await expect(c.getByTestId('concept-why')).not.toHaveText('');
        await expect(c.getByTestId('mini-map')).toHaveCount(1);
        for (const id of ['style-chip', 'effort', 'concept-gear', 'concept-short']) await expect(c.getByTestId(id)).toHaveCount(0);
        const box = (await c.getByTestId('concept-info').boundingBox())!;
        expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
      }
      await noSideScroll(page);
      await shot(page, `round2/idea-cards-${pct}`);
      const first = cards.first();
      const title = (await first.getByTestId('concept-title').textContent())!;
      await first.getByTestId('concept-info').tap();
      const sheet = page.getByTestId('idea-sheet');
      await expect(sheet).toBeVisible();
      await expect(page.getByRole('dialog', { name: `More about ${title}` })).toBeVisible();
      await expect(sheet.getByTestId('style-chip')).not.toHaveText('');
      await expect(sheet.getByTestId('effort').locator('span')).toHaveCount(3);
      await expect(sheet.getByTestId('idea-meta')).toHaveText(/^\d+ exercises? (· \d+ (rounds?|pairs?) )*· ~\d+ min$/);
      await expect(sheet.getByTestId('concept-gear')).toHaveAttribute('aria-label', /^(Uses .+|No equipment)$/);
      await shot(page, `round2/idea-info-${pct}`);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      // The ⓘ never picks the card; the card still does.
      await expect(page.getByTestId('deck-card')).toHaveCount(0);
      await first.tap();
      await expect(card(page)).toBeVisible();
      expect(errors).toEqual([]);
    });

  test('a reload mid deck comes back to the same card with its swaps; Back or Start clears it', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openDeck(page, 'strength', 30);
    // The minutes picked are in the URL.
    await expect(page).toHaveURL(/[?&]min=30\b/);
    await page.getByTestId('deck-keep').tap();
    await expect(page.getByTestId('deck-count')).toHaveText(/^2 of /);
    const before = (await page.getByTestId('deck-name').textContent())!;
    await page.getByTestId('deck-swap').tap();
    await expect(page.getByTestId('deck-name')).not.toHaveText(before);
    const swapped = (await page.getByTestId('deck-name').textContent())!;
    const count = (await page.getByTestId('deck-count').textContent())!;
    await page.reload();
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId('deck-count')).toHaveText(count);
    await expect(page.getByTestId('deck-name')).toHaveText(swapped);
    await expect(page).toHaveURL(/[?&]min=30\b/);
    // Back: the ideas, and a reload stays there.
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    await expect(page.getByTestId('deck-card')).toHaveCount(0);
    await expect(page.getByTestId('min-30')).toHaveAttribute('aria-pressed', 'true');
    // Start: the deck is done with (nothing kept for a reload).
    await page.locator('[data-concept="strength"]').first().tap();
    await expect(card(page)).toBeVisible();
    await page.getByTestId('quick-start').tap();
    await expect(page).toHaveURL(/#\/workout\//);
    expect(await page.evaluate(() => sessionStorage.getItem('anygym.quickDeck'))).toBeNull();
    expect(errors).toEqual([]);
  });

  test('large text (130%) on the deck: nothing clipped sideways, Start in reach', async ({ page }) => {
    await pastIntake(page);
    await openDeck(page, 'strength');
    await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
    await page.waitForTimeout(200);
    await noSideScroll(page);
    for (const id of ['deck-swap', 'deck-never', 'deck-keep', 'deck-info']) await expect(page.getByTestId(id)).toBeVisible();
    await page.getByTestId('quick-start').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('quick-start')).toBeInViewport();
    await shot(page, 'quick-deck-130');
  });
});

test.describe('3.5f Preview today\'s plan day before Start', () => {
  type Sess = { id: string; planId?: string; exerciseIds: string[]; swaps?: Array<{ slot: string; current: string }>; endedAt?: number };
  const active = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined);

  test('Preview opens the day as a deck; nothing starts until Start; a left swaps it for the workout', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await dbPut(page, { profile: [PROFILE] });
    await page.reload();
    const title = (await page.getByTestId('day-card-title').textContent())!;
    // Start stays the one primary action; Preview is a quiet text button beside Change day.
    await expect(page.getByTestId('day-preview')).toHaveAttribute('data-variant', 'tertiary');
    await shot(page, 'today-preview-link');
    await page.getByTestId('day-preview').tap();
    await expect(card(page)).toBeVisible();
    expect(await active(page), 'a preview starts nothing').toBeUndefined();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Quick workout');
    expect(title).toContain((await page.getByRole('heading', { level: 1 }).textContent())!);
    await expectFact(page);
    await shot(page, 'preview-deck');
    // Back: Today again, still nothing started.
    await page.getByRole('button', { name: 'Back to Today' }).tap();
    await expect(page.getByTestId('day-card-title')).toBeVisible();
    expect(await active(page)).toBeUndefined();
    // Again: swap the first card that has another option, then Start.
    await page.getByTestId('day-preview').tap();
    await expect(card(page)).toBeVisible();
    let from = '';
    let to = '';
    for (let guard = 0; guard < 10; guard++) {
      from = (await card(page).getAttribute('data-exercise'))!;
      await swipe(page, -260);
      await settle(page);
      to = (await card(page).getAttribute('data-exercise'))!;
      if (to !== from) break;
      await page.getByTestId('deck-keep').tap();
      await settle(page);
    }
    expect(to).not.toBe(from);
    await expect(page.getByTestId('deck-why')).toContainText(/^(Same movement as|The closest move to)/);
    await page.getByTestId('quick-start').tap();
    await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
    await expect(page.getByTestId('workout-title')).toBeVisible();
    const s = (await active(page))!;
    expect(s.planId, 'it is the plan day').toBeTruthy();
    expect(s.exerciseIds).toContain(to);
    expect(s.exerciseIds).not.toContain(from);
    expect(s.swaps?.some((x) => x.current === to)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('Preview then Start with nothing changed is the same workout as Start', async ({ page }) => {
    await usePlan(page);
    await dbPut(page, { profile: [PROFILE] });
    await page.reload();
    await page.getByTestId('day-preview').tap();
    await expect(card(page)).toBeVisible();
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    const previewed = (await active(page))!;
    // The same day started straight from Today, on a fresh phone.
    await page.evaluate(() => indexedDB.databases().then((all) => Promise.all(all.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null); })))));
    await page.evaluate(() => localStorage.clear());
    await usePlan(page);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    const direct = (await active(page))!;
    expect(previewed.exerciseIds).toEqual(direct.exerciseIds);
    expect(previewed.swaps ?? []).toEqual(direct.swaps ?? []);
  });
});

test.describe('3.5f the intake: exercises you love / never want', () => {
  test.use({ intake: 'fresh' });
  const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
  const FULL = ['barbell_rack', 'flat_bench', 'adjustable_bench', 'dumbbells', 'cable_station', 'leg_press', 'lat_pulldown', 'seated_row', 'pull_up_bar'];
  const draft = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft') ?? '{}') as { answers?: { love?: string[]; never?: string[] } });

  // Round 2 (tester): the card, its three buttons and the footer never overlap, at 100% and 130%
  // text; the card's photo gives way, never the buttons, and nothing scrolls under Continue.
  for (const pct of [100, 130])
    test(`the deck fits between the toggle and Continue at ${pct}%`, async ({ page }) => {
      await page.goto('./');
      await expect(page.getByTestId('intake')).toBeVisible();
      await page.evaluate(([a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'exercises', answers: a })), [{ goal: 'muscle', units: US, experience: '1_2y', place: 'full', equipment: FULL, dumbbellRange: { min: 5, max: 100, step: 5 } }] as const);
      await page.reload();
      await expect(page.getByTestId('ex-deck')).toBeVisible();
      if (pct !== 100) await page.evaluate((p) => (document.documentElement.style.fontSize = `${p}%`), pct);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const body = document.querySelector('[data-scroller]')!;
        return { card: r('[data-testid=deck-card]').bottom, top: Math.min(...['ex-skip', 'ex-never', 'ex-love'].map((id) => r(`[data-testid=${id}]`).top)), bottom: Math.max(...['ex-skip', 'ex-never', 'ex-love'].map((id) => r(`[data-testid=${id}]`).bottom)), h: r('[data-testid=ex-love]').height, cta: r('[data-testid=intake-cta]').top, scroll: body.scrollHeight - body.clientHeight };
      });
      expect(m.card).toBeLessThanOrEqual(m.top + 1);
      expect(m.bottom + 8).toBeLessThanOrEqual(m.cta + 1);
      expect(m.h).toBeGreaterThanOrEqual(48);
      expect(m.scroll).toBeLessThanOrEqual(1);
      await shot(page, `round2/intake-deck-${pct}`);
    });

  test('right loves, left skips, a hold never wants; buttons too; the lists stay one tap away', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.getByTestId('intake')).toBeVisible();
    await page.evaluate(([a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'exercises', answers: a })), [{ goal: 'muscle', units: US, experience: '1_2y', place: 'full', equipment: FULL, dumbbellRange: { min: 5, max: 100, step: 5 } }] as const);
    await page.reload();
    await expect(page.getByTestId('ex-deck')).toBeVisible();
    const fact = await expectFact(page);
    expect(fact.id).toMatch(/^about-/);
    await expect(page.getByTestId('deck-sets')).toHaveCount(0);
    await noSideScroll(page);
    await shot(page, 'intake-deck');
    // Right: love.
    const first = (await card(page).getAttribute('data-exercise'))!;
    await swipe(page, 260);
    await expect(page.getByTestId('ex-mode')).toContainText('Love (1)');
    expect((await draft(page)).answers?.love).toEqual([first]);
    // Left: no opinion, nothing saved.
    const second = (await card(page).getAttribute('data-exercise'))!;
    await swipe(page, -260);
    await settle(page);
    expect((await draft(page)).answers?.love).toEqual([first]);
    expect((await draft(page)).answers?.never ?? []).toEqual([]);
    // A hold: never.
    const third = (await card(page).getAttribute('data-exercise'))!;
    expect(new Set([first, second, third]).size).toBe(3);
    await longPress(page);
    await expect(page.getByTestId('ex-mode')).toContainText('Never (1)');
    expect((await draft(page)).answers?.never).toEqual([third]);
    // The buttons do the same.
    const fourth = (await card(page).getAttribute('data-exercise'))!;
    await page.getByTestId('ex-love').tap();
    await expect(page.getByTestId('ex-mode')).toContainText('Love (2)');
    const fifth = (await card(page).getAttribute('data-exercise'))!;
    await page.getByTestId('ex-never').tap();
    await expect(page.getByTestId('ex-mode')).toContainText('Never (2)');
    await page.getByTestId('ex-skip').tap();
    await settle(page);
    expect((await draft(page)).answers).toMatchObject({ love: [first, fourth], never: [third, fifth] });
    // The info button: two more sentences.
    await page.getByTestId('deck-info').tap();
    await expect(page.getByTestId('fact-more')).toBeVisible();
    await page.keyboard.press('Escape');
    // The lists: searchable, and a loved move can be taken back.
    await page.getByTestId('ex-mode').getByRole('radio', { name: /Love/ }).tap();
    await expect(page.getByTestId('q-love')).toBeVisible();
    await shot(page, 'intake-love-list');
    await page.getByTestId('ex-mode').getByRole('radio', { name: 'Cards' }).tap();
    await expect(page.getByTestId('ex-deck')).toBeVisible();
    // Continue is still the screen's one primary action.
    await expect(page.getByTestId('intake-cta').locator('button[data-variant="primary"]')).toBeEnabled();
    expect(errors).toEqual([]);
  });
});

test.describe('3.5f Replace', () => {
  type Sess = { id: string; exerciseIds: string[]; endedAt?: number };
  const openReplace = async (page: Page, of: string) => {
    // From the day list: the exercise, then its ⋯ menu.
    const more = page.getByRole('button', { name: `More for ${of}` });
    if (!(await more.isVisible())) await page.locator('[data-testid^="row-"]', { hasText: of }).first().tap();
    await more.tap();
    await page.getByTestId('replace-row').tap();
    const sheet = page.getByRole('dialog', { name: `Replace ${of}` });
    await expect(sheet).toBeVisible();
    return sheet;
  };
  const start = async (page: Page) => {
    await usePlan(page);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
  };

  test('the options as a deck: Next shows the next, 3 lefts bring Show all forward, a tap in the list swaps it in', async ({ page }) => {
    const errors = watchErrors(page);
    await start(page);
    const sheet = await openReplace(page, 'Barbell Back Squat');
    await expect(sheet.getByTestId('swap-deck')).toBeVisible();
    const fact = await expectFact(sheet);
    expect(fact.id).toBe('swap-same');
    await expect(sheet.getByTestId('deck-why')).toContainText('Same movement as Barbell Back Squat');
    await shot(page, 'replace-deck');
    // Left (a swipe, then the button): the next option, never the same one twice.
    const seen = [(await sheet.getByTestId('deck-name').textContent())!];
    await swipe(page, -240);
    await settle(page);
    seen.push((await sheet.getByTestId('deck-name').textContent())!);
    await sheet.getByTestId('swap-next').tap();
    await settle(page);
    seen.push((await sheet.getByTestId('deck-name').textContent())!);
    expect(new Set(seen).size).toBe(3);
    // The third left: "Show all" steps forward; a tap lists the options at once, up to six, best first.
    // Round 2: the attribute is present only once offered (its value is the browser's "true").
    await expect(sheet.getByTestId('swap-all')).not.toHaveAttribute('data-offered');
    await sheet.getByTestId('swap-next').tap();
    await settle(page);
    await expect(sheet.getByTestId('swap-all')).toHaveAttribute('data-offered');
    await sheet.getByTestId('swap-all').tap();
    const list = sheet.getByTestId('swap-list');
    await expect(list).toBeVisible();
    const rows = list.locator('[data-testid^="swap-choice-"]');
    expect(await rows.count()).toBeGreaterThan(1);
    expect(await rows.count()).toBeLessThanOrEqual(6);
    await shot(page, 'replace-list');
    const pick = (await rows.first().locator('span span').first().textContent())!;
    await rows.first().tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: `More for ${pick}` })).toBeVisible();
    // Again on another row: right uses the card on top.
    const s = (await dbAll<Sess>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    expect(s.exerciseIds).not.toContain('barbell-back-squat');
    expect(errors).toEqual([]);
  });

  test('Use this on the first card; Back to the plan and Show all stay one tap away', async ({ page }) => {
    await start(page);
    const sheet = await openReplace(page, 'Barbell Back Squat');
    const top = (await sheet.getByTestId('deck-name').textContent())!;
    await sheet.getByTestId('swap-use').tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: `More for ${top}` })).toBeVisible();
    // Back to the plan is still one tap.
    const again = await openReplace(page, top);
    await expect(again.getByTestId('swap-restore')).toContainText('Barbell Back Squat');
    // "Show all" gives the list straight away, without swiping.
    await again.getByTestId('swap-all').tap();
    await expect(again.getByTestId('swap-list')).toBeVisible();
  });
});
