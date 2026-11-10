import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, usePlan, watchErrors } from './workout-helpers';

// Independent tester checks for PLAN 3.8b. Screenshots: reports/shots/3.8b-verify/.
const DAY = 86_400_000;
const lb = (total: number, perSide: number[]) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide });

async function snap(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `reports/shots/3.8b-verify/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
}
async function seed(page: Page, startedAt: number, sets: Array<{ exerciseId: string; reps: number; load: Record<string, unknown> }>) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `v38b-${startedAt}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((s) => s.exerciseId))] }],
    sets: sets.map((s, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: s.exerciseId, order: i, kind: 'work', reps: s.reps, load: s.load, uncertain: false })),
  });
}
const three = (exerciseId: string, reps: number, load: Record<string, unknown>) => [0, 1, 2].map(() => ({ exerciseId, reps, load }));
const rect = (loc: Locator) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
const inter = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const scale = (page: Page, f: number) => page.evaluate((k) => {
  const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => ({ el, s: parseFloat(getComputedStyle(el).fontSize) }));
  for (const { el, s } of sizes) el.style.fontSize = `${s * k}px`;
}, f);

async function twoExerciseWorkout(page: Page) {
  await page.goto('./');
  await seed(page, Date.now() - 3 * DAY, [...three('barbell-back-squat', 10, lb(185, [45, 25])), ...three('barbell-incline-bench-press', 10, lb(135, [45]))]);
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-back-squat');
  if (!(await view.isVisible())) await page.getByTestId('row-barbell-back-squat').tap();
  return view;
}
/** The check button is 0 tall in HEAD (check 9, bug): Playwright cannot tap it, so tap the visible circle's centre like a thumb. */
async function tapCircle(page: Page, view: Locator) {
  const circle = checkCurrent(view).locator('span').first();
  await expect(circle).toBeVisible();
  await expect(page.getByTestId('arrival-guard')).toHaveCount(0); // the press guard after a screen change
  await page.waitForTimeout(150);
  const b = (await circle.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
async function logAll(view: Locator, n = 3) {
  const page = view.page();
  for (let i = 1; i <= n; i++) {
    await tapCircle(page, view);
    await expect(loggedRows(view)).toHaveCount(i);
  }
}

test.describe('verify 3.8b', () => {
  test('1 effort prompt holds the exercise; answer moves on; Back and Next move on at once @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    await expect(page.getByTestId('next-chip')).toContainText('Nice. Next:');
    // 3.5g: the exercise view never asks (the SPEC 20.2 return yanked its prompt away); the list row does.
    await expect(view.getByTestId('effort')).toHaveCount(0);
    await snap(page, 'e1-prompt');
    await expect(view).toHaveCount(0, { timeout: 6000 });
    await expect(page.getByTestId('list-effort')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await page.getByTestId('row-barbell-back-squat').tap();
    const v2 = exerciseView(page, 'barbell-back-squat');
    await expect(loggedRows(v2)).toHaveCount(3);
    await expect(v2.getByTestId('effort')).toHaveCount(0);
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    // Optional: unanswered before the reload, nothing was saved, and nothing nags afterwards.
    expect(await dbAll(page, 'efforts')).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  // 3.5g: nothing to answer on the exercise view: the SPEC 20.2 return takes the list after about 2.5 s,
  // where the row asks once.
  test('1e the last set returns to the list after about 2.5 s, where the row asks @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    const t0 = Date.now();
    await expect(view.getByTestId('effort')).toHaveCount(0);
    await expect(view).toHaveCount(0, { timeout: 6000 });
    const ms = Date.now() - t0;
    console.log('LAST SET->LEFT ms', ms);
    expect(ms).toBeLessThan(5000);
    await snap(page, 'e1-after-answer');
    await page.getByTestId('list-effort-good').tap();
    await expect.poll(async () => (await dbAll(page, 'efforts')).length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('3.8c day list prompt row: appears after the last set, one tap saves, reload keeps it, another exercise removes it @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    await expect(view).toHaveCount(0, { timeout: 6000 });
    const prompt = page.getByTestId('list-effort');
    await expect(prompt).toHaveCount(1);
    await expect(prompt).toContainText('How did that feel?');
    for (const e of ['easy', 'good', 'hard']) expect((await page.getByTestId(`list-effort-${e}`).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    const rowBox = (await page.getByTestId('row-barbell-back-squat').boundingBox())!;
    expect((await prompt.boundingBox())!.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);
    await snap(page, 'list-effort');
    await page.screenshot({ path: `reports/shots/3.8c/list-effort-${test.info().project.name.replace(/ /g, '-')}.png` });
    await page.getByTestId('list-effort-good').tap();
    await expect(prompt).toHaveCount(0);
    await expect.poll(async () => (await dbAll<{ effort: string }>(page, 'efforts')).map((e) => e.effort)).toEqual(['good']);
    await page.reload();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    expect((await dbAll<{ effort: string }>(page, 'efforts')).map((e) => e.effort)).toEqual(['good']);
    expect(errors).toEqual([]);
  });

  test('3.8c day list prompt row goes away when another exercise is started @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    await expect(view).toHaveCount(0, { timeout: 6000 });
    await expect(page.getByTestId('list-effort')).toHaveCount(1);
    await page.getByTestId('row-barbell-incline-bench-press').tap();
    await expect(exerciseView(page, 'barbell-incline-bench-press')).toBeVisible();
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('1b Back to the list moves on at once without answering @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    await expect(view.getByTestId('effort')).toHaveCount(0); // 3.5g: asked on the list row only
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(view).toHaveCount(0, { timeout: 1500 });
    await expect(page.getByTestId('workout-title')).toBeVisible();
    expect(await dbAll(page, 'efforts')).toHaveLength(0);
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('workout-title')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('1c the next chip moves on at once without answering @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    await page.getByTestId('next-chip').getByRole('button').first().tap();
    await expect(exerciseView(page, 'barbell-incline-bench-press')).toBeVisible({ timeout: 2000 });
    expect(await dbAll(page, 'efforts')).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  test('1d prompt already answered: the old 2.5 s return to the list still works @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    const sessionId = page.url().split('/workout/')[1]!.split(/[?#/]/)[0]!;
    await dbPut(page, { efforts: [{ sessionId, exerciseId: 'barbell-back-squat', effort: 'hard', at: Date.now() }] });
    await logAll(view, 2);
    const page2 = page;
    await tapCircle(page2, view);
    const t0 = Date.now();
    await expect(page.getByTestId('next-chip')).toContainText('Nice. Next:');
    await expect(view).toHaveCount(0, { timeout: 5000 });
    const ms = Date.now() - t0;
    console.log('AUTO RETURN ms', ms);
    expect(ms).toBeGreaterThan(1800);
    expect(ms).toBeLessThan(4200);
    await expect(page.getByTestId('workout-title')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('9 hit boxes of the check button, set type button and inline Done @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    const out: Record<string, unknown> = {};
    out.check = await rect(checkCurrent(view));
    out.checkCircle = await rect(checkCurrent(view).locator('span').first());
    out.setType = await rect(view.getByTestId('set-type').first());
    await view.getByRole('button', { name: /^Reps for set 1/ }).tap();
    const doneBtn = view.getByRole('button', { name: 'Done', exact: true });
    await expect(doneBtn).toBeVisible({ timeout: 3000 }).catch(() => {});
    if (await doneBtn.count()) out.done = await rect(doneBtn);
    console.log('HITBOX', test.info().project.name, JSON.stringify(out));
    await snap(page, 'h9-stepper');
    expect(errors).toEqual([]);
  });

  async function missedSetup(page: Page) {
    await usePlan(page);
    const before = (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]!;
    await dbPut(page, { planState: [{ ...before, nextDayIndex: 2, doneDays: [0, 1] }] });
    await seed(page, Date.now() - 5 * DAY, three('barbell-back-squat', 8, lb(185, [45, 25])));
    await page.goto('./');
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'missed_days');
  }
  async function missedMetrics(page: Page) {
    return page.evaluate(() => {
      const card = document.querySelector('[data-testid="coach-card"]')!;
      const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, b: Math.round(r.bottom * 10) / 10 }; };
      const nav = document.querySelector('nav[aria-label="Main"]')!;
      const capsule = nav.firstElementChild ?? nav;
      return {
        heading: card.querySelector('h2')?.textContent,
        lines: Array.from(card.querySelectorAll('p')).map((p) => p.textContent),
        resume: { label: card.querySelector('[data-testid="coach-pick-up"]')!.textContent, ...box(card.querySelector('[data-testid="coach-pick-up"]')!) },
        restart: { label: card.querySelector('[data-testid="coach-rebuild"]')!.textContent, ...box(card.querySelector('[data-testid="coach-rebuild"]')!) },
        card: box(card),
        navTop: Math.round(nav.getBoundingClientRect().top), capsuleTop: Math.round(capsule.getBoundingClientRect().top), vh: innerHeight, scrollY,
      };
    });
  }
  for (const f of [1, 1.3]) {
    test(`2 missed days card at ${f * 100}% text: heading, one line, 48 pt buttons above the tab bar @matrix`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await missedSetup(page);
      if (f !== 1) { await scale(page, f); await page.waitForTimeout(300); }
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      const m = await missedMetrics(page);
      console.log('MISSED', test.info().project.name, f, JSON.stringify(m));
      await snap(page, `m2-missed-${f * 100}`);
      if (f === 1) await page.screenshot({ path: `reports/shots/3.8c/missed-${test.info().project.name.replace(/ /g, '-')}.png` });
      expect(m.heading).toBe('Missed 2 workouts');
      expect(m.lines).toHaveLength(1);
      expect(m.resume.label).toMatch(/^Resume Day \d+$/);
      expect(m.restart.label).toBe('Restart Day 1');
      expect(m.resume.h).toBeGreaterThanOrEqual(47.5);
      expect(m.restart.h).toBeGreaterThanOrEqual(47.5);
      expect(m.resume.w).toBeGreaterThanOrEqual(47.5);
      expect(m.restart.w).toBeGreaterThanOrEqual(47.5);
      // First screen, nothing scrolled (what the Codex finding judged): both buttons fully above the tab bar.
      // 3.8b round 2: at 130% text the page may scroll (the scrolled-to-end check below still holds); the first screen check is for 100%.
      if (f === 1) {
      expect.soft(m.resume.b, `first screen: Resume bottom ${m.resume.b} vs tab bar top ${m.capsuleTop}`).toBeLessThanOrEqual(m.capsuleTop);
      expect.soft(m.restart.b, `first screen: Restart bottom ${m.restart.b} vs tab bar top ${m.capsuleTop}`).toBeLessThanOrEqual(m.capsuleTop);
      }
      // After scrolling to the end of Today the card must clear the tab bar.
      await page.evaluate(() => { for (let n: HTMLElement | null = document.querySelector('[data-testid="coach-card"]'); n; n = n.parentElement) { if (n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY)) n.scrollTop = n.scrollHeight; } scrollTo(0, document.documentElement.scrollHeight); });
      await page.waitForTimeout(300);
      const e = await missedMetrics(page);
      console.log('MISSED scrolled', test.info().project.name, f, JSON.stringify({ resumeB: e.resume.b, restartB: e.restart.b, capsuleTop: e.capsuleTop, scrollY: e.scrollY }));
      await snap(page, `m2-missed-${f * 100}-scrolled`);
      expect(e.resume.b).toBeLessThanOrEqual(e.capsuleTop);
      expect(e.restart.b).toBeLessThanOrEqual(e.capsuleTop);
      expect(errors).toEqual([]);
    });
  }

  test('2b Resume keeps the plan state; Restart gives Day 1 with Undo (double tap is one) @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await missedSetup(page);
    const ps = () => dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState').then((x) => x[0]);
    await page.getByTestId('coach-pick-up').tap();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    expect(await ps()).toMatchObject({ nextDayIndex: 2, doneDays: [0, 1] });
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveCount(0);
    // a second week with a fresh setup for Restart
    await dbPut(page, { coachCards: [] });
    await page.evaluate(() => new Promise<void>((res) => { const r = indexedDB.open('anygym'); r.onsuccess = () => { const tx = r.result.transaction('coachCards', 'readwrite'); tx.objectStore('coachCards').clear(); tx.oncomplete = () => { r.result.close(); res(); }; }; }));
    await page.reload();
    await expect(page.getByTestId('coach-card')).toHaveAttribute('data-kind', 'missed_days');
    await page.getByTestId('coach-rebuild').dblclick();
    await expect.poll(ps).toMatchObject({ nextDayIndex: 0, doneDays: [] });
    await expect(page.getByText('Week rebuilt: Day 1 is next').first()).toBeVisible();
    await snap(page, 'm2-restarted');
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(ps).toMatchObject({ nextDayIndex: 2, doneDays: [0, 1] });
    expect(errors).toEqual([]);
  });

  async function selected(page: Page, id: string) {
    const g = page.getByTestId(id);
    const on = g.getByRole('radio', { checked: true });
    await expect(on).toHaveCount(1);
    const pill = await g.locator('[data-pill]').count();
    return { label: (await on.innerText()).trim(), pill };
  }
  test('3 Settings units: fresh profile shows the default pill; a change persists after reload @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
    const prof = await dbAll<Record<string, unknown>>(page, 'profile');
    console.log('PROFILE fresh', JSON.stringify(prof));
    await page.goto('./#/settings');
    await expect(page.getByTestId('settings-distance')).toBeVisible();
    const lang = await page.evaluate(() => navigator.languages[0]);
    const d0 = await selected(page, 'settings-distance');
    const m0 = await selected(page, 'settings-measure');
    console.log('DEFAULTS', lang, JSON.stringify([d0, m0]));
    const us = /-US$|^en$/.test(lang!);
    expect(d0).toEqual({ label: us ? 'mi' : 'km', pill: 1 });
    expect(m0).toEqual({ label: us ? 'in' : 'cm', pill: 1 });
    await page.getByTestId('settings-distance').scrollIntoViewIfNeeded();
    await snap(page, 's3-units-default');
    const other = us ? 'km' : 'mi';
    await page.getByTestId('settings-distance').getByRole('radio', { name: other }).tap();
    await expect(page.getByTestId('settings-distance').getByRole('radio', { name: other })).toBeChecked();
    await expect.poll(async () => (await dbAll<{ distanceUnit?: string }>(page, 'profile'))[0]?.distanceUnit).toBe(other);
    await page.reload();
    await expect(page.getByTestId('settings-distance').getByRole('radio', { name: other })).toBeChecked();
    expect((await selected(page, 'settings-measure')).label).toBe(m0.label);
    const otherM = us ? 'cm' : 'in';
    await page.getByTestId('settings-measure').getByRole('radio', { name: otherM }).tap();
    await expect.poll(async () => (await dbAll<{ measureUnit?: string }>(page, 'profile'))[0]?.measureUnit).toBe(otherM); // let the write land before reloading (Chromium drops it otherwise)
    await page.reload();
    await expect(page.getByTestId('settings-measure').getByRole('radio', { name: otherM })).toBeChecked();
    await expect(page.getByTestId('settings-distance').getByRole('radio', { name: other })).toBeChecked();
    await snap(page, 's3-units-changed');
    expect(errors).toEqual([]);
  });
});

test.describe('verify 3.8b swipe hint', () => {
  test('4 swipe hint is hidden while the effort prompt shows; elsewhere it has real height and nothing overlaps it @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => localStorage.setItem('anygym-hints', JSON.stringify({ plates: true, setCard: true, machine: true, wheel: true, stack: true })));
    const view = await twoExerciseWorkout(page);
    await tapCircle(page, view);
    await expect(loggedRows(view)).toHaveCount(1);
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    await expect(skip).toBeVisible();
    await skip.tap();
    await expect(skip).toHaveCount(0);
    const hint = view.locator('[data-testid="hint"][data-hint="swipeSet"]');
    await page.waitForTimeout(1800);
    const shown = await hint.count();
    const info: Record<string, unknown> = { hintCount: shown };
    if (shown) {
      const h = await rect(hint);
      const add = await rect(view.getByRole('button', { name: /Add set/ }));
      // 3.8b round 2: the slot that holds the swipe hint (the first tipSlot is the zero height ✓ reason slot above "+ Add set").
      const slot = await view.locator('[class*="tipSlot"]:has([data-hint="swipeSet"])').first().evaluate((el) => { const r = el.getBoundingClientRect(); return { h: r.height, y: r.y, cls: el.className }; });
      info.hint = h; info.add = add; info.slot = slot;
      info.hintOverlapsAdd = inter(h, add);
      // the first block that follows the slot (what sits right under the hint): does it start above the hint's bottom edge?
      info.nextBlock = await page.evaluate((addBottom) => {
        const hint = document.querySelector('[data-testid="hint"][data-hint="swipeSet"]')!.getBoundingClientRect();
        let best: { cls: string; top: number; overlapPt: number } | null = null;
        document.querySelectorAll('[data-testid^="exercise-"] *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (el.closest('[data-testid="hint"]') || el.contains(document.querySelector('[data-testid="hint"]'))) return;
          if (r.width > 200 && r.height > 60 && r.top > addBottom + 2 && r.top < hint.bottom && r.left < hint.right && r.right > hint.left) if (!best || r.top < best.top) best = { cls: String(el.className).slice(0, 40), top: Math.round(r.top), overlapPt: Math.round(hint.bottom - r.top) };
        });
        return best;
      }, add.b);
      info.overlaps = await page.evaluate(() => {
        const hintEl = document.querySelector('[data-testid="hint"][data-hint="swipeSet"]')!;
        const hr = hintEl.getBoundingClientRect();
        const out: string[] = [];
        document.querySelectorAll('[data-testid^="exercise-"] *').forEach((el) => {
          if (hintEl.contains(el) || el.contains(hintEl)) return;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return;
          if (!(el instanceof HTMLElement) || !(el.innerText || '').trim()) return;
          if (el.children.length) return;
          if (r.x < hr.x + hr.width && hr.x < r.x + r.width && r.y < hr.y + hr.height && hr.y < r.y + r.height) out.push(`${el.tagName}:${(el.innerText || '').trim().slice(0, 24)}`);
        });
        return out;
      });
    }
    console.log('HINT4', test.info().project.name, JSON.stringify(info));
    await snap(page, 'h4-hint-one-set');
    await tapCircle(page, view);
    await tapCircle(page, view);
    await expect(loggedRows(view)).toHaveCount(3);
    // 3.5g: the effort question is asked on the day list row only; with every set done the swipe tip still waits.
    await expect(view.getByTestId('effort')).toHaveCount(0);
    await page.waitForTimeout(300);
    const hintNow = await hint.count();
    console.log('HINT4 all done', JSON.stringify({ hintNow }));
    await snap(page, 'h4-prompt');
    expect(hintNow, 'swipe hint hidden once every set is done').toBe(0);
    if (shown) {
      expect.soft(info.hintOverlapsAdd, 'hint overlaps + Add set').toBe(false);
      expect.soft((info.slot as { h: number }).h, 'swipe hint slot has real height').toBeGreaterThan(20);
      expect.soft(info.overlaps, 'content overlapping the hint').toEqual([]);
      expect.soft((info.nextBlock as { overlapPt: number } | null)?.overlapPt ?? 0, `hint bottom over the next block: ${JSON.stringify(info.nextBlock)}`).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('verify 3.8b new best badge', () => {
  for (const f of [1, 1.3]) {
    test(`5 New best badge at ${f * 100}% text: popover, 44 pt hit, columns not clipped, finish lead @matrix`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.addInitScript(() => localStorage.setItem('anygym-hints', JSON.stringify({ plates: true, setCard: true, machine: true, wheel: true, stack: true, swipeSet: true })));
      const view = await twoExerciseWorkout(page);
      await tapCircle(page, view);
      await expect(loggedRows(view)).toHaveCount(1);
      const badge = view.getByTestId('pr-badge');
      await expect(badge).toHaveCount(1);
      await expect(badge).toContainText('New best');
      expect((await badge.innerText()).replace(/\s+/g, ' ').trim()).toBe('New best');
      await expect(badge).not.toContainText(/^PR$/);
      if (f !== 1) { await scale(page, f); await page.waitForTimeout(300); }
      const m = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="set-row"]')!;
        const box = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
        const w = row.querySelector('[data-testid="saved-weight"]')!;
        const a = row.querySelector('[data-testid="saved-amount"]')!;
        const b = row.querySelector('[data-testid="pr-badge"]')!;
        const chip = b.querySelector('[data-chip]')!;
        const clipped = (el: Element) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1;
        // the drawn glyphs of the reps number (a Range over its text), against the lime chip
        const glyphs = (el: Element) => { const rg = document.createRange(); rg.selectNodeContents(el.querySelector('span') ?? el); const r = rg.getBoundingClientRect(); return { x: r.x, r: r.right, w: r.width }; };
        const repsGlyph = glyphs(a);
        return { repsGlyph, row: box(row), weight: box(w), reps: box(a), badge: box(b), chip: box(chip), wText: w.textContent, aText: a.textContent, wClip: clipped(w), aClip: clipped(a), iw: innerWidth };
      });
      console.log('BADGE', test.info().project.name, f, JSON.stringify(m));
      await snap(page, `b5-badge-${f * 100}`);
      expect(m.badge.h).toBeGreaterThanOrEqual(44);
      expect(m.badge.w).toBeGreaterThanOrEqual(44);
      expect(m.wClip, 'weight clipped').toBe(false);
      expect(m.aClip, 'reps clipped').toBe(false);
      expect(m.weight.r, 'weight overlaps reps').toBeLessThanOrEqual(m.reps.x + 1);
      expect(m.badge.x, 'badge overlaps reps').toBeGreaterThanOrEqual(m.reps.x + 4);
      expect(m.badge.r).toBeLessThanOrEqual(m.row.r + 1);
      expect.soft(m.repsGlyph.r, `reps digits (right edge ${Math.round(m.repsGlyph.r)}) run under the New best chip (left edge ${Math.round(m.chip.x)})`).toBeLessThanOrEqual(m.chip.x + 0.5);
      expect(m.wText).toBe('185');
      expect(m.aText).toBe('11');
      await page.evaluate(() => document.querySelectorAll<HTMLElement>('body *').forEach((el) => (el.style.fontSize = '')));
      await badge.tap();
      await expect(page.getByTestId('pr-popover')).toContainText('New best');
      await snap(page, `b5-popover-${f * 100}`);
      expect(errors).toEqual([]);
    });
  }

  test('5b finish screen lead line still works @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await tapCircle(page, view);
    await expect(loggedRows(view)).toHaveCount(1);
    await page.getByRole('button', { name: 'Finish' }).tap();
    const confirm = page.getByRole('button', { name: /^(Finish workout|Finish)$/ }).last();
    await page.waitForTimeout(500);
    if (!/\/done$/.test(page.url())) await confirm.tap().catch(() => {});
    await expect(page).toHaveURL(/\/done$/, { timeout: 8000 });
    await expect(page.getByTestId('finish-win')).toBeVisible();
    console.log('LEAD', await page.getByTestId('finish-win').innerText());
    await snap(page, 'b5-finish');
    expect(errors).toEqual([]);
  });
});

test.describe('verify 3.8b units, a metric phone', () => {
  test.use({ locale: 'en-GB' });
  test('3b en-GB fresh profile: km and cm pills @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./#/settings');
    await expect(page.getByTestId('settings-distance')).toBeVisible();
    await expect(page.getByTestId('settings-distance').getByRole('radio', { name: 'km' })).toBeChecked();
    await expect(page.getByTestId('settings-measure').getByRole('radio', { name: 'cm' })).toBeChecked();
    expect(await page.getByTestId('settings-distance').locator('[data-pill]').count()).toBe(1);
    expect(errors).toEqual([]);
  });
});

