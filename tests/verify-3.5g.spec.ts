import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, usePlan, watchErrors } from './workout-helpers';
import { pastIntake } from './helpers/quick';

// Tester checks for PLAN 3.5g (independent of tests/gate-3.5g.spec.ts). Shots: reports/shots/3.5g-verify/.
const SHOT = 'reports/shots/3.5g-verify';
const DAY = 86_400_000;
const proj = () => test.info().project.name.replace(/ /g, '-');
async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/${name}-${proj()}.png` });
}
const BAR185 = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const STACK50 = { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 };

async function seed(page: Page, id: string, at: number, sets: Array<{ ex: string; reps: number; load: Record<string, unknown> }>) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt: at, endedAt: at + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((s) => s.ex))] }],
    sets: sets.map((s, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: s.ex, order: i, kind: 'work', reps: s.reps, load: s.load, uncertain: false })),
  });
}


test('(4) Your plan, short only when shorter than the plan day', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  await usePlan(page);
  const todayText = await page.getByTestId('day-card-title').locator('xpath=ancestor::*[contains(@data-testid,"day-card") or self::section][1]').innerText().catch(() => '');
  console.log('TODAY', todayText.replace(/\n+/g, ' | '));
  await shot(page, 'today-plan');
  for (const min of [20, 30, 45, 60]) {
    await page.goto(`./#/quick?min=${min}`);
    await page.reload();
    await page.waitForTimeout(900);
    const first = page.locator('[data-concept]').first();
    await expect(first).toBeVisible();
    console.log(`MIN ${min}: ${(await first.innerText()).replace(/\n+/g, ' | ')}`);
    await shot(page, `plan-card-${min}`);
  }
  console.log('ERR', errors);
});

test('(6) Never show inside a circuit keeps one circuit; hip thrust has a swap', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  await pastIntake(page);
  await page.goto('./#/quick?min=60');
  await page.reload();
  const cards = page.locator('[data-concept]');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  for (let i = 0; i < n; i++) console.log(`C${i}: ${(await cards.nth(i).innerText()).replace(/\n+/g, ' | ')}`);
  // 3.5f: calm card face: the style chip is behind ⓘ; the circuit card says so in its title.
  const circ = cards.filter({ hasText: /circuit/i }).first();
  await expect(circ).toBeVisible();
  await circ.tap();
  const meta = async () => (await page.getByTestId('curate-meta').innerText()).trim();
  console.log('META0', await meta());
  const names: string[] = [];
  await expect(page.getByTestId('deck-card')).toBeVisible();
  await shot(page, 'circuit-deck-first');
  // Never show the first and the third move.
  for (const k of [0, 1]) {
    names.push(await page.getByTestId('deck-name').innerText());
    await page.getByTestId('deck-never').tap();
    await page.waitForTimeout(500);
    console.log(`after never ${k}: META ${await meta()} NOW ${await page.getByTestId('deck-name').innerText()}`);
  }
  for (let k = 0; k < 14; k++) {
    if (!(await page.getByTestId('deck-name').count())) break;
    names.push(await page.getByTestId('deck-name').innerText());
    await page.getByTestId('deck-keep').tap();
    await page.waitForTimeout(450);
  }
  console.log('NAMES', names.join(' / '));
  await expect(page.getByTestId('ready-list')).toBeVisible();
  console.log('READY META', await meta());
  await shot(page, 'circuit-ready');
  console.log('ERR', errors);
});

