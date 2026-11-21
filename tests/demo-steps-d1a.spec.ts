import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';

// PLAN D1 (step D1a): the demo viewer steps through 2 to 4 frames. No real sequence ships yet, so
// this spec uses a TEST fixture that lives only here: a 4 frame "sequence" made of the start and end
// photos of two approved exercises (stand-ins, so every frame is visibly different), shown by the
// dev preview #/dev/demo-steps (VITE_DEV_PREVIEW=1 builds only, like #/dev/monolith). It proves the
// order, the loop, the "1 of 4" position, no layout shift and reduced motion, in the sheet's demo
// and the full screen viewer, on the iPhone 15, the iPhone SE and the 320 floor.
const PROFILES = ['iPhone 15', 'iPhone SE', '320 floor'];
const DIR = 'reports/monolith/d1a';
const FRAMES = ['ex/Ab_Roller/0', 'ex/Ab_Roller/1', 'ex/Arnold_Dumbbell_Press/0', 'ex/Arnold_Dumbbell_Press/1'];
const NAME = 'Test sequence';

test.beforeEach(() => {
  test.skip(!PROFILES.includes(test.info().project.name), 'D1a: iPhone 15, iPhone SE and the 320 floor');
});

const tag = () => test.info().project.name.replace(/ /g, '-');
async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${DIR}/${name}-${tag()}.jpg`, type: 'jpeg', quality: 70, animations: 'disabled' });
}

async function open(page: Page): Promise<Locator> {
  await page.goto(`./#/dev/demo-steps?dev&f=${FRAMES.join(',')}`);
  const demo = page.getByTestId('form-demo');
  await expect(demo).toHaveAttribute('data-frames', '4');
  return demo;
}

/** The frame on top, by its alt text and the file it shows. */
async function shown(scope: Locator) {
  const img = scope.locator('img[alt$=" of 4"]');
  await expect(img).toHaveCount(1);
  return { alt: await img.getAttribute('alt'), src: await img.evaluate((i: HTMLImageElement) => i.currentSrc || i.src) };
}

const expectFrame = async (scope: Locator, k: number) => {
  await expect(scope.getByTestId('demo-position')).toHaveText(`${k + 1} of 4`);
  const s = await shown(scope);
  expect(s.alt).toBe(`${NAME}, frame ${k + 1} of 4`);
  expect(s.src).toContain(`${FRAMES[k]}.`);
};

test('@matrix a 4 frame demo plays in order and loops, every frame preloaded', async ({ page }) => {
  const demo = await open(page);
  // All four frames are in the page and loaded before any step: a step never flashes.
  const imgs = demo.getByTestId('demo-stage').locator('img');
  await expect(imgs).toHaveCount(4);
  await expect.poll(() => imgs.evaluateAll((list) => list.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  // On its own: 1, 2, 3, 4, then back to 1.
  const seen: string[] = [];
  const pos = demo.getByTestId('demo-position');
  const until = Date.now() + 8000;
  while (Date.now() < until && seen.length < 6) {
    const t = (await pos.textContent())!;
    if (seen.at(-1) !== t) seen.push(t);
    await page.waitForTimeout(100);
  }
  expect(seen.slice(0, 5)).toEqual(['1 of 4', '2 of 4', '3 of 4', '4 of 4', '1 of 4']);
  await shot(page, 'sheet-demo');
});

test('@matrix Next and Previous step in order and loop; the box never moves', async ({ page }) => {
  const demo = await open(page);
  const stage = demo.getByTestId('demo-stage');
  const bar = demo.getByTestId('demo-steps');
  await demo.getByRole('button', { name: 'Pause demo' }).tap();
  // Back to the start: stepping is a loop, Previous from 1 is 4.
  const now = Number((await demo.getByTestId('demo-position').textContent())!.split(' ')[0]) - 1;
  for (let i = 0; i < (4 - now) % 4; i++) await demo.getByRole('button', { name: 'Next frame' }).tap();
  await expectFrame(demo, 0);
  const box = await stage.boundingBox();
  const barBox = await bar.boundingBox();
  for (const k of [1, 2, 3, 0]) {
    await demo.getByRole('button', { name: 'Next frame' }).tap();
    await expectFrame(demo, k);
    expect(await stage.boundingBox()).toEqual(box);
    expect(await bar.boundingBox()).toEqual(barBox);
  }
  await demo.getByRole('button', { name: 'Previous frame' }).tap();
  await expectFrame(demo, 3);
  // Paused stays put; the position is announced when a person steps.
  await page.waitForTimeout(1800);
  await expectFrame(demo, 3);
  await expect(demo.getByTestId('demo-position')).toHaveAttribute('aria-live', 'polite');
  // 44 pt targets.
  for (const b of await bar.getByRole('button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('@matrix the full screen viewer steps the same way', async ({ page }) => {
  const demo = await open(page);
  await demo.getByRole('button', { name: `Show ${NAME} full screen` }).tap();
  const viewer = page.getByTestId('demo-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId('demo-hero')).toHaveAttribute('data-frames', '4');
  await viewer.getByRole('button', { name: 'Pause demo' }).tap();
  const hero = viewer.getByTestId('demo-hero');
  // The viewer springs in: measure once it is at rest.
  let box = await hero.boundingBox();
  await expect.poll(async () => {
    const prev = box;
    box = await hero.boundingBox();
    return JSON.stringify(prev) === JSON.stringify(box);
  }).toBe(true);
  const start = Number((await viewer.getByTestId('demo-position').textContent())!.split(' ')[0]) - 1;
  for (let i = 1; i <= 4; i++) {
    await viewer.getByRole('button', { name: 'Next frame' }).tap();
    await expectFrame(viewer, (start + i) % 4);
    expect(await hero.boundingBox()).toEqual(box);
  }
  // Stepping does not close the viewer (a tap on the photo still does).
  await expect(viewer).toBeVisible();
  await shot(page, 'viewer');
  await viewer.getByRole('button', { name: 'Close' }).tap();
  await expect(viewer).toBeHidden();
});

test('@matrix reduced motion: frames change only on a tap, never on their own', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const demo = await open(page);
  await expectFrame(demo, 0);
  await page.waitForTimeout(3500);
  await expectFrame(demo, 0);
  await expect(demo.getByRole('button', { name: 'Pause demo' })).toHaveCount(0);
  await demo.getByRole('button', { name: 'Next frame' }).tap();
  await expectFrame(demo, 1);
  await page.waitForTimeout(2000);
  await expectFrame(demo, 1);
  // The tile's CSS loop is stopped too: only the start photo shows.
  const tileFrames = page.getByTestId('dev-tile').locator('picture');
  await expect(tileFrames).toHaveCount(4);
  const opacities = await tileFrames.evaluateAll((list) => list.map((p) => getComputedStyle(p).opacity));
  expect(opacities).toEqual(['1', '0', '0', '0']);
  await shot(page, 'reduced-motion');
});

test('@matrix the list tile loops all four frames in CSS', async ({ page }) => {
  await open(page);
  const frames = page.getByTestId('dev-tile').locator('picture');
  await expect(frames).toHaveCount(4);
  const anim = await frames.evaluateAll((list) => list.map((p) => [getComputedStyle(p).animationName, getComputedStyle(p).animationDelay]));
  expect(anim[0]![0]).toBe('none');
  expect(anim.slice(1).map((a) => a[1])).toEqual(['1.5s', '3s', '4.5s']);
  expect(anim.slice(1).every((a) => a[0] !== 'none')).toBe(true);
});
