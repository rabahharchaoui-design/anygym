import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, shotOn, watchErrors } from './workout-helpers';
import { card, pastIntake, PROFILE, readIdea, readIdeas } from './helpers/quick';

// PLAN 3.5b (G, Nov 8): Quick workout ideas, diverse and full. Four cards that differ by style, each
// with a style chip, the gear it uses, 3 effort dots, the mini muscle map and "N exercises · M
// supersets · ~T min"; a More ideas row that swaps card 4; nothing empty below on an iPhone 15; the
// SE at 130% scrolls cleanly; beginners get an Easy start; Start carries sets, reps, rest and
// supersets into the workout.

// 3.5b round 4 (M9, SPEC 13.1): one vocabulary: "pairs" and "rounds" (never supersets, never "1 circuit").
const META = /^(\d+) exercises? (?:· (\d+) (rounds?|pairs?) )*· ~(\d+) min$/;
const SHOTS = ['iPhone SE', 'iPhone 15'];

async function openQuick(page: Page, minutes = 30) {
  await page.goto(`./#/quick?min=${minutes}`);
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  await expect(page.locator('[data-concept]').first()).toBeVisible();
}

const ids = (page: Page) => page.locator('[data-concept]').evaluateAll((els) => els.map((e) => e.getAttribute('data-concept')!));

/** The finished state of a card, as the person reads it. 3.5f: calm card face: the chip, dots, gear and
    the full count line are behind the card's info button (readIdeas opens it). */
const readCards = readIdeas;