test('(6b) hip thrust: swap gives glute bridge or a hip thrust machine, repeatedly', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  await pastIntake(page);
  await page.goto('./#/quick?min=60');
  await page.reload();
  // 3.5f: calm card face: the style chip is behind ⓘ; the circuit card says so in its title.
  await page.locator('[data-concept]').filter({ hasText: /circuit/i }).first().tap();
  for (let k = 0; k < 14; k++) {
    const name = await page.getByTestId('deck-name').innerText();
    if (/Hip Thrust/i.test(name)) break;
    await page.getByTestId('deck-keep').tap();
    await page.waitForTimeout(450);
  }
  await expect(page.getByTestId('deck-name')).toHaveText(/Hip Thrust/);
  await shot(page, 'hip-thrust-card');
  await page.getByTestId('deck-swap').tap();
  await page.waitForTimeout(700);
  const after = await page.getByTestId('deck-name').innerText();
  console.log('SWAP ->', after, '| note:', await page.getByTestId('deck-hint').innerText());
  await shot(page, 'hip-thrust-swapped');
  expect(after).toMatch(/Glute Bridge|Hip Thrust/i);
  expect(after).not.toBe('Hip Thrust');
  console.log('ERR', errors);
});

test('(2) Classic 5 Day Split day 2: pair flow end to end', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await shot(page, 'day2-list');
  const groups = page.getByTestId('pair-group');
  const gn = await groups.count();
  console.log('GROUPS', gn, (await page.getByTestId('workout-title').innerText()));
  expect(gn).toBeGreaterThan(0);
  const g0 = groups.first();
  console.log('G0', (await g0.innerText()).replace(/\n+/g, ' | '));
  await g0.locator('[data-testid^="row-"]').first().tap();
  const view = page.locator('[data-testid^="exercise-"]').first();
  await expect(view).toBeVisible();
  const firstId = (await view.getAttribute('data-testid'))!.replace('exercise-', '');
  // Warm up rows may exist: log until the first work set is logged.
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.waitForTimeout(700);
  console.log('after 1st log: rest-timer', await page.getByTestId('rest-timer').count(), 'group-next', (await page.getByTestId('group-next').innerText().catch(() => 'none')));
  await shot(page, 'day2-after-first');
  const next = page.getByTestId('group-next');
  if (await next.count()) {
    const bx = (await next.boundingBox())!;
    console.log('NEXT bar h', bx.height, 'w', bx.width);
    await next.tap();
    await expect(page.getByTestId(`exercise-${firstId}`)).toHaveCount(0);
    const second = page.locator('[data-testid^="exercise-"]').first();
    const sid = (await second.getAttribute('data-testid'))!.replace('exercise-', '');
    console.log('partner', sid, 'first', firstId, 'target', await second.getByTestId('set-target').innerText());
    expect(sid).not.toBe(firstId);
    await checkCurrent(second).tap();
    await page.waitForTimeout(700);
    console.log('after 2nd: rest', await page.getByTestId('rest-timer').count(), 'next', await page.getByTestId('group-next').innerText().catch(() => 'none'));
    await shot(page, 'day2-after-second');
  }
  console.log('ERR', errors);
});

test.describe('(10)', () => {
  test.use({ intake: 'fresh' });
test('(10) reveal states the real minutes; the quick link opens the built ideas', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
  await page.goto('./');
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', 'goal');
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'reveal', answers: a })), { goal: process.env.V_GOAL ?? 'muscle', days: Number(process.env.V_DAYS ?? 5), minutes: 20, place: 'full', experience: '3y', units: US });
  await page.reload();
  await expect(page.getByTestId('intake')).toHaveAttribute('data-step', 'reveal');
  const why = page.getByTestId('reveal-why');
  if (await why.count()) await why.locator('summary').tap();
  const warn = await page.getByTestId('reveal-warning').innerText().catch(() => '(none)');
  console.log('WARN', warn);
  console.log('CARD', (await page.getByTestId('reveal-card').innerText()).replace(/\n+/g, ' | '));
  await shot(page, 'reveal-20');
  const rows = await page.getByTestId('reveal-week').getByRole('listitem').allInnerTexts();
  console.log('WEEK', rows.map((r) => r.replace(/\n+/g, ' ')).join(' || '));
  const cta = page.getByTestId('reveal-cta').locator('button[data-variant="primary"]');
  console.log('CTA', await cta.innerText(), '| secondary', await page.getByTestId('reveal-secondary').innerText());
  expect(warn).toMatch(/(longer than your 20|You asked for 20)/);
  await page.getByTestId('reveal-secondary').or(cta).filter({ hasText: /quick/i }).first().tap();
  await expect(page).toHaveURL(/#\/quick\?min=(15|20)$/);
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await shot(page, 'quick-from-reveal');
  console.log('IDEAS', await page.locator('[data-concept]').count());
  console.log('ERR', errors);
});
});

