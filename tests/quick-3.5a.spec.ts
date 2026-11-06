import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, shotOn, usePlan, watchErrors } from './workout-helpers';

// PLAN 3.5a (SPEC 20.3, G Nov 5): Quick workout builds it for you. "How long?" chips, "Pick one" of
// 3 honest concepts, the curate deck (right keeps, left swaps for the same movement, long press never
// shows it again, Keep and Swap buttons, Start as is on every card), learned soft dislikes, and
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
    // The picker first flow is still on Today, as it was (SPEC 20.4 counts unchanged).
    await expect(page.getByRole('button', { name: /Quick workout/ })).toContainText('Pick exercises myself');
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

  test('fewer than 3 sure moves fit: the honest empty state, and Pick exercises myself opens the picker', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page, []);
    await page.getByTestId('build-card').tap();
    await expect(page.getByTestId('quick-empty')).toContainText('Not enough here to build one yet');
    await expect(page.locator('[data-concept]')).toHaveCount(0);
    await shotOn(page, '3.5a', 'empty');
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
    await expect(first).toContainText(/^Your .+ day, short/);
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

  test('SE and 320: the choose screen, the deck and its buttons fit, Start as is in reach @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    await fits(page);
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    await fits(page);
    const vh = page.viewportSize()!.height;
    for (const id of ['deck-card', 'deck-keep', 'deck-swap', 'quick-start']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.y + b.height, id).toBeLessThanOrEqual(vh + 1);
      expect(b.height, id).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  });

  test('130% text: nothing clipped on the choose screen or the deck @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await openQuick(page);
    const scale = () =>
      page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          const s = getComputedStyle(el);
          el.style.fontSize = `${parseFloat(s.fontSize) * 1.3}px`;
          const line = parseFloat(s.lineHeight);
          if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
        }
      });
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
    expect(await clipped()).toEqual([]);
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
