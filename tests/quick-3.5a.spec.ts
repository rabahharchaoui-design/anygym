import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, shotOn, usePlan, watchErrors } from './workout-helpers';

// PLAN 3.5a (SPEC 20.3, G Nov 5): Quick workout builds it for you. "How long?" chips, "Pick one" of
// 3 honest concepts, the curate deck (right keeps, left swaps for the same movement, long press never
// shows it again, Keep and Swap buttons, Start now on every card, Start workout after a change), learned soft dislikes, and
// Today's "Got 30 min? I'll build it" card. Only exercises with a sure demo and gear in the active gym.
// Progress note (resumable): lib/quick.ts, db/quick.ts, screens/quick/*, Today card and tests done.

import { card, counter, DUMBBELLS, longPress, pastIntake, PROFILE, swipe } from './helpers/quick';

const eyebrow = (page: Page) => card(page).locator('p').first();

async function openQuick(page: Page) {
  await page.getByTestId('build-card').tap();
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  await expect(page.locator('[data-concept]').first()).toBeVisible();
}

test.describe('Quick workout builds it for you', () => {
  test('Today to the first set in 3 taps with the defaults; curating every card stays under 30 s @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await expect(page.getByTestId('build-card')).toContainText("Got 30 min? I'll build it");
    await expect(page.getByTestId('build-card')).toContainText('Pick a workout, tweak it, start');
    await shotOn(page, '3.5a', 'today');
    // The picker first flow is still on Today, as it was (SPEC 20.4 counts unchanged).
    await expect(page.getByRole('button', { name: /Quick workout/ })).toContainText('Build my own');
    const t = counter();
    await t.tap(page.getByTestId('build-card'));
    await expect(page.getByTestId('min-30')).toHaveAttribute('aria-pressed', 'true');
    const first = page.locator('[data-concept]').first();
    const meta = await first.getByTestId('concept-meta').textContent();
    await t.tap(first);
    await expect(card(page)).toBeVisible();
    await t.tap(page.getByTestId('quick-start'));
    await expect(page).toHaveURL(/#\/workout\/[^/]+\/[^/]+$/);
    await expect(page.getByTestId('check-current')).toBeVisible();
    expect(t.count).toBeLessThanOrEqual(3);
    console.log(`tap count Today to first set: ${t.count} (${meta})`);
    expect(errors).toEqual([]);
  });

  test('curating: swipe right through every card, then Start workout, in under 30 s', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    const started = Date.now();
    await page.getByTestId('build-card').tap();
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
    for (let i = 0; i < total; i++) {
      await expect(eyebrow(page)).toContainText(`${i + 1} of ${total}`);
      // One swap on the way, the rest kept.
      if (i === 1) {
        const before = await card(page).getAttribute('data-exercise');
        await swipe(page, -260);
        await expect(card(page)).not.toHaveAttribute('data-exercise', before!);
      }
      await swipe(page, 260);
    }
    await expect(page.getByRole('heading', { name: 'Ready to go' })).toBeVisible();
    await expect(page.getByTestId('ready-list').locator('li')).toHaveCount(total);
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const seconds = (Date.now() - started) / 1000;
    console.log(`curate ${total} cards: ${seconds.toFixed(1)} s`);
    expect(seconds).toBeLessThan(30);
    expect(errors).toEqual([]);
  });

  test('a full gym: three honest concepts, every card with a sure demo, the estimate the workout shows @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    const concepts = page.locator('[data-concept]');
    await expect(concepts).toHaveCount(3);
    expect(await concepts.evaluateAll((els) => els.map((e) => e.getAttribute('data-concept')))).toEqual(['full', 'upper', 'lower']);
    await expect(concepts.first()).toContainText('Full body pump');
    // Every concept card has its mini muscle map.
    await expect(page.getByTestId('mini-map')).toHaveCount(3);
    await shotOn(page, '3.5a', 'concepts-full');
    for (let c = 0; c < 3; c++) {
      await concepts.nth(c).tap();
      const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
      for (let i = 0; i < total; i++) {
        await expect(eyebrow(page)).toContainText(`${i + 1} of ${total}`);
        await expect(card(page).locator('[data-demo]')).toHaveCount(1);
        await page.getByTestId('deck-keep').tap();
      }
      await expect(page.getByRole('heading', { name: 'Ready to go' })).toBeVisible();
      await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    }
    // Start the first as is: the workout holds exactly those exercises and shows the same estimate.
    const meta = (await concepts.first().getByTestId('concept-meta').textContent())!;
    const [, count, minutes] = meta.match(/^(\d+) exercises · ~(\d+) min$/)!;
    await concepts.first().tap();
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    await expect(page.getByTestId('workout-meta')).toContainText(`~${minutes} min`);
    const s = (await dbAll<{ endedAt?: number; exerciseIds: string[]; targets?: Record<string, { sets: number }> }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    expect(s.exerciseIds).toHaveLength(Number(count));
    expect(Object.keys(s.targets!)).toEqual(s.exerciseIds);
    expect(errors).toEqual([]);
  });

  test('a dumbbell only gym: only concepts whose name is true, every card doable with a sure demo @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, DUMBBELLS);
    await openQuick(page);
    const ids = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => e.getAttribute('data-concept')));
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids).not.toContain('full');
    expect(ids).not.toContain('lower');
    await shotOn(page, '3.5a', 'concepts-dumbbells');
    for (let c = 0; c < ids.length; c++) {
      await page.locator('[data-concept]').nth(c).tap();
      const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
      for (let i = 0; i < total; i++) {
        await expect(eyebrow(page)).toContainText(`${i + 1} of ${total}`);
        await expect(card(page).locator('[data-demo]')).toHaveCount(1);
        // Dumbbells, a bench or the body only: never a barbell, cable or machine here.
        expect(await page.getByTestId('deck-name').textContent()).toMatch(/Dumbbell|Crunch|Dead Bug/);
        await page.getByTestId('deck-keep').tap();
      }
      await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    }
    expect(errors).toEqual([]);
  });

  test('fewer than 3 sure moves fit: Today says add equipment, the empty state leads with Add equipment, Pick exercises myself opens the picker', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, []);
    // Today never promises what it cannot build (round 2, B5).
    await expect(page.getByTestId('build-card')).toHaveCount(0);
    await expect(page.getByTestId('build-equipment')).toContainText('Add your equipment to get built workouts');
    await page.goto('./#/quick');
    await expect(page.getByTestId('quick-empty')).toContainText('Not enough here to build one yet');
    await expect(page.locator('[data-concept]')).toHaveCount(0);
    await expect(page.getByTestId('min-30')).toHaveCount(0);
    await shotOn(page, '3.5a', 'empty');
    await page.getByRole('button', { name: 'Add equipment' }).tap();
    await expect(page).toHaveURL(/#\/settings\/gyms\/[^/]+\/equipment$/);
    await page.goto('./#/quick');
    await page.getByRole('button', { name: 'Pick exercises myself' }).tap();
    await expect(page.getByRole('dialog', { name: 'Add exercise' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('swipe right keeps, left swaps for the same movement and learns a soft dislike, long press never shows it again @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept]').first().tap();
    await expect(page.getByTestId('deck-hint')).toHaveText('Right keeps it, left swaps it.');
    await shotOn(page, '3.5a', 'deck');
    const first = await card(page).getAttribute('data-exercise');
    // Below the threshold it springs back: nothing changes.
    await swipe(page, 60, { slow: true, steps: 12 });
    await expect(eyebrow(page)).toContainText('1 of');
    await expect(card(page)).toHaveAttribute('data-exercise', first!);
    // Past it: kept, the next card is on top.
    await swipe(page, 240);
    await expect(eyebrow(page)).toContainText('2 of');
    await expect(page.getByTestId('deck-hint')).toHaveText('Hold a card: never show it again.');
    // Mid drag: the card tilts with the finger and the Swap word shows.
    await swipe(page, -80, { slow: true, steps: 16, release: false });
    await shotOn(page, '3.5a', 'deck-drag');
    const tilt = await card(page).evaluate((el) => getComputedStyle(el).transform);
    expect(tilt).not.toBe('none');
    await page.mouse.up();
    await expect(eyebrow(page)).toContainText('2 of');
    const second = (await card(page).getAttribute('data-exercise'))!;
    await swipe(page, -260);
    await expect(card(page)).not.toHaveAttribute('data-exercise', second);
    await expect(eyebrow(page)).toContainText('2 of');
    await expect(card(page)).toContainText('Swapped in');
    await expect.poll(async () => (await dbAll<{ id: string; dislikes?: { soft?: Record<string, number> } }>(page, 'profile')).find((p) => p.id === 'me')?.dislikes?.soft?.[second]).toBe(1);
    // Long press: never show it again, something of the same movement takes its place; Undo puts it back.
    const third = (await card(page).getAttribute('data-exercise'))!;
    await longPress(page);
    await expect(page.getByText("Won't show it again")).toBeVisible();
    await expect(card(page)).not.toHaveAttribute('data-exercise', third);
    const nevers = async () => (await dbAll<{ id: string; dislikes?: { never?: string[] } }>(page, 'profile')).find((p) => p.id === 'me')?.dislikes?.never ?? [];
    await expect.poll(nevers).toContain(third);
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect(card(page)).toHaveAttribute('data-exercise', third);
    await expect.poll(nevers).not.toContain(third);
    // The never button on the card does the same, for anyone who cannot long press.
    await page.getByTestId('deck-never').tap();
    await expect.poll(nevers).toContain(third);
    // Learned for later: a new visit never offers it.
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    await page.goto('./#/quick?min=45');
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    for (let c = 0; c < (await page.locator('[data-concept]').count()); c++) {
      await page.locator('[data-concept]').nth(c).tap();
      const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
      for (let i = 0; i < total; i++) {
        await expect(eyebrow(page)).toContainText(`${i + 1} of ${total}`);
        expect(await card(page).getAttribute('data-exercise')).not.toBe(third);
        await page.getByTestId('deck-keep').tap();
      }
      await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    }
    // History was never touched: no sets, no finished workouts appeared or went.
    expect(await dbAll(page, 'sets')).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('Start as is from any card lands in the workout with the deck exactly', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept]').nth(1).tap();
    const names: string[] = [];
    names.push((await page.getByTestId('deck-name').textContent())!);
    await page.getByTestId('deck-keep').tap();
    await expect(eyebrow(page)).toContainText('2 of');
    await page.getByTestId('deck-swap').tap();
    await expect(card(page)).toContainText('Swapped in');
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const s = (await dbAll<{ id: string; endedAt?: number; exerciseIds: string[]; planId?: string }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    expect(s.planId).toBeUndefined();
    await expect(page).toHaveURL(new RegExp(`#/workout/${s.id}/${encodeURIComponent(s.exerciseIds[0]!)}$`));
    // Back from the workout goes to Today, never back into the deck.
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.locator('[data-testid^="row-"]')).toHaveCount(s.exerciseIds.length);
    expect(errors).toEqual([]);
  });

  test('with a plan: "Your <day> day, short" comes first and starts as that plan day, trimmed @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await dbPut(page, { profile: [PROFILE] });
    await page.reload();
    await page.getByTestId('build-card').tap();
    const first = page.locator('[data-concept]').first();
    await expect(first).toHaveAttribute('data-concept', 'plan');
    await expect(first).toContainText(/^.+, short/);
    await expect(first).toContainText('From your Classic 5 Day Split');
    await shotOn(page, '3.5a', 'concepts-plan');
    await first.tap();
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const s = (await dbAll<{ endedAt?: number; planId?: string; trim?: { drop: string[] }; timeBudgetMin?: number }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    expect(s.planId).toBe('five-day-split');
    expect(s.trim).toBeDefined();
    expect(s.timeBudgetMin).toBe(30);
    expect(errors).toEqual([]);
  });

  test('the chips change the concepts and preselect from the intake minutes', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick');
    // The intake said 45.
    await expect(page.getByTestId('min-45')).toHaveAttribute('aria-pressed', 'true');
    const at = async () => Number((await page.locator('[data-concept]').first().getByTestId('concept-meta').textContent())!.match(/~(\d+) min/)![1]);
    const m45 = await at();
    await page.getByTestId('min-15').tap();
    await expect(page.getByTestId('min-15')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(at).toBeLessThan(m45);
    await page.getByTestId('min-60').tap();
    await expect.poll(at).toBeGreaterThan(m45 - 1);
    expect(errors).toEqual([]);
  });
});

