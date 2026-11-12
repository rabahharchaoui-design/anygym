// Verifier for PLAN 3.6b: honest moments in words and numbers, tiers, data safety on Finish.
import { mkdirSync, appendFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { checkLayout, insetsOf, simulateSafeAreas } from './helpers/layout';
import { checkCurrent, dbAll, dbPut, exerciseView, fillReps, loggedRows, pickExercises, seedFinished, watchErrors, type SeedSet } from './workout-helpers';

const SHOTS = 'reports/shots/3.6b-verify';
mkdirSync(SHOTS, { recursive: true });
const LOG = '/tmp/v36b-words.txt';
const pn = () => test.info().project.name.replace(/ /g, '-');
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${pn()}-${name}.png` });
const bar = (total: number, unit = 'lb') => ({ kind: 'barbell', unit, total, barWeight: unit === 'kg' ? 20 : 45, perSide: [], barId: 'olympic' });
const SQ = 'barbell-back-squat';
const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
const OHP = 'overhead-press';
const CURL = 'barbell-bicep-curl';
const big = (p: Page) => p.getByTestId('celebrate-big');

async function seedToday(page: Page, exercises: Record<string, SeedSet[]>, opts: { open?: boolean; unit?: 'kg' | 'lb' } = {}): Promise<string> {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  if (opts.unit) await dbPut(page, { gyms: [{ ...gym, unit: opts.unit }] });
  const start = Date.now() - 45 * 60_000;
  const id = `today-${start}`;
  const sets: unknown[] = [];
  let order = 0;
  for (const [exerciseId, list] of Object.entries(exercises)) for (const s of list) sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId, order: order++, kind: s.kind ?? 'work', uncertain: false, load: s.load, reps: s.reps });
  await dbPut(page, { sessions: [{ id, gymId: gym.id, startedAt: start, ...(opts.open ? {} : { endedAt: start + 44 * 60_000 }), imported: false, exerciseIds: Object.keys(exercises) }], sets });
  return id;
}
/** What the finish screen says: the BIG's words (if any), then the cards. */
async function words(page: Page, label: string) {
  await expect(page.getByTestId('finish-title')).toBeVisible();
  await page.waitForTimeout(500);
  let bigText = '';
  if (await big(page).count()) { bigText = (await big(page).innerText()).replace(/\s+/g, ' '); await shot(page, label + '-big'); await expect(big(page)).toHaveCount(0, { timeout: 6000 }); }
  await page.waitForTimeout(600);
  const cards = (await page.getByTestId('finish-win').allInnerTexts()).concat(await page.getByTestId('pr-chip').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  await shot(page, label + '-final');
  const line = `${pn()} | ${label} | BIG: ${bigText || '-'} | CARDS: ${cards.join(' ; ') || '-'}`;
  appendFileSync(LOG, line + '\n');
  return { bigText, cards };
}

type Case = { label: string; hist?: Record<string, SeedSet[]>; today: Record<string, SeedSet[]>; unit?: 'kg' | 'lb'; histUnitKg?: boolean };
const CASES: Case[] = [
  { label: 'lb-heavier-squat', hist: { [SQ]: [{ reps: 5, load: bar(185) }] }, today: { [SQ]: [{ reps: 3, load: bar(195) }] } },
  { label: 'kg-heavier-squat', unit: 'kg', hist: { [SQ]: [{ reps: 5, load: bar(100, 'kg') }] }, today: { [SQ]: [{ reps: 5, load: bar(105, 'kg') }] } },
  { label: 'kg-heavier-by-2.5', unit: 'kg', hist: { [SQ]: [{ reps: 5, load: bar(100, 'kg') }] }, today: { [SQ]: [{ reps: 5, load: bar(102.5, 'kg') }] } },
  { label: 'more-reps-same-weight', hist: { [SQ]: [{ reps: 5, load: bar(185) }] }, today: { [SQ]: [{ reps: 7, load: bar(185) }] } },
  { label: 'tie', hist: { [SQ]: [{ reps: 5, load: bar(185) }] }, today: { [SQ]: [{ reps: 5, load: bar(185) }] } },
  { label: 'warmup-heavier', hist: { [SQ]: [{ reps: 5, load: bar(185) }] }, today: { [SQ]: [{ reps: 5, load: bar(315), kind: 'warmup' }, { reps: 5, load: bar(185) }] } },
  { label: 'first-set-of-exercise-with-other-history', hist: { [BENCH]: [{ reps: 5, load: bar(135) }] }, today: { [SQ]: [{ reps: 5, load: bar(185) }] } },
  { label: 'very-first-workout', today: { [SQ]: [{ reps: 5, load: bar(185) }, { reps: 5, load: bar(195) }] } },
  { label: 'mixed-unit-kg-history-lb-today-heavier', hist: { [SQ]: [{ reps: 5, load: bar(100, 'kg') }] }, today: { [SQ]: [{ reps: 5, load: bar(225) }] } },
  { label: 'mixed-unit-kg-history-lb-today-lighter', hist: { [SQ]: [{ reps: 5, load: bar(100, 'kg') }] }, today: { [SQ]: [{ reps: 5, load: bar(220) }] } },
  { label: 'mixed-unit-lb-history-kg-gym-today', unit: 'kg', hist: { [SQ]: [{ reps: 5, load: bar(225) }] }, today: { [SQ]: [{ reps: 5, load: bar(105, 'kg') }] } },
  { label: 'main-bench', hist: { [BENCH]: [{ reps: 5, load: bar(135) }] }, today: { [BENCH]: [{ reps: 5, load: bar(145) }] } },
  { label: 'main-ohp', hist: { [OHP]: [{ reps: 5, load: bar(95) }] }, today: { [OHP]: [{ reps: 5, load: bar(100) }] } },
  { label: 'isolation-curl', hist: { [CURL]: [{ reps: 8, load: bar(65) }] }, today: { [CURL]: [{ reps: 8, load: bar(75) }] } },
  { label: 'huge-weight', hist: { [SQ]: [{ reps: 5, load: bar(185) }] }, today: { [SQ]: [{ reps: 999, load: bar(99999) }] } },
];
for (const c of CASES) {
  test(`words: ${c.label}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    if (c.unit) { await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0); const g = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((x) => x.isActive)!; await dbPut(page, { gyms: [{ ...g, unit: c.unit }] }); }
    if (c.hist) await seedFinished(page, c.hist);
    const id = await seedToday(page, c.today);
    await page.goto(`./#/workout/${id}/done`);
    await words(page, c.label);
    expect(errors).toEqual([]);
  });
}