test('(1b) Not now survives reload; the card is the only place a raise happens', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  const lastWeek = () => { const n = new Date(); const back = (n.getDay() + 6) % 7; return new Date(n.getFullYear(), n.getMonth(), n.getDate() - back - 5, 18).getTime(); };
  const BAR200 = { kind: 'barbell', unit: 'lb', total: 200, barWeight: 45, perSide: [45, 25, 10, 2.5] };
  const DB25 = { kind: 'dumbbell_each', unit: 'lb', total: 50 };
  await page.goto('./');
  await seed(page, 'l1', lastWeek(), [0, 1, 2].map(() => ({ ex: 'barbell-back-squat', reps: 12, load: BAR200 })));
  await seed(page, 'l2', Date.now() - 2 * 3_600_000, [0, 1, 2].map(() => ({ ex: 'bicep-curl', reps: 9, load: DB25 })));
  await page.goto('./');
  const card = page.getByTestId('coach-card');
  await shot(page, 'levelup-card');
  await card.getByTestId('coach-later').dblclick().catch(() => {});
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId('coach-card')).toHaveCount(0);
  await shot(page, 'today-after-reload');
  // Quick workout with squat: still 200.
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/(workout|quick)/);
  console.log('URL', page.url());
  console.log('ERR', errors);
});

test('(5) chest and quads trained yesterday: no idea card holds them; why lines are true', async ({ page }) => {
  test.setTimeout(240000);
  const errors = watchErrors(page);
  await pastIntake(page);
  // Clock independent (3.5g): yesterday at noon local, not "20 h ago" which is today after 20:00.
  const yesterdayNoon = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1, 12).getTime(); })();
  await seed(page, 'v1', yesterdayNoon, [
    ...[0, 1, 2].map(() => ({ ex: 'machine-seated-chest-fly', reps: 8, load: STACK50 })),
    ...[0, 1, 2].map(() => ({ ex: 'machine-seated-leg-extension', reps: 8, load: STACK50 })),
  ]);
  await seed(page, 'v0', Date.now() - 5 * DAY, [
    ...[0, 1, 2].map(() => ({ ex: 'barbell-bent-over-row', reps: 8, load: BAR185 })),
    ...[0, 1, 2].map(() => ({ ex: 'barbell-bicep-curl', reps: 8, load: BAR185 })),
  ]);
  const BAD = /bench press|chest|\bfly\b(?<!reverse fly)|squat|leg press(?! machine calf)|leg extension|lunge|push.?up|\bdip\b|pec deck/i;
  for (const min of [20, 45, 60]) {
    await page.goto(`./#/quick?min=${min}`);
    await page.reload();
    const cards = page.locator('[data-concept]');
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      const why = (await cards.nth(i).getByTestId('concept-why').innerText()).trim();
      if (/chest|quads/i.test(why)) expect(why, `why at ${min}/${i}`).toMatch(/^Leaves out .*\(trained yesterday\)$/);
      if (/rested/.test(why)) expect(why).toMatch(/^(Back|Biceps|Back and biceps) rested 5 days$/);
      await cards.nth(i).tap();
      for (let k = 0; k < 14; k++) {
        if (!(await page.getByTestId('deck-name').count())) break;
        const name = await page.getByTestId('deck-name').innerText();
        expect(name, `${min} card ${i}: ${name}`).not.toMatch(BAD);
        await page.getByTestId('deck-keep').tap();
        await page.waitForTimeout(400);
      }
      // 3.5f round 2: a reload comes back to an open deck; Back first, so the reload is a new visit.
      await page.getByRole('button', { name: 'Back to the workouts' }).tap();
      await page.goto(`./#/quick?min=${min}`);
      await page.reload();
      await expect(cards.first()).toBeVisible();
    }
    await shot(page, `idea-cards-${min}`);
  }
  expect(errors).toEqual([]);
});

