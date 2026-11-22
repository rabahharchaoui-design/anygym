import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { pastIntake } from './helpers/quick';

// PLAN M9: the v2 goal icons (Monolith). Reached the way a person does from Settings: Today, Settings,
// "Answer the questions again", which opens "What's your main goal?". All 8 pictures load (no 404),
// each sits on its own goal's tile, and all 8 are drawn the same size, centred in their slots.
// Screenshots for the report: reports/monolith/m9/goal-<phone>.jpg (iPhone 15 and iPhone SE).
const DIR = process.env.M9_SHOTS ?? 'reports/monolith/m9';
const GOALS: Array<[string, string]> = [
  ['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['fat_loss', 'Lose fat'], ['tone', 'Tone up'],
  ['health', 'Stay healthy'], ['athletic', 'Athletic performance'], ['race', 'Train for a race'], ['comeback', 'Get back into it'],
];

test('from Settings, the goal step shows the 8 v2 goal icons, all loaded, even and on their own goals @matrix', async ({ page }) => {
  const bad: string[] = [];
  const loaded = new Set<string>();
  page.on('response', (res) => {
    const m = /\/icons3d\/(goal-[a-z_]+)\.(avif|webp)/.exec(res.url());
    if (!m) return;
    if (res.status() >= 400) bad.push(`${res.status()} ${res.url()}`);
    else loaded.add(m[1]!);
  });
  await pastIntake(page);
  await page.getByTestId('tab-you').tap();
  await page.getByRole('button', { name: /Answer the questions again/ }).tap();
  await expect(page.getByRole('heading', { name: "What's your main goal?" })).toBeVisible();
  await page.waitForFunction(() => !document.documentElement.dataset.nav);

  const slots = page.locator('[data-icon3d^="goal-"]');
  await expect(slots).toHaveCount(8);
  const sizes: number[][] = [];
  for (const [i, [id, label]] of GOALS.entries()) {
    const tile = page.getByTestId(`q-goal-${id}`);
    const slot = tile.locator('[data-icon3d]');
    await slot.scrollIntoViewIfNeeded();
    // Tiles in the goals' order, each with its own goal's picture and words.
    await expect(slots.nth(i)).toHaveAttribute('data-icon3d', `goal-${id}`);
    await expect(slot).toHaveAttribute('data-icon3d', `goal-${id}`);
    await expect(slot).toHaveAttribute('data-state', 'shown');
    await expect(tile).toContainText(label);
    const read = await slot.locator('img').evaluate((el: HTMLImageElement) => {
      const r = el.getBoundingClientRect();
      const s = el.parentElement!.parentElement!.getBoundingClientRect();
      return { natural: [el.naturalWidth, el.naturalHeight], box: [r.width, r.height], dx: r.left + r.width / 2 - (s.left + s.width / 2), dy: r.top + r.height / 2 - (s.top + s.height / 2) };
    });
    expect(read.natural, `${id} decoded at 144`).toEqual([144, 144]);
    expect(Math.abs(read.dx), `${id} centred`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(read.dy), `${id} centred`).toBeLessThanOrEqual(0.5);
    sizes.push(read.box);
  }
  // Same slot, same size for all 8 (the files carry the even mark size; the unit test checks that).
  for (const box of sizes) expect(box).toEqual(sizes[0]);
  expect(bad).toEqual([]);
  expect([...loaded].sort()).toEqual(GOALS.map(([id]) => `goal-${id}`).sort());

  const phone = test.info().project.name;
  if (phone === 'iPhone 15' || phone === 'iPhone SE') {
    mkdirSync(DIR, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${DIR}/goal-${phone.replace(/ /g, '-')}.jpg`, type: 'jpeg', quality: 60, scale: 'css', animations: 'disabled' });
  }
});
