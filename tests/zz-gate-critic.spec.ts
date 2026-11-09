import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { watchErrors } from './workout-helpers';
import { seedLifter } from './zz-gate-critic-seed';

const ROOT = '/tmp/gc/final';
async function scrollMain(page: Page, y: number) {
  await page.evaluate((dy) => {
    const els = [document.scrollingElement!, ...Array.from(document.querySelectorAll<HTMLElement>('*'))].filter((e) => (e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)) || e === document.scrollingElement);
    const best = els.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))[0]!;
    best.scrollBy(0, dy);
  }, y);
}
async function scaleText(page: Page) {
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const s = getComputedStyle(el);
      const size = parseFloat(el.dataset.baseFont ?? s.fontSize);
      const line = parseFloat(el.dataset.baseLine ?? s.lineHeight);
      el.dataset.baseFont = String(size);
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) { el.dataset.baseLine = String(line); el.style.lineHeight = `${line * 1.3}px`; }
    }
  });
  await page.waitForTimeout(200);
}
async function overflow(page: Page) {
  return page.evaluate(() => {
    const W = innerWidth; const bad: string[] = [];
    if (document.documentElement.scrollWidth > W) bad.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, h1, h2, h3, p, span, a, li'))) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(el).visibility !== 'hidden') bad.push(`${el.tagName} "${(el.innerText || '').slice(0, 30)}" ${Math.round(r.left)}..${Math.round(r.right)}`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'hidden' && (el.innerText || '').length > 0 && el.children.length === 0) bad.push(`clipped "${el.innerText.slice(0, 30)}"`);
    }
    return bad.slice(0, 8);
  });
}
function kit(page: Page, tag: string) {
  const p = test.info().project.name.replace(/ /g, '-');
  const dir = `${ROOT}/${p}`; mkdirSync(dir, { recursive: true });
  let n = 0;
  return {
    shot: async (name: string, wait = 550) => { await page.waitForTimeout(wait); const f = `${dir}/${tag}-${String(n++).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f }); const o = await overflow(page); if (o.length) console.log('OVERFLOW', p, tag, name, JSON.stringify(o)); },
    step: async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.log('FAIL', p, tag, name, String(e).split('\n')[0]!.slice(0, 200)); } },
  };
}

test.use({ video: 'on' });
test.describe.configure({ mode: 'parallel' });

test.describe('fresh', () => {
  test.use({ intake: 'fresh' });
  test('fresh intake to first set', async ({ page }) => {
    test.setTimeout(240_000); page.setDefaultTimeout(6000);
    const errors = watchErrors(page);
    const { shot, step } = kit(page, 'fresh');
    await page.goto('./');
    const intake = page.getByTestId('intake');
    const cta = page.getByTestId('intake-cta').locator('button[data-variant="primary"]');
    const pick = async (label: string | RegExp) => { await intake.getByRole('button', { name: label }).or(intake.getByRole('radio', { name: label })).or(intake.getByRole('checkbox', { name: label })).first().tap(); await page.waitForTimeout(450); };
    const go = async () => { if (await cta.count()) { await cta.tap(); await page.waitForTimeout(500); } };
    await shot('goal');
    await step('goal', async () => { await pick(/Build muscle/); await pick(/Get stronger/); await shot('goal-two'); await go(); });
    await step('units', async () => { await shot('units'); await go(); });
    await step('focus', async () => { await pick(/Arms/); await go(); });
    await step('win', async () => { await go(); });
    await step('exp', async () => { await shot('experience'); await pick(/Brand new/); });
    await step('days', async () => { await shot('days'); await pick(/3 days/); });
    await step('weekdays', async () => { await shot('weekdays'); await pick('Monday'); await pick('Wednesday'); await pick('Friday'); await go(); });
    await step('minutes', async () => { await pick(/45 min/); });
    await step('place', async () => { await shot('place'); await pick(/Full gym/); });
    await step('equip', async () => { await shot('equipment'); await scrollMain(page, 600); await shot('equipment-2'); await scrollMain(page, -2000); await go(); });
    for (let i = 0; i < 9; i++) {
      await step('rest' + i, async () => {
        const st = await intake.getAttribute('data-step');
        if (st === 'reveal') return;
        await shot('step-' + st);
        if (st === 'bodyweight' || st === 'about' || st === 'when' || st === 'exercises' || st === 'easyOn' || st === 'style') { const skip = intake.getByRole('button', { name: 'Skip', exact: true }); if (await skip.count()) { await skip.first().tap(); await page.waitForTimeout(500); return; } }
        if (await cta.count() && !(await cta.isDisabled())) { await go(); return; }
        const opt = intake.locator('main [aria-pressed="false"], main [role="radio"]');
        await opt.first().tap(); await page.waitForTimeout(500);
        if ((await intake.getAttribute('data-step')) === st) await go();
      });
    }
    await step('reveal', async () => { await expect(intake).toHaveAttribute('data-step', 'reveal'); await shot('reveal', 1400); await scrollMain(page, 700); await shot('reveal-2'); await scrollMain(page, -3000); await scaleText(page); await shot('reveal-130'); await page.reload(); await page.waitForTimeout(800); });
    await step('start', async () => { await page.getByTestId('reveal-cta').or(page.getByRole('button', { name: /Start Day 1/ })).first().tap(); await page.waitForTimeout(1200); await shot('after-reveal'); });
    await step('list', async () => { if (await page.getByTestId('workout-title').count()) { await shot('daylist'); } });
    await step('firstex', async () => { const s = page.getByTestId('start-next'); if (await s.count()) await s.tap(); await page.waitForTimeout(1000); await shot('first-exercise'); await scaleText(page); await shot('first-exercise-130'); });
    await step('log', async () => { await page.reload(); await page.waitForTimeout(900); const c = page.getByTestId('check-current'); await c.first().tap(); await shot('first-log-120ms', 120); await shot('first-log'); });
    await step('today', async () => { await page.goto('./'); await page.waitForTimeout(900); await shot('today-new'); await scrollMain(page, 800); await shot('today-new-2'); });
    console.log('ERRORS', test.info().project.name, JSON.stringify(errors));
  });
});

test('lifter today and coach', async ({ page }) => {
  test.setTimeout(240_000); page.setDefaultTimeout(6000);
  const errors = watchErrors(page);
  const { shot, step } = kit(page, 'today');
  await seedLifter(page, { missLast: ['barbell-back-squat'], thisWeekDays: 1 });
  await page.waitForTimeout(900);
  await shot('today');
  await step('scroll', async () => { await scrollMain(page, 700); await shot('today-2'); await scrollMain(page, 2200); await shot('today-3'); await scrollMain(page, 3000); await shot('today-end'); await scrollMain(page, -9000); });
  await step('130', async () => { await scaleText(page); await shot('today-130'); await scrollMain(page, 800); await shot('today-130-2'); await page.reload(); await page.waitForTimeout(900); });
  await step('time', async () => { await page.getByTestId('day-card-time').tap(); await shot('time-sheet'); await page.getByRole('dialog').getByText('30', { exact: true }).first().tap(); await shot('time-30'); await page.getByRole('dialog').getByText('45', { exact: true }).first().tap(); await shot('time-45'); await page.reload(); await page.waitForTimeout(800); });
  await step('apply', async () => { const c = page.getByTestId('coach-card'); await c.getByTestId('coach-apply').tap(); await shot('applied'); });
  console.log('ERRORS', test.info().project.name, JSON.stringify(errors));
});

test('lifter workout', async ({ page }) => {
  test.setTimeout(240_000); page.setDefaultTimeout(6000);
  const errors = watchErrors(page);
  const { shot, step } = kit(page, 'work');
  await seedLifter(page, { missLast: ['barbell-back-squat'], thisWeekDays: 1 });
  await page.waitForTimeout(800);
  await step('start', async () => { await page.getByRole('button', { name: 'Start', exact: true }).tap(); await page.waitForTimeout(1000); await shot('daylist'); await scrollMain(page, 650); await shot('daylist-2'); await scrollMain(page, -3000); });
  await step('dbbench', async () => { await page.getByTestId('row-dumbbell-bench-press').tap(); await page.waitForTimeout(900); await shot('db-bench'); });
  await step('dblog', async () => { const c = page.getByTestId('check-current'); for (let i = 0; i < 6 && (await c.count()); i++) { await c.first().tap(); await page.waitForTimeout(500); } await shot('db-bench-done'); });
  await step('back', async () => { await page.goBack(); await page.waitForTimeout(800); await shot('list-after-db'); });
  await step('incline', async () => { await page.getByTestId('row-barbell-incline-bench-press').tap(); await page.waitForTimeout(900); await shot('incline'); await page.getByTestId('check-current').first().tap(); await shot('incline-log-150', 150); await shot('incline-log-1'); });
  await step('130', async () => { await scaleText(page); await shot('incline-130'); });
  console.log('ERRORS', test.info().project.name, JSON.stringify(errors));
});

test('quick', async ({ page }) => {
  test.setTimeout(240_000); page.setDefaultTimeout(6000);
  const errors = watchErrors(page);
  const { shot, step } = kit(page, 'quick');
  await seedLifter(page, { thisWeekDays: 1 });
  await page.waitForTimeout(800);
  await step('open', async () => { const b = page.getByTestId('build-card'); await b.scrollIntoViewIfNeeded(); await b.tap(); await page.waitForTimeout(900); await shot('quick'); await scrollMain(page, 900); await shot('quick-2'); await scrollMain(page, 900); await shot('quick-3'); await scrollMain(page, -3000); });
  await step('130', async () => { await scaleText(page); await shot('quick-130'); await page.reload(); await page.waitForTimeout(900); });
  await step('15', async () => { await page.getByTestId('min-15').tap(); await page.waitForTimeout(600); await shot('quick-15'); });
  await step('deck', async () => { await page.locator('[data-concept]').first().tap(); await page.waitForTimeout(900); await shot('deck'); await scaleText(page); await shot('deck-130'); });
  console.log('ERRORS', test.info().project.name, JSON.stringify(errors));
});

for (const v of ['welcome', 'deload', 'plateau', 'leveled'] as const) {
  test(`coach ${v}`, async ({ page }) => {
    test.setTimeout(240_000); page.setDefaultTimeout(6000);
    const errors = watchErrors(page);
    const { shot, step } = kit(page, 'coach-' + v);
    if (v === 'welcome') await seedLifter(page, { endWeeksAgo: 2, weeks: 3 });
    if (v === 'deload') await seedLifter(page, { weeks: 6, thisWeekDays: 1 });
    if (v === 'plateau') await seedLifter(page, { weeks: 3, plateau: true, midReps: true, thisWeekDays: 1 });
    if (v === 'leveled') {
      await seedLifter(page, { thisWeekDays: 1 });
      await step('turn on', async () => { await page.goto('./#/settings'); await page.reload(); await page.waitForTimeout(900); const c = page.getByTestId('settings-coach'); await c.scrollIntoViewIfNeeded(); await c.getByText('Auto level up', { exact: true }).tap(); await page.waitForTimeout(700); await shot('auto-sheet'); await page.getByRole('dialog').getByRole('button', { name: 'Turn on' }).tap(); await page.waitForTimeout(800); await page.goto('./'); });
    }
    await page.waitForTimeout(1000);
    await step('card', async () => { const c = page.getByTestId('coach-card').or(page.getByTestId('coach-line')).first(); await c.scrollIntoViewIfNeeded(); await shot('card'); console.log('COACH', v, test.info().project.name, (await c.innerText()).replace(/\n+/g, ' / ').slice(0, 600)); });
    await step('see', async () => { const s = page.getByTestId('coach-see-changes'); if (await s.count()) { await s.tap(); await page.waitForTimeout(800); await shot('see-changes'); const u = page.getByTestId('change-undo').first(); await u.tap(); await page.waitForTimeout(600); await shot('undone'); } });
    console.log('ERRORS', test.info().project.name, JSON.stringify(errors));
  });
}