test.describe('round 2', () => {
  test('B3: every concept fits the chip picked (2 min over at most), and 15 min still offers one @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick');
    for (const m of [15, 30, 45, 60]) {
      await page.getByTestId(`min-${m}`).tap();
      await expect(page.getByTestId(`min-${m}`)).toHaveAttribute('aria-pressed', 'true');
      const metas = await page.getByTestId('concept-meta').allTextContents();
      expect(metas.length, `${m} min`).toBeGreaterThan(0);
      for (const t of metas) expect(Number(t.match(/~(\d+) min/)![1]), `${t} under ${m}`).toBeLessThanOrEqual(m + 2);
    }
    await page.getByTestId('min-15').tap();
    await shotOn(page, '3.5a', 'concepts-15');
    expect(errors).toEqual([]);
  });

  test('B2, B6: never with nothing to swap says so above the card with the new time; Keep works while it shows; a failed swap shakes and Swap says why', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, DUMBBELLS);
    await openQuick(page);
    await page.locator('[data-concept="push"]').tap();
    const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
    // Walk to the overhead triceps extension: nothing else with a sure demo fits it here (and it is not last).
    const NAME = 'Dumbbell Single Arm Overhead Tricep Extension';
    for (let i = 0; i < total; i++) {
      await expect(eyebrow(page)).toContainText(`${i + 1} of`);
      if ((await page.getByTestId('deck-name').textContent()) === NAME) break;
      await page.getByTestId('deck-keep').tap();
    }
    await expect(page.getByTestId('deck-name')).toHaveText(NAME);
    await expect(page.getByTestId('quick-start')).toHaveText('Start now');
    await page.getByTestId('deck-swap').tap();
    await expect(page.getByTestId('swap-label')).toHaveText('No other option here');
    await expect(page.getByTestId('deck-name')).toHaveText(NAME);
    await shotOn(page, '3.5a', 'swap-none');
    await expect(page.getByTestId('swap-label')).toHaveText('Swap', { timeout: 4000 });
    // Never: it leaves, the line above the card says the new time, Undo is right there.
    const before = Number((await page.getByTestId('curate-meta').textContent())!.match(/~(\d+) min/)![1]);
    await page.getByTestId('deck-never').tap();
    const notice = page.getByTestId('deck-hint');
    await expect(notice).toContainText(/Won't show it again · Nothing else fits here, removed: workout is now \d+ min/);
    const after = Number((await notice.textContent())!.match(/now (\d+) min/)![1]);
    expect(after).toBeLessThan(before);
    await expect(page.getByTestId('curate-meta')).toContainText(`~${after} min`);
    await expect(page.getByTestId('curate-meta')).toContainText(`${total - 1} exercises`);
    await expect(page.getByTestId('quick-start')).toHaveText('Start workout');
    await shotOn(page, '3.5a', 'never-gap');
    // The notice is above the card (or above the list once it was the last), never over the buttons, and Keep still works.
    if (await card(page).count()) {
      const n = (await notice.boundingBox())!;
      const c = (await card(page).boundingBox())!;
      expect(n.y + n.height).toBeLessThanOrEqual(c.y + 1);
      const pos = Number((await eyebrow(page).textContent())!.match(/^(\d+)/)![1]);
      await page.getByTestId('deck-keep').tap();
      await expect(async () => {
        const done = await page.getByRole('heading', { name: 'Ready to go' }).isVisible();
        if (!done) expect(Number((await eyebrow(page).textContent())!.match(/^(\d+)/)![1])).toBe(pos + 1);
      }).toPass();
    } else {
      await expect(page.getByRole('heading', { name: 'Ready to go' })).toBeVisible();
      const n = (await notice.boundingBox())!;
      const st = (await page.getByTestId('quick-start').boundingBox())!;
      expect(n.y + n.height).toBeLessThanOrEqual(st.y);
    }
    expect(errors).toEqual([]);
  });

  test('round 3 B2: swiping left shows each option once (one leg press), then No other option here and it stops', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept="lower"]').tap();
    // The squat card of the legs day.
    const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
    for (let i = 0; i < total; i++) {
      await expect(eyebrow(page)).toContainText(`${i + 1} of`);
      if (/Squat/.test((await page.getByTestId('deck-name').textContent())!)) break;
      await page.getByTestId('deck-keep').tap();
    }
    const names = [(await page.getByTestId('deck-name').textContent())!];
    for (let i = 0; i < 12; i++) {
      const was = await card(page).getAttribute('data-exercise');
      await page.getByTestId('deck-swap').tap();
      const stopped = await expect(page.getByTestId('swap-label'))
        .toHaveText('No other option here', { timeout: 1500 })
        .then(() => true)
        .catch(() => false);
      if (stopped) break;
      await expect(card(page)).not.toHaveAttribute('data-exercise', was!);
      names.push((await page.getByTestId('deck-name').textContent())!);
    }
    console.log('squat slot options:', names.join(' > '));
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => /leg press/i.test(n)).length).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('swap-label')).toHaveText('No other option here');
    // Never on the last option: the rejected ones never come back, the slot leaves with the gap said.
    const last = (await page.getByTestId('deck-name').textContent())!;
    await page.getByTestId('swap-label').waitFor();
    await page.getByTestId('deck-never').tap();
    await expect(page.getByTestId('deck-hint')).toContainText('Nothing else fits here');
    await expect(page.getByTestId('deck-name')).not.toHaveText(last);
    for (const n of names) await expect(page.getByTestId('deck-name')).not.toHaveText(n);
    expect(errors).toEqual([]);
  });

  test('a double tap on Keep decides one card', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept]').first().tap();
    await expect(eyebrow(page)).toContainText('1 of');
    await page.getByTestId('deck-keep').dblclick();
    await page.waitForTimeout(600);
    await expect(eyebrow(page)).toContainText('2 of');
    expect(errors).toEqual([]);
  });

  test('P9: holding a card presses it in and fills a ring before Never show', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept]').first().tap();
    const box = (await card(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await expect(card(page)).toHaveAttribute('data-holding', '');
    await shotOn(page, '3.5a', 'hold');
    await page.mouse.up();
    await expect(card(page)).not.toHaveAttribute('data-holding', '');
    expect(errors).toEqual([]);
  });

  test('P8: the last Keep fades the buttons and Ready to go comes in', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept]').first().tap();
    const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
    for (let i = 0; i < total - 1; i++) {
      await expect(eyebrow(page)).toContainText(`${i + 1} of`);
      await page.getByTestId('deck-keep').tap();
    }
    await expect(eyebrow(page)).toContainText(`${total} of`);
    await page.getByTestId('deck-keep').tap();
    await expect(page.getByRole('heading', { name: 'Ready to go' })).toBeVisible();
    await expect(page.getByTestId('quick-start')).toHaveText('Start workout');
    await shotOn(page, '3.5a', 'ready');
    expect(errors).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the card does not tilt or fly: it fades, and every decision still works', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toHaveAttribute('data-reduced', 'true');
    await swipe(page, -60, { slow: true, steps: 12, release: false });
    const t = await card(page).evaluate((el) => getComputedStyle(el).transform);
    // A plain slide with the finger, never a tilt.
    expect(t === 'none' || /^matrix\(1, 0, 0, 1,/.test(t)).toBe(true);
    await page.mouse.up();
    await swipe(page, 260);
    await expect(eyebrow(page)).toContainText('2 of');
    await page.getByTestId('deck-keep').tap();
    await expect(eyebrow(page)).toContainText('3 of');
    const before = await card(page).getAttribute('data-exercise');
    await page.getByTestId('deck-swap').tap();
    await expect(card(page)).not.toHaveAttribute('data-exercise', before!);
    expect(errors).toEqual([]);
  });
});

