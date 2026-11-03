import { expect, test, type Locator, type Page } from './fixtures';

// PLAN 2.2a: the premium muscle map on its dev route (SPEC 4.5 PREMIUM MAP, 10, 13).
const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};
const shot = (page: Page, name: string) =>
  page.getByTestId('muscle-card').screenshot({ path: `reports/shots/2.2a/${test.info().project.name.replace(/\s+/g, '-')}-${name}.png` });
const settled = async (page: Page) => {
  // The crossfade's leaving body is gone once it has faded.
  await expect(page.locator('[data-testid="muscle-map"] svg[aria-hidden="true"]:not([data-view]):not(.lucide) path')).toHaveCount(0);
};

/**
 * A point inside a drawn muscle's fill, as a click position. A thin crescent (the front triceps)
 * does not cover the middle of its own box, so a plain click there lands on the body around it
 * (gate s2: WebKit on SE and Pro Max; nothing covers the muscle).
 */
const inside = (l: Locator) =>
  l.evaluate((el) => {
    const p = el as SVGGeometryElement;
    const b = p.getBBox();
    const m = p.getScreenCTM()!;
    const r = p.getBoundingClientRect();
    for (let fy = 0.5, i = 0; i < 40; i++, fy = 0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.025) {
      for (let fx = 0.02; fx <= 0.98; fx += 0.02) {
        const pt = new DOMPoint(b.x + b.width * fx, b.y + b.height * fy);
        if (!p.isPointInFill(pt)) continue;
        const sc = pt.matrixTransform(m);
        // Well inside: the point and 2 px around it all land on the muscle (no rounding misses).
        const around = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]];
        if (around.every(([dx, dy]) => document.elementFromPoint(sc.x + dx!, sc.y + dy!) === el)) return { x: sc.x - r.left, y: sc.y - r.top };
      }
    }
    return { x: r.width / 2, y: r.height / 2 };
  });