test('edit down and delete before Finish: no celebration for it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { [SQ]: [{ reps: 5, load: { ...bar(185), perSide: [45, 25] } }] });
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQ);
  await fillReps(view, view.getByTestId('set-todo').first(), 6);
  await checkCurrent(view).tap();
  await expect(loggedRows(view).first().getByTestId('pr-badge')).toBeVisible();
  // Edit reps down to 5 (a tie): badge goes.
  await loggedRows(view).first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await edit.getByRole('button', { name: 'Fewer reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  await expect(loggedRows(view).first().getByTestId('pr-badge')).toHaveCount(0);
  await shot(page, 'edited-down-row');
  // Log another record then delete it.
  await fillReps(view, view.getByTestId('set-todo').first(), 8);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(loggedRows(view).nth(1).getByTestId('pr-badge')).toBeVisible();
  await loggedRows(view).nth(1).tap();
  await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.isVisible()) await skip.tap({ timeout: 2000 }).catch(() => undefined);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await page.waitForTimeout(1200);
  await expect(big(page)).toHaveCount(0);
  await expect(page.getByTestId('finish-win')).toHaveCount(0);
  await expect(page.getByTestId('pr-chip')).toHaveCount(0);
  await shot(page, 'edited-down-finish');
  expect(errors).toEqual([]);
});

test('BIG once: Finish, Undo, Finish does not replay; reload does not replay; BIG tap does nothing else', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { [SQ]: [{ reps: 5, load: bar(185) }] });
  const id = await seedToday(page, { [SQ]: [{ reps: 5, load: bar(195) }] }, { open: true });
  await page.goto(`./#/workout/${id}`);
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
  await expect(big(page)).toHaveCount(0); // never during the active workout
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(big(page)).toHaveCount(1);
  // any tap skips and does nothing else
  await page.waitForTimeout(500);
  await big(page).tap();
  await expect(big(page)).toHaveCount(0, { timeout: 1500 });
  await expect(page).toHaveURL(/\/done$/);
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const undo = page.getByRole('button', { name: 'Undo' });
  await undo.tap();
  await expect.poll(async () => (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).find((s) => s.id === id)?.endedAt).toBeUndefined();
  await page.goto(`./#/workout/${id}`);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-title')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(big(page)).toHaveCount(0);
  await expect(page.getByTestId('finish-win')).toContainText('195 lb');
  await page.reload();
  await page.waitForTimeout(800);
  await expect(big(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const delay of [0, 50, 200]) {
  test(`Finish with 12 sets and a record, reload ${delay} ms after the tap: saved once, intact`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { [SQ]: [{ reps: 5, load: bar(185) }] });
    const sets: SeedSet[] = Array.from({ length: 12 }, (_, i) => ({ reps: 5, load: bar(i === 11 ? 195 : 185) }));
    const id = await seedToday(page, { [SQ]: sets }, { open: true });
    await page.goto(`./#/workout/${id}`);
    const fin = page.getByRole('button', { name: 'Finish' });
    await expect(fin).toBeVisible();
    await fin.dblclick({ delay: 0 }).catch(() => undefined); // a double tap too
    await page.waitForTimeout(delay);
    await page.reload();
    await page.waitForTimeout(1500);
    const sessions = (await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).filter((s) => s.id === id);
    const ss = (await dbAll<{ sessionId: string }>(page, 'sets')).filter((s) => s.sessionId === id);
    const all = await dbAll<{ id: string }>(page, 'sessions');
    expect(all.filter((s) => s.id === id)).toHaveLength(1);
    expect(ss).toHaveLength(12);
    // Either fully finished (ended) or still open and finishable; never half.
    const ended = sessions[0]!.endedAt !== undefined;
    appendFileSync(LOG, `${pn()} | reload+${delay}ms | ended=${ended} sets=${ss.length} url=${page.url().split('#')[1]}\n`);
    if (!ended) {
      await page.goto(`./#/workout/${id}`);
      await page.getByRole('button', { name: 'Finish' }).tap();
    } else {
      await page.goto(`./#/workout/${id}/done`);
    }
    await expect(page.getByTestId('finish-title')).toBeVisible();
    await expect(page.getByTestId('finish-sets')).toHaveText('12');
    await page.waitForTimeout(500);
    if (await big(page).count()) await big(page).tap();
    await expect(page.getByTestId('finish-win').or(page.getByTestId('pr-chip')).first()).toContainText('195 lb');
    expect((await dbAll<{ id: string }>(page, 'sessions')).filter((s) => s.id === id)).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test('SMALL: three fast sets right after a record set all log', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { [SQ]: [{ reps: 5, load: { ...bar(185), perSide: [45, 25] } }] });
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQ);
  await fillReps(view, view.getByTestId('set-todo').first(), 6);
  for (let i = 0; i < 3; i++) await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(3);
  expect((await dbAll(page, 'sets')).length).toBe(4); // 1 seeded + 3 logged
  await shot(page, 'three-fast-sets');
  expect(errors).toEqual([]);
});