test.describe('layout', () => {
  async function fits(page: Page) {
    const r = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const over = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((el) => {
        if (el.closest('[aria-hidden="true"], [data-under]')) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && (b.right > w + 1 || b.left < -1) && !el.closest('[data-testid="deck-card"]');
      });
      return { w, scroll: document.documentElement.scrollWidth, over: over.map((e) => `${e.tagName}.${e.className}`).slice(0, 5) };
    });
    expect(r.over).toEqual([]);
    expect(r.scroll).toBeLessThanOrEqual(r.w);
  }

  test('SE, 360 and 320: the choose screen, the deck and its buttons fit, Start in reach @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await fits(page);
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    await fits(page);
    const vh = page.viewportSize()!.height;
    for (const id of ['deck-card', 'deck-keep', 'deck-swap', 'quick-start', 'deck-never']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.y + b.height, id).toBeLessThanOrEqual(vh + 1);
      expect(b.height, id).toBeGreaterThanOrEqual(48);
      expect(b.width, id).toBeGreaterThanOrEqual(48);
    }
    // Keep and Swap never sit under the Start bar (round 2, B1), and their words fit.
    const keep = (await page.getByTestId('deck-keep').boundingBox())!;
    const startBox = (await page.getByTestId('quick-start').boundingBox())!;
    expect(keep.y + keep.height).toBeLessThanOrEqual(startBox.y + 1);
    await expect(page.getByTestId('deck-keep')).toContainText('Keep');
    await expect(page.getByTestId('deck-swap')).toContainText('Swap');
    await shotOn(page, '3.5a', 'deck-fit');
    expect(errors).toEqual([]);
  });

  test('130% text: nothing clipped on the choose screen or the deck @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    // Round 3 (P8): a real root font size of 130% (the deck and choose screen are in rem), never
    // nested scaling. The text really grows: the card name is checked bigger afterwards.
    const scale = async () => {
      await page.evaluate(() => (document.documentElement.style.fontSize = ''));
      await page.waitForTimeout(100);
      const before = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-concept] span, [data-testid="deck-name"]')!).fontSize));
      await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-concept] span, [data-testid="deck-name"]')!).fontSize));
      expect(after / before).toBeGreaterThan(1.25);
    };
    const clipped = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('h1, h2, p, span, button'))
          .filter((el) => !el.closest('[aria-hidden="true"], [data-under]'))
          .filter((el) => {
            const s = getComputedStyle(el);
            return (/(hidden|clip)/.test(s.overflowX) || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1;
          })
          .map((el) => (el.textContent ?? '').slice(0, 30)),
      );
    await scale();
    expect(await clipped()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await shotOn(page, '3.5a', 'concepts-130');
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    await scale();
    await page.waitForTimeout(200);
    expect(await clipped()).toEqual([]);
    // Keep and Swap stay above Start, all in view; the sets and why lines are not cut by the card.
    const vh = page.viewportSize()!.height;
    const keep = (await page.getByTestId('deck-keep').boundingBox())!;
    const startBox = (await page.getByTestId('quick-start').boundingBox())!;
    expect(keep.y + keep.height).toBeLessThanOrEqual(startBox.y + 1);
    expect(startBox.y + startBox.height).toBeLessThanOrEqual(vh + 1);
    const cardBox = (await card(page).boundingBox())!;
    for (const id of ['deck-sets', 'deck-name']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.y + b.height, id).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
    }
    const why = (await card(page).locator('p').last().boundingBox())!;
    expect(why.y + why.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
    await shotOn(page, '3.5a', 'deck-130');
    expect(errors).toEqual([]);
  });
});