test('muscle map: one body, incline press on the front, Front/Back and Male/Female, tap to name @matrix', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./?dev#/dev/muscles');
  const map = page.getByTestId('muscle-map');
  await expect(map).toBeVisible();
  await expect(map.locator('svg[data-view]')).toHaveCount(1);
  const front = map.locator('svg[data-view="front"]');
  await expect(front).toHaveAttribute('data-body', 'male');

  // Incline press: upper chest primary in the accent, front delts and triceps secondary at 40%.
  await expect(page.getByTestId('muscle-text')).toHaveText('Upper chest · Front delts, triceps');
  const chest = front.locator('[data-region="chest"]').first();
  await expect(chest).toHaveAttribute('data-role', 'primary');
  await expect.poll(() => chest.evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(212, 255, 58)');
  for (const r of ['front-deltoids', 'triceps']) {
    const p = front.locator(`[data-region="${r}"]`).first();
    await expect(p).toHaveAttribute('data-role', 'secondary');
    expect(await p.evaluate((el) => getComputedStyle(el).fillOpacity)).toBe('0.4');
  }
  await expect(map.getByText('Primary', { exact: true })).toBeVisible();
  await expect(map.getByText('Secondary', { exact: true })).toBeVisible();

  // Large, sharp, inside the screen, ≥44 px controls, no sideways scroll.
  const box = (await front.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(130);
  expect(box.width).toBeLessThanOrEqual(221);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  for (const b of await map.getByRole('radio').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await settled(page);
  await shot(page, 'male-front');

  // Tap a muscle: its name and role; tap again clears.
  const pick = page.getByTestId('muscle-pick');
  await front.locator('[data-region="chest"]').first().click();
  await expect(pick).toHaveText('Upper chest · primary');
  // The readout sits between the controls and the body, so it is seen without scrolling.
  const pb = (await pick.boundingBox())!;
  expect(pb.y + pb.height).toBeLessThanOrEqual((await front.boundingBox())!.y + 1);
  await expect.poll(() => chest.evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(245, 245, 247)');
  await front.locator('[data-region="quadriceps"]').first().click();
  await expect(pick).toHaveText('Quads · not used here');
  await front.locator('[data-region="quadriceps"]').first().click();
  await expect(pick).toHaveText('Tap a muscle to name it');
  const triceps = front.locator('[data-region="triceps"]').first();
  await triceps.click({ position: await inside(triceps) });
  await expect(pick).toHaveText('Triceps · secondary');
  // A tap beside the body (not a muscle) clears it.
  await front.click({ position: { x: 4, y: 4 } });
  await expect(pick).toHaveText('Tap a muscle to name it');

  // Front / Back.
  const stage = map.locator('svg[data-view]');
  await page.getByTestId('muscle-view').getByRole('radio', { name: 'Back' }).click();
  await expect(stage).toHaveAttribute('data-view', 'back');
  await expect(map.locator('svg[data-view="back"] [data-region="triceps"]').first()).toHaveAttribute('data-role', 'secondary');
  await expect(map.locator('svg[data-view="back"] [data-role="primary"]')).toHaveCount(0);
  await settled(page);
  await shot(page, 'male-back');

  // Male / Female: the choice is saved and Settings shows it.
  await page.getByTestId('muscle-body').getByRole('radio', { name: 'Female' }).click();
  await expect(stage).toHaveAttribute('data-body', 'female');
  await expect(stage).toHaveAttribute('data-view', 'back');
  await settled(page);
  await shot(page, 'female-back');
  await page.getByTestId('muscle-view').getByRole('radio', { name: 'Front' }).click();
  await expect(stage).toHaveAttribute('data-view', 'front');
  await expect(map.locator('svg[data-view="front"] [data-region="chest"]').first()).toHaveAttribute('data-role', 'primary');
  await settled(page);
  await shot(page, 'female-front');

  await page.reload();
  await expect(page.getByTestId('muscle-map').locator('svg[data-view]')).toHaveAttribute('data-body', 'female');
  await expect(page.getByTestId('muscle-body').getByRole('radio', { name: 'Female' })).toHaveAttribute('aria-checked', 'true');

  // Rear delt work opens on the back.
  await page.getByLabel('Exercise').selectOption('cat:Face_Pull');
  await expect(page.getByTestId('muscle-text')).toHaveText('Rear delts · Mid back');
  await expect(stage).toHaveAttribute('data-view', 'back');
  await expect(map.locator('svg[data-view="back"] [data-region="back-deltoids"]').first()).toHaveAttribute('data-role', 'primary');
  // Nothing lit on the front: say where it is, one tap to go there.
  await page.getByTestId('muscle-view').getByRole('radio', { name: 'Front' }).click();
  await expect(pick).toContainText('Worked on the back');
  const showBack = pick.getByRole('button', { name: 'Show back' });
  expect((await showBack.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await showBack.click();
  await expect(stage).toHaveAttribute('data-view', 'back');
  await expect(pick).toHaveText('Tap a muscle to name it');

  // A plan exercise with match none: no map, honest empty state.
  await page.getByLabel('Exercise').selectOption('plan:28-method-squat');
  await expect(page.getByTestId('muscle-map-empty')).toHaveText('Muscles coming soon');
  await expect(page.locator('svg[data-view]')).toHaveCount(0);

  await page.goto('./#/settings');
  const setting = page.getByTestId('settings-body');
  await expect(setting.getByRole('radio', { name: 'Female' })).toHaveAttribute('aria-checked', 'true');
  await setting.getByRole('radio', { name: 'Male', exact: true }).click();
  await page.goto('./?dev#/dev/muscles');
  await expect(page.getByTestId('muscle-map').locator('svg[data-view]')).toHaveAttribute('data-body', 'male');

  expect(errors).toEqual([]);
});

test('muscle map: reduced motion switches instantly, no fade, no fill transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?dev#/dev/muscles');
  const map = page.getByTestId('muscle-map');
  const svg = map.locator('svg[data-view]');
  await expect(svg).toBeVisible();
  expect(await svg.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(await map.locator('[data-region="chest"]').first().evaluate((el) => getComputedStyle(el.parentElement!).transitionDuration)).toBe('0s');
  await page.getByTestId('muscle-view').getByRole('radio', { name: 'Back' }).click();
  // No leaving body is ever drawn.
  // The drawing + the hidden filter defs (the "Pick a muscle" icon, PLAN 2.0k, is not a body).
  await expect(map.locator('svg:not(.lucide)')).toHaveCount(2);
  await expect(svg).toHaveAttribute('data-view', 'back');
});

test('muscle map: controls, readout and the whole body fit a 375 x 667 screen; settings row at 320', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('./?dev#/dev/muscles');
  const map = page.getByTestId('muscle-map');
  await page.getByTestId('muscle-view').scrollIntoViewIfNeeded();
  const top = (await page.getByTestId('muscle-view').boundingBox())!.y;
  const svg = (await map.locator('svg[data-view]').boundingBox())!;
  expect(svg.y + svg.height - top).toBeLessThanOrEqual(667);

  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./#/settings');
  const seg = page.getByTestId('settings-body');
  const label = page.getByText('Muscle map body', { exact: true });
  await expect(seg).toBeVisible();
  // Below 360 px the control sits on its own row under the label, never squeezed beside it.
  expect((await seg.boundingBox())!.y).toBeGreaterThan((await label.boundingBox())!.y + 10);
  for (const b of await seg.getByRole('radio').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTestId('settings-body').screenshot({ path: `reports/shots/2.2a/settings-320-${test.info().project.name.replace(/\s+/g, '-')}.png` }).catch(() => {});
});