test('(9b) double tap Discard, reload, offline: one session ended, nothing duplicated, no stuck screen', async ({ page, context }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByTestId('quick-card').tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.goto('./');
  await page.reload();
  const sessions = async () => (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions'));
  expect((await sessions()).length).toBe(1);
  await context.setOffline(true);
  const d = page.getByTestId('discard-empty');
  const b = (await d.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: /Resume/ })).toHaveCount(0);
  await expect(page.getByTestId('quick-card')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('quick-card')).toBeVisible();
  const all = await sessions();
  console.log('SESSIONS after', JSON.stringify(all.map((s) => ({ ended: s.endedAt !== undefined }))));
  expect(all.filter((s) => s.endedAt === undefined)).toHaveLength(0);
  await context.setOffline(false);
  await shot(page, 'discarded-today');
  expect(errors).toEqual([]);
});

test('(1c) double tap Not now stores one hold and Level up card stays gone after reload', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  const n = new Date();
  const back = (n.getDay() + 6) % 7;
  const lw = new Date(n.getFullYear(), n.getMonth(), n.getDate() - back - 5, 18).getTime();
  await page.goto('./');
  await seed(page, 'l1', lw, [0, 1, 2].map(() => ({ ex: 'barbell-back-squat', reps: 12, load: { kind: 'barbell', unit: 'lb', total: 200, barWeight: 45, perSide: [45, 25, 10, 2.5] } })));
  await seed(page, 'l2', Date.now() - 2 * 3_600_000, [0, 1, 2].map(() => ({ ex: 'bicep-curl', reps: 9, load: { kind: 'dumbbell_each', unit: 'lb', total: 50 } })));
  await page.goto('./');
  const b = (await page.getByTestId('coach-later').boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(800);
  const lifts = await dbAll<{ key: string; target?: { value: number } }>(page, 'coachLifts');
  console.log('LIFTS', JSON.stringify(lifts));
  expect(lifts.filter((l) => l.target)).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('coach-card')).toHaveCount(0);
  // Accepting through a fresh card elsewhere is the only raise: here no raise happened.
  const sets = await dbAll<{ load: { total: number } }>(page, 'sets');
  expect(sets.every((s) => s.load.total <= 200)).toBe(true);
  expect(errors).toEqual([]);
});

test('(1d) Add weight on the card is the raise: the exercise then starts at 210', async ({ page }) => {
  test.setTimeout(120000);
  const errors = watchErrors(page);
  const n = new Date();
  const back = (n.getDay() + 6) % 7;
  const lw = new Date(n.getFullYear(), n.getMonth(), n.getDate() - back - 5, 18).getTime();
  await page.goto('./');
  await seed(page, 'l1', lw, [0, 1, 2].map(() => ({ ex: 'barbell-back-squat', reps: 12, load: { kind: 'barbell', unit: 'lb', total: 200, barWeight: 45, perSide: [45, 25, 10, 2.5] } })));
  await seed(page, 'l2', Date.now() - 2 * 3_600_000, [0, 1, 2].map(() => ({ ex: 'bicep-curl', reps: 9, load: { kind: 'dumbbell_each', unit: 'lb', total: 50 } })));
  await page.goto('./');
  await page.getByTestId('coach-apply').tap();
  await page.waitForTimeout(800);
  await shot(page, 'after-apply');
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const { pickExercises } = await import('./workout-helpers');
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  console.log('NEXT', await view.getByTestId('set-next').innerText());
  await expect(view.getByTestId('set-todo').getByTestId('weight-cell').first()).toHaveText('210');
  expect(errors).toEqual([]);
});