test('frame timing: the swipe moves on every frame on WebKit', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'webkit' || !info.project.name.startsWith('iPhone'), 'WebKit iPhone projects only');
  const errors = watchErrors(page);
  await pastIntake(page);
  await openQuick(page);
  await page.locator('[data-concept]').first().tap();
  await expect(card(page)).toBeVisible();
  await page.waitForTimeout(400);
  // Count the frames during a slow drag and a release, and the card's transform on each one.
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __moves: number; __stop: boolean };
    w.__frames = [];
    w.__moves = 0;
    w.__stop = false;
    const el = document.querySelector('[data-testid="deck-card"]') as HTMLElement;
    let last = '';
    const loop = (t: number) => {
      w.__frames.push(t);
      if (el.style.transform !== last) {
        last = el.style.transform;
        w.__moves++;
      }
      if (!w.__stop) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // Below the threshold, at a finger's pace, then let go: it springs back.
  await swipe(page, 80, { steps: 30, slow: true, release: false });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __moves: number; __stop: boolean };
    w.__stop = true;
    const d = w.__frames.slice(1).map((t, i) => t - w.__frames[i]!);
    const sorted = [...d].sort((a, b) => a - b);
    return { frames: d.length, moves: w.__moves, median: sorted[Math.floor(sorted.length / 2)]!, p90: sorted[Math.floor(sorted.length * 0.9)]! };
  });
  console.log(`swipe frames ${r.frames}, transform writes ${r.moves}, median ${r.median.toFixed(1)} ms, p90 ${r.p90.toFixed(1)} ms`);
  // About 60 fps: the median frame near 16.7 ms, and the card moved on many frames (a spring, not a jump).
  expect(r.median).toBeLessThan(21);
  expect(r.p90).toBeLessThan(40);
  expect(r.moves).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