// ---- Round 2 rechecks (tester) ----
test.describe('verify 3.8b round 2', () => {
  test('R1 set row buttons are 48 pt, plain tap works, Done is lime @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
    await page.waitForTimeout(300);
    const chk = await rect(checkCurrent(view));
    const typ = await rect(view.getByTestId('set-type').first());
    console.log('R1 boxes', test.info().project.name, JSON.stringify({ chk, typ }));
    expect(chk.h).toBeGreaterThanOrEqual(47.5); expect(chk.w).toBeGreaterThanOrEqual(47.5);
    expect(typ.h).toBeGreaterThanOrEqual(47.5); expect(typ.w).toBeGreaterThanOrEqual(47.5);
    // plain tap on the set type button opens something
    await view.getByTestId('set-type').first().tap({ timeout: 4000 });
    await snap(page, 'r1-settype-open');
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(5, 5).catch(() => {});
    await page.waitForTimeout(400);
    // reps stepper + Done
    await view.getByRole('button', { name: /^Reps for set 1/ }).tap();
    const done = view.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeVisible();
    const d = await rect(done);
    const colors = await done.evaluate((el) => { const rowEl = el.closest('[data-testid="set-row"], li, div')!; return { bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, rowBg: getComputedStyle(rowEl.parentElement ?? rowEl).backgroundColor }; });
    console.log('R1 done', test.info().project.name, JSON.stringify({ d, colors }));
    await snap(page, 'r1-done-pill');
    expect(d.h).toBeGreaterThanOrEqual(47.5);
    expect(d.w).toBeGreaterThanOrEqual(47.5);
    const m = colors.bg.match(/[\d.]+/g)!.map(Number);
    expect(m[1], `Done bg ${colors.bg} must be lime (high green)`).toBeGreaterThan(180);
    await done.tap({ timeout: 4000 });
    await expect(done).toHaveCount(0);
    // plain tap on check-current logs a set
    await checkCurrent(view).tap({ timeout: 4000 });
    await expect(loggedRows(view)).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('R3 unanswered: the list comes back after the chip, the prompt row stays on the list, still answerable on reopen @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    // 3.8c: SPEC 20.2 return restored; the prompt lives on the day list too.
    await expect(view).toHaveCount(0, { timeout: 6000 });
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toBeVisible();
    expect(await dbAll(page, 'efforts')).toHaveLength(0);
    await page.getByTestId('row-barbell-back-squat').tap();
    const v = exerciseView(page, 'barbell-back-squat');
    // 3.5g: the reopened exercise never asks; back on the list the row still does.
    await expect(v).toBeVisible();
    await expect(v.getByTestId('effort')).toHaveCount(0);
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(page.getByTestId('list-effort')).toBeVisible();
    await page.getByTestId('list-effort-good').tap();
    await expect.poll(async () => (await dbAll(page, 'efforts')).length).toBe(1);
    await snap(page, 'r3-reopened-answered');
    expect(errors).toEqual([]);
  });

  // 3.5g: the question is on the day list row (the list the SPEC 20.2 return lands on).
  test('R4 effort buttons are in view and clear of the chip and rest dock without scrolling @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoExerciseWorkout(page);
    await logAll(view);
    await expect(view).toHaveCount(0, { timeout: 6000 });
    await expect(page.getByTestId('list-effort')).toBeVisible();
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
      const btns = Array.from(document.querySelectorAll('[data-testid^="list-effort-"]')).map(box);
      const grp = box(document.querySelector('[data-testid="list-effort"]'));
      const chip = box(document.querySelector('[data-testid="next-chip"]'));
      const rest = box(document.querySelector('[data-testid="rest-timer"]'));
      const nav = box(document.querySelector('nav[aria-label="Main"]'));
      return { btns, grp, chip, rest, nav, vh: innerHeight };
    });
    console.log('R4', test.info().project.name, JSON.stringify(info));
    await snap(page, 'r4-effort-visible');
    expect(info.btns.length).toBe(3);
    const lowest = Math.max(...info.btns.map((b) => b!.b));
    const topmost = Math.min(...info.btns.map((b) => b!.t));
    expect(topmost).toBeGreaterThanOrEqual(0);
    for (const o of [info.chip, info.rest]) if (o) expect(lowest, `buttons bottom ${lowest} vs overlay top ${o.t}`).toBeLessThanOrEqual(o.t + 0.5);
    expect(lowest).toBeLessThanOrEqual(info.vh);
    expect(errors).toEqual([]);
  });

  for (const f of [1.3]) {
    test(`R4b effort buttons clear at ${f * 100}% text @matrix`, async ({ page }) => {
      const errors = watchErrors(page);
      const view = await twoExerciseWorkout(page);
      // 130% for everything now on screen, and for every element that appears later (the effort prompt, the chip), each scaled once.
      await page.evaluate((k) => {
        // two passes: read every size first, then write; later additions only scale elements that set their own size.
        const mark = (root: Element, all: boolean) => {
          const els = [root, ...Array.from(root.querySelectorAll('*'))].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.dataset.vs);
          const todo = els.map((el) => ({ el, s: parseFloat(getComputedStyle(el).fontSize), p: el.parentElement ? parseFloat(getComputedStyle(el.parentElement).fontSize) : 0 }));
          for (const { el, s, p } of todo) { el.dataset.vs = '1'; if (all || s !== p || el === root) el.style.fontSize = `${s * k}px`; }
        };
        mark(document.body, true);
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n instanceof Element && mark(n, false)))).observe(document.body, { childList: true, subtree: true });
      }, f);
      await logAll(view);
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => {
        const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom }; };
        return { btns: Array.from(document.querySelectorAll('[data-testid^="effort-"]:is(button,[role=radio])')).map(box), chip: box(document.querySelector('[data-testid="next-chip"]')), rest: box(document.querySelector('[data-testid="rest-timer"]')), vh: innerHeight };
      });
      console.log('R4b', test.info().project.name, JSON.stringify(info));
      await snap(page, 'r4b-effort-130');
      // 3.5g: no prompt on the exercise view; the guide stays in view and the day list row asks.
      expect(info.btns.length).toBe(0);
      await expect(view.getByTestId('set-next')).toBeInViewport({ ratio: 1 });
      await expect(view).toHaveCount(0, { timeout: 6000 });
      await expect(page.getByTestId('list-effort')).toBeVisible();
      for (const e of ['easy', 'good', 'hard']) expect((await page.getByTestId(`list-effort-${e}`).boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
      expect(errors).toEqual([]);
    });
  }
});