test.describe('Quick workout ideas: diverse and full', () => {
  test('four distinct cards with a chip, gear, dots, a map and the count line at 15, 30, 45 and 60 @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page, 30);
    for (const m of [15, 30, 45, 60]) {
      await page.getByTestId(`min-${m}`).tap();
      await expect(page.getByTestId(`min-${m}`)).toHaveAttribute('aria-pressed', 'true');
      // 3.5b round 4 (M12): a full gym has 4 diverse cards at every length, and a More ideas row.
      await expect(page.locator('[data-concept]')).toHaveCount(4);
      await expect(page.getByTestId('more-ideas')).toBeVisible();
      await expect(page.getByTestId('quick-fewer')).toHaveCount(0);
      const cards = await readCards(page);
      expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
      expect(new Set(cards.map((c) => c.title)).size).toBe(cards.length);
      for (const c of cards) {
        expect(c.chip, c.id).toMatch(/^(Pairs|Circuit|Strength|Low impact|Straight sets|Your plan)$/);
        expect(c.dots).toBe(3);
        expect(c.level).toBeGreaterThanOrEqual(1);
        expect(c.level).toBeLessThanOrEqual(3);
        expect(c.gear > 0 || c.noGear, `${c.id} gear`).toBe(true);
        expect(c.map, `${c.id} map`).toBe(1);
        expect(c.why.length).toBeGreaterThan(8);
        // 3.5f: calm card face: the face says only "N exercises · ~T min", the same numbers as behind ⓘ.
        expect(c.face, c.id).toBe(c.meta.replace(/ · \d+ (rounds?|pairs?)/g, ''));
        const mm = c.meta.match(META);
        expect(mm, `${c.id}: ${c.meta}`).not.toBeNull();
        expect(Number(mm![4])).toBeLessThanOrEqual(m);
      }
      // G: 30 min is 5 to 6 moves with 2 supersets (the pump says so on its line).
      if (m === 30) expect(cards.some((c) => /^[56] exercises · 2 pairs · ~\d+ min$/.test(c.meta))).toBe(true);
      if (m === 15) expect(cards.some((c) => / · \d+ rounds · /.test(c.meta))).toBe(true);
      for (const c of cards) expect(c.meta + c.chip).not.toMatch(/superset|circuits?\b(?! *$)/i);
      for (const c of cards) if (c.chip === 'Circuit') expect(c.meta).toMatch(/ · \d+ rounds? · /);
      for (const c of cards) if (c.chip === 'Pairs') expect(c.meta).toMatch(/ · \d+ pairs? · /);
      if (m === 30) await shotOn(page, '3.5b', 'cards-30', SHOTS);
      if (m === 15) await shotOn(page, '3.5b', 'cards-15', ['iPhone 15']);
      if (m === 60) await shotOn(page, '3.5b', 'cards-60', ['iPhone 15']);
    }
    expect(errors).toEqual([]);
  });

  test('More ideas puts another style in place of one card; the others stay; the old one comes back as a chip @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    // 3.5b round 2: with the strict rule a full gym without a plan has no fifth diverse style at 30;
    // with a plan active (card 1) and logged sets (card 2, fresh) styles are left over for More ideas.
    const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
    const at = Date.now() - 4 * 86_400_000;
    const load = { kind: 'stack', unit: 'lb', total: 50 };
    await dbPut(page, {
      planState: [{ id: 'active', planId: 'five-day-split', startedAt: Date.now() - 7 * 86_400_000, weekIndex: 0, nextDayIndex: 1, doneDays: [0] }],
      sessions: [
        { id: 'seed', gymId, startedAt: at, endedAt: at + 3_000_000, imported: false, exerciseIds: ['cable-seated-close-grip-row', 'cable-single-arm-bicep-curl'] },
        { id: 'seed-y', gymId, startedAt: Date.now() - 86_400_000, endedAt: Date.now() - 86_000_000, imported: false, exerciseIds: ['cable-tricep-pushdown'] },
      ],
      sets: [
        ...['cable-seated-close-grip-row', 'cable-single-arm-bicep-curl'].map((exerciseId, order) => ({ id: `seed-${order}`, sessionId: 'seed', exerciseId, order, kind: 'work', uncertain: false, reps: 10, load })),
        { id: 'seed-y-0', sessionId: 'seed-y', exerciseId: 'cable-tricep-pushdown', order: 0, kind: 'work', uncertain: false, reps: 10, load },
      ],
    });
    await openQuick(page, 30);
    const before = await ids(page);
    const more = page.getByTestId('more-ideas').locator('button');
    await expect(more.first()).toBeVisible();
    const chips = await more.count();
    expect(chips).toBeGreaterThan(0);
    const target = (await more.first().getAttribute('data-testid'))!.replace('more-', '');
    await more.first().tap();
    await expect(page.locator(`[data-concept="${target}"]`)).toBeVisible();
    const after = await ids(page);
    expect(after).toHaveLength(4);
    // 3.5b round 4: one card changed (card 4, or the one card the new idea was too close to); the
    // plan and fresh cards never move.
    const changed = after.map((id, i) => (id === before[i] ? -1 : i)).filter((i) => i !== -1);
    expect(changed).toHaveLength(1);
    expect(['plan', 'fresh']).not.toContain(before[changed[0]!]);
    // The card it replaced is offered back.
    await expect(page.getByTestId(`more-${before[changed[0]!]}`)).toBeVisible();
    for (const b of await more.all()) expect(((await b.boundingBox())!.height)).toBeGreaterThanOrEqual(47.5);
    // Its own card opens the deck like any other.
    await page.locator(`[data-concept="${target}"]`).tap();
    await expect(card(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the screen is full on an iPhone 15: a card sits at the fold, Pick exercises myself is below the cards and More ideas', async ({ page }, info) => {
    test.skip(info.project.name !== 'iPhone 15', 'the iPhone 15 viewport');
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page, 30);
    await expect(page.locator('[data-concept]')).toHaveCount(4);
    const vh = page.viewportSize()!.height;
    const blocks = [];
    for (const l of await page.locator('[data-concept]').all()) blocks.push((await l.boundingBox())!);
    const moreRow = page.getByTestId('more-ideas');
    if (await moreRow.count()) blocks.push((await moreRow.boundingBox())!);
    // Nothing empty below: the content goes past the fold, and the first block that does starts
    // on screen or right at it (no empty band at the bottom of the screen).
    const last = blocks[blocks.length - 1]!;
    expect(last.y + last.height).toBeGreaterThanOrEqual(vh);
    const atFold = blocks.find((b) => b.y + b.height >= vh)!;
    expect(atFold.y).toBeLessThanOrEqual(vh + 24);
    const myself = (await page.getByTestId('pick-myself').boundingBox())!;
    expect(myself.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
    await shotOn(page, '3.5b', 'fold-30', ['iPhone 15']);
    await page.getByTestId('pick-myself').scrollIntoViewIfNeeded();
    await shotOn(page, '3.5b', 'bottom-30', ['iPhone 15']);
    expect(errors).toEqual([]);
  });

  test('the SE at 130% text: cards, More ideas and Pick exercises myself scroll without overlap or clipping', async ({ page }, info) => {
    test.skip(!['iPhone SE', 'iPhone 15'].includes(info.project.name), 'SE and 15');
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page, 30);
    await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const boxes = [];
    for (const l of await page.locator('[data-concept]').all()) boxes.push((await l.boundingBox())!);
    if (await page.getByTestId('more-ideas').count()) boxes.push((await page.getByTestId('more-ideas').boundingBox())!);
    boxes.push((await page.getByTestId('pick-myself').boundingBox())!);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.y, `block ${i} overlaps the one above`).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height - 1);
    // Nothing in a card spills out of it, and no text is cut with an ellipsis.
    const spill = await page.locator('[data-concept]').evaluateAll((els) =>
      els.flatMap((e) => {
        const box = e.getBoundingClientRect();
        return Array.from(e.querySelectorAll<HTMLElement>('span'))
          .filter((s) => !s.closest('[aria-hidden="true"]'))
          .filter((s) => {
            const b = s.getBoundingClientRect();
            return b.right > box.right + 1 || b.bottom > box.bottom + 1 || b.left < box.left - 1 || s.scrollWidth > s.clientWidth + 1;
          })
          .map((s) => s.textContent ?? '');
      }),
    );
    expect(spill).toEqual([]);
    await page.getByTestId('pick-myself').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('pick-myself')).toBeInViewport({ ratio: 1 });
    await shotOn(page, '3.5b', 'cards-130', ['iPhone SE']);
    expect(errors).toEqual([]);
  });

  test('a beginner gets an Easy start (Low impact) card at every length @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await dbPut(page, { profile: [{ ...PROFILE, intake: { ...PROFILE.intake, experience: 'new' } }] });
    await page.reload();
    await openQuick(page, 15);
    for (const m of [15, 30, 45, 60]) {
      await page.getByTestId(`min-${m}`).tap();
      await expect(page.locator('[data-concept="easy"]')).toBeVisible();
      // 3.5f: calm card face: the style chip is behind the card's info button.
      expect((await readIdea(page, page.locator('[data-concept="easy"]'))).chip).toBe('Low impact');
    }
    expect(errors).toEqual([]);
  });

  test('Start from any card carries its sets, reps, rest and supersets into the workout @matrix', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      await openQuick(page, 30);
      const c = page.locator('[data-concept]').nth(i);
      const id = (await c.getAttribute('data-concept'))!;
      seen.add(id);
      // 3.5f: calm card face: the pairs and rounds are behind the card's info button.
      const meta = (await readIdea(page, c)).meta;
      const title = (await c.getByTestId('concept-title').textContent())!;
      const count = Number(meta.match(/^(\d+)/)![1]);
      const supersets = Number(meta.match(/(\d+) pairs?/)?.[1] ?? 0);
      const rounds = Number(meta.match(/(\d+) rounds?/)?.[1] ?? 0);
      const minutes = Number(meta.match(/~(\d+) min/)![1]);
      await c.tap();
      await expect(card(page)).toBeVisible();
      // Keep every card: the ready list shows what will start.
      for (let k = 0; k < count; k++) {
        // One Keep per card: wait for each card to be on top (a tap mid fly is one decision).
        await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${count}`);
        await page.getByTestId('deck-keep').tap();
      }
      await expect(page.getByTestId('ready-list').locator('li')).toHaveCount(count);
      const lines = await page.getByTestId('ready-list').locator('li').allTextContents();
      await page.getByTestId('quick-start').tap();
      await expect(page.getByTestId('check-current')).toBeVisible();
      type S = { id: string; endedAt?: number; quickStyle?: string; exerciseIds: string[]; targets: Record<string, { sets: number; restSec: number; reps?: unknown; seconds?: unknown; pair?: { group: number; size: number } }> };
      const s = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
      expect(s.quickStyle).toBe(id);
      expect(s.exerciseIds).toHaveLength(count);
      const groups = new Map<number, number>();
      s.exerciseIds.forEach((ex, k) => {
        const t = s.targets[ex]!;
        expect(t.sets).toBeGreaterThan(0);
        expect(t.restSec).toBeGreaterThan(0);
        expect(t.reps !== undefined || t.seconds !== undefined).toBe(true);
        // The ready list showed these sets.
        expect(lines[k]).toContain(`${t.sets} ${t.sets === 1 ? 'set' : 'sets'} ×`);
        if (t.pair) groups.set(t.pair.group, t.pair.size);
      });
      expect([...groups.values()].filter((n) => n === 2)).toHaveLength(supersets);
      const circuits = [...groups.values()].filter((n) => n >= 3).length;
      // A card says rounds exactly when it holds a circuit.
      expect(circuits > 0).toBe(rounds > 0);
      // The day list groups them and shows the card's own estimate.
      await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
      await expect(page.getByTestId('workout-meta')).toContainText(`~${minutes} min`);
      // 3.5b round 4 (P15): the day list header carries the card's own title.
      await expect(page.getByTestId('workout-title')).toHaveText(title);
      await expect(page.getByTestId('pair-group')).toHaveCount(supersets + circuits);
      // M8: the rest is said once per group ("Rest 60 s after each round"), never on its rows.
      for (const g of await page.getByTestId('pair-group').all()) {
        await expect(g.getByTestId('group-rest')).toHaveText(/^Rest \d+ s after each round$/);
        await expect(g.getByText(/^\d+ s rest$/)).toHaveCount(0);
      }
      if (circuits) await expect(page.getByTestId('pair-group').first()).toContainText(/Circuit: \d+ rounds?, one after another|Pair: back to back/);
      // Done with this one: end it so the next card can start.
      await dbPut(page, { sessions: [{ ...s, endedAt: Date.now() }] });
    }
    // 3.5d: Arms and abs never leads and rotation puts a done style last, so two different styles is what four visits are sure to show.
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test('3.5b round 3: the Classic 5 Day Split day 2 at 30 min starts with exactly the card: same rows, same minutes @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await dbPut(page, { planState: [{ id: 'active', planId: 'five-day-split', startedAt: Date.now() - 7 * 86_400_000, weekIndex: 0, nextDayIndex: 1, doneDays: [0] }] });
    await openQuick(page, 30);
    const plan = page.locator('[data-concept="plan"]');
    await expect(plan).toBeVisible();
    const meta = (await plan.getByTestId('concept-meta').textContent())!;
    const count = Number(meta.match(/^(\d+)/)![1]);
    const minutes = Number(meta.match(/~(\d+) min/)![1]);
    expect(minutes).toBeLessThanOrEqual(30);
    await plan.tap();
    const names: string[] = [];
    for (let k = 0; k < count; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${count}`);
      names.push((await page.getByTestId('deck-name').textContent())!);
      await page.getByTestId('deck-keep').tap();
    }
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    // Exactly the card's exercises (never a curated pair's other half at a default 3 × 8 to 12).
    await expect(page.locator('[data-testid^="row-"]')).toHaveCount(count);
    for (const n of names) await expect(page.locator('[data-testid^="row-"]').filter({ hasText: n })).toHaveCount(1);
    await expect(page.getByTestId('workout-meta')).toContainText(`~${minutes} min`);
    await shotOn(page, '3.5b', 'plan-daylist-30', SHOTS);
    expect(errors).toEqual([]);
  });

  test('3.5b round 4 (B1): the hotel preset at 30 min fills each card to the minutes and says why it shows fewer than 4 @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike']);
    await openQuick(page, 30);
    const cards = await readCards(page);
    for (const c of cards) {
      const mm = c.meta.match(META)!;
      expect(Number(mm[1]), `${c.id}: ${c.meta}`).toBeGreaterThanOrEqual(c.id === 'strength' ? 3 : 5);
      expect(Number(mm[4])).toBeGreaterThanOrEqual(27);
    }
    await expect(page.getByText('All this gym can do')).toHaveCount(0);
    // 3.5d (5): the note under the cards is gone, with fewer cards or not.
    await expect(page.getByTestId('quick-fewer')).toHaveCount(0);
    await expect(page.getByTestId('more-ideas')).toBeVisible();
    await shotOn(page, '3.5b/round4', 'hotel-30', ['iPhone 15']);
    expect(errors).toEqual([]);
  });

  test('3.5b round 4 (B2, B3): a brand new lifter with knees on Go easy on gets Easy start first, no leg press, squat or leg extension anywhere @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await dbPut(page, { profile: [{ ...PROFILE, intake: { ...PROFILE.intake, experience: 'new', easyOn: ['knees'] } }] });
    await page.reload();
    await openQuick(page, 30);
    await expect(page.locator('[data-concept]').first()).toHaveAttribute('data-concept', 'easy');
    await expect(page.locator('[data-concept="strength"]')).toHaveCount(0);
    await expect(page.getByTestId('more-strength')).toHaveCount(0);
    await expect(page.locator('[data-concept="easy"]').getByTestId('concept-why')).toContainText('easy on your knees');
    await shotOn(page, '3.5b/round4', 'beginner-knees-30', ['iPhone 15']);
    for (let i = 0; i < (await page.locator('[data-concept]').count()); i++) {
      await openQuick(page, 30);
      await page.locator('[data-concept]').nth(i).tap();
      await expect(card(page)).toBeVisible();
      await page.getByTestId('quick-start').tap();
      await expect(page.getByTestId('check-current')).toBeVisible();
      await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
      const names = await page.locator('[data-testid^="row-"]').allTextContents();
      for (const n of names) expect(n).not.toMatch(/leg press|leg extension|squat|lunge/i);
      type S = { id: string; endedAt?: number };
      const s = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
      await dbPut(page, { sessions: [{ ...s, endedAt: Date.now() }] });
    }
    expect(errors).toEqual([]);
  });

  test('3.5b round 4: a full gym at 30 and 60 on the 15, and the SE at 130%: every chip label whole @matrix', async ({ page }, info) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page, 30);
    await shotOn(page, '3.5b/round4', 'full-30', ['iPhone 15']);
    await page.getByTestId('min-60').tap();
    await expect(page.locator('[data-concept]')).toHaveCount(4);
    await shotOn(page, '3.5b/round4', 'full-60', ['iPhone 15']);
    await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
    await page.waitForTimeout(250);
    // M11: no minute chip label is cut.
    for (const m of [15, 30, 45, 60]) {
      const cut = await page.getByTestId(`min-${m}`).evaluate((b) => b.scrollWidth > b.clientWidth + 1);
      expect(cut, `${m} min chip on ${info.project.name}`).toBe(false);
    }
    // P13: "· ~T min" is never split from its dot.
    for (const part of await page.getByTestId('concept-meta').locator('span').allTextContents()) expect(part).not.toMatch(/^·\s*$/);
    await page.getByTestId('min-30').tap();
    await shotOn(page, '3.5b/round4', 'cards-30-130', ['iPhone SE']);
    expect(errors).toEqual([]);
  });

  test('3.5b round 4 shots: SE, 15 and Pro Max at 100% and 130%, no history: 4 cards, More ideas, nothing clipped', async ({ page }, info) => {
    const errors = watchErrors(page);
    const all = ['iPhone SE', 'iPhone 15', 'iPhone 17 Pro Max'];
    await pastIntake(page);
    await openQuick(page, 30);
    await expect(page.locator('[data-concept]')).toHaveCount(4);
    // M12: always a More ideas row, so the screen below the cards is never empty.
    await expect(page.getByTestId('more-ideas')).toBeVisible();
    await shotOn(page, '3.5b/round4', 'quick-30-100', all);
    for (const scale of ['100%', '130%']) {
      await page.evaluate((v) => (document.documentElement.style.fontSize = v), scale);
      await page.waitForTimeout(250);
      for (const m of [15, 30, 45, 60]) expect(await page.getByTestId(`min-${m}`).evaluate((b) => b.scrollWidth > b.clientWidth + 1), `${m} at ${scale} on ${info.project.name}`).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await shotOn(page, '3.5b/round4', 'quick-30-130', all);
    await page.getByTestId('more-ideas').scrollIntoViewIfNeeded();
    await shotOn(page, '3.5b/round4', 'quick-30-130-bottom', all);
    expect(errors).toEqual([]);
  });
});
