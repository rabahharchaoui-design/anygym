import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';

// PLAN 3.3a round 2 independent checks: items off in a full gym, the honest brand new reveal.
test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));
const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const intake = (page: Page) => page.getByTestId('intake');
const drafted = async (page: Page, step: string, answers: Record<string, unknown>) => {
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, answers] as const);
  await page.reload();
  await expect(intake(page)).toHaveAttribute('data-step', step);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await page.waitForTimeout(400);
};

test('(a) full gym, kettlebells then rower then thigh machine off: reveal still offers a plan (PLAN 3.5: Your plan built from what is on)', async ({ page }) => {
  await drafted(page, 'equipment', { goal: 'muscle', goals: ['muscle'], units: US, days: 4, minutes: 60, place: 'full', equipmentFor: 'full', experience: '3y' });
  const on = async () => ((await page.evaluate(() => JSON.parse(localStorage.getItem('anygym.intakeDraft')!).answers.equipment)) as string[]);
  const reveal = async (n: number) => {
    const eq = await on();
    expect(eq).toHaveLength(n);
    await page.evaluate((e) => { const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!); d.step = 'reveal'; d.answers.equipment = e; localStorage.setItem('anygym.intakeDraft', JSON.stringify(d)); }, eq);
    await page.reload();
    await expect(intake(page)).toHaveAttribute('data-step', 'reveal');
    await page.waitForTimeout(1500);
    // Round 3 (B2): the reason and warning sit behind "Why this plan"; the summary line says the swaps up front.
    const summary = (await page.getByTestId('reveal-summary').count()) ? await page.getByTestId('reveal-summary').innerText() : '';
    const reason = `${summary} ${(await page.getByTestId('reveal-reason').textContent()) ?? ''}`;
    const warn = (await page.getByTestId('reveal-warning').count()) ? ((await page.getByTestId('reveal-warning').textContent()) ?? '') : '';
    const quick = (await page.getByTestId('reveal-quick').count()) ? await page.getByTestId('reveal-quick').innerText() : '';
    const heading = await page.locator('h1').first().innerText();
    const primary = await page.getByTestId('reveal-cta').locator('button[data-variant="primary"]').innerText();
    const week = await page.getByTestId('reveal-week').count();
    console.log(`R2a ${test.info().project.name} off=${27 - n}: ${heading} | primary="${primary}" week=${week} | reason="${reason.replace(/\n/g, ' ')}" | warning="${warn}" | quick="${quick}"`);
    await page.screenshot({ path: `reports/shots/3.3a/verify/r2-reveal-off${27 - n}-${test.info().project.name.replace(/ /g, '-')}.png` });
    // PLAN 3.5: no curated 4 day plan, so the generator builds Your plan from the gear that is on
    // (nothing to swap); one item off still gives a plan, with the check and Start Day 1.
    expect(week, `plan week shown with ${27 - n} off`).toBe(1);
    await expect(page.getByTestId('reveal-week').getByRole('listitem')).toHaveCount(4);
    expect(heading).toBe('Your plan');
    expect(primary).toBe('Start Day 1');
    expect(reason).toMatch(/^ ?Built to build muscle: 4 days, about \d+ min, full gym\./);
    expect(`${reason} ${warn}`).not.toMatch(/aren't built in|plan yet/);
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('anygym.intakeDraft')!); d.step = 'equipment'; localStorage.setItem('anygym.intakeDraft', JSON.stringify(d)); });
    await page.reload();
    await expect(intake(page)).toHaveAttribute('data-step', 'equipment');
    await page.waitForTimeout(400);
  };
  await page.getByTestId('equip-all').tap();
  expect(await on()).toHaveLength(27);
  await page.getByTestId('equip-kettlebells').tap();
  await reveal(26);
  await page.getByTestId('equip-rower').scrollIntoViewIfNeeded();
  await page.getByTestId('equip-rower').tap();
  await reveal(25);
  await page.getByTestId('equip-hip_adductor_abductor').scrollIntoViewIfNeeded();
  await page.getByTestId('equip-hip_adductor_abductor').tap();
  await reveal(24);
});

test('(b) brand new, 3 days, 45 min (PLAN 3.5): a 3 day plan that fits 45 min is a true match, Start Day 1 leads, a quick workout is the option', async ({ page }) => {
  await drafted(page, 'reveal', { goal: 'muscle', goals: ['muscle'], units: US, days: 3, minutes: 45, place: 'full', equipmentFor: 'full', experience: 'new' });
  await page.waitForTimeout(1500);
  const heading = await page.locator('h1').first().innerText();
  const primary = await page.getByTestId('reveal-cta').locator('button[data-variant="primary"]').innerText();
  console.log(`R2b ${test.info().project.name}: title="${heading}" primary="${primary}" secondary="${(await page.getByTestId('reveal-secondary').count()) ? await page.getByTestId('reveal-secondary').innerText() : '-'}" quick="${(await page.getByTestId('reveal-quick').count()) ? await page.getByTestId('reveal-quick').innerText() : '-'}" check=${await page.getByTestId('reveal-check').count()}`);
  await page.screenshot({ path: `reports/shots/3.3a/verify/r2-brandnew-${test.info().project.name.replace(/ /g, '-')}.png` });
  // The Beginner Full Body 3 Day plan: 3 days, each about 45 min or less, the check earned.
  expect(heading).toBe('Your plan');
  expect(primary).toBe('Start Day 1');
  await expect(page.getByTestId('reveal-secondary')).toHaveText('Start a quick workout');
  await expect(page.getByTestId('reveal-check')).toHaveCount(1);
  await expect(page.getByTestId('reveal-card')).toContainText('Beginner Full Body 3 Day');
  const rows = page.getByTestId('reveal-week').getByRole('listitem');
  await expect(rows).toHaveCount(3);
  for (const t of await rows.allInnerTexts()) expect(Number(/~(\d+) min/.exec(t)![1])).toBeLessThanOrEqual(45);
});