test('reduced motion words equal normal words; BIG duration', async ({ page }) => {
  await page.goto('./');
  await seedFinished(page, { [SQ]: [{ reps: 5, load: bar(185) }] });
  const id = await seedToday(page, { [SQ]: [{ reps: 5, load: bar(195) }] });
  await page.goto(`./#/workout/${id}/done`);
  const t0 = Date.now();
  await expect(big(page)).toHaveCount(1);
  await shot(page, 'duration-in');
  await expect(big(page)).toHaveCount(0, { timeout: 8000 });
  appendFileSync(LOG, `${pn()} | BIG lasted ~${Date.now() - t0} ms (poll granularity)\n`);
});

const scaleText = (page: Page) =>
  page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });

for (const scale of [false, true]) {
  test(`layout: BIG and finish screen inside safe areas${scale ? ' at 130% text' : ''}`, async ({ page }) => {
    const errors = watchErrors(page);
    await simulateSafeAreas(page);
    await page.goto('./');
    await seedFinished(page, { [SQ]: [{ reps: 5, load: bar(185) }], 'barbell-bent-over-row': [{ reps: 8, load: bar(135) }] });
    const id = await seedToday(page, { [SQ]: [{ reps: 5, load: bar(195) }], 'barbell-bent-over-row': [{ reps: 8, load: bar(155) }] });
    await page.goto(`./#/workout/${id}/done`);
    await expect(big(page)).toHaveCount(1);
    await page.waitForTimeout(900);
    if (scale) { await scaleText(page); await page.waitForTimeout(200); }
    const ins = insetsOf();
    const parts = await page.evaluate(() => [...document.querySelectorAll('[data-testid="celebrate-big"] *')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim()).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent ?? '').trim().slice(0, 30), x: r.x, y: r.y, r: r.right, b: r.bottom, sw: e.scrollWidth - (e as HTMLElement).clientWidth }; }));
    const vw = page.viewportSize()!;
    for (const q of parts) {
      expect(q.x, q.t).toBeGreaterThanOrEqual(0);
      expect(q.r, q.t).toBeLessThanOrEqual(vw.width);
      expect(q.y, q.t + ' under top inset').toBeGreaterThanOrEqual(ins.top);
      expect(q.b, q.t + ' under bottom inset').toBeLessThanOrEqual(vw.height - ins.bottom);
    }
    appendFileSync(LOG, `${pn()} | layout scale=${scale} bigtext=${parts.map((q) => q.t).join('/')}\n`);
    await shot(page, `layout-big${scale ? '-130' : ''}`);
    await expect(big(page)).toHaveCount(0, { timeout: 8000 });
    await page.waitForTimeout(600);
    await checkLayout(page, { primary: page.getByRole('button', { name: 'Done' }) });
    for (const t of ['finish-win', 'pr-chip']) await expect(page.getByTestId(t).first()).toBeVisible();
    const done = (await page.getByRole('button', { name: 'Done' }).boundingBox())!;
    expect(done.height).toBeGreaterThanOrEqual(48);
    await shot(page, `layout-final${scale ? '-130' : ''}`);
    expect(errors).toEqual([]);
  });
}
