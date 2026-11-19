import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';

// PLAN M1 (SPEC 10, 23): the shared Monolith pieces on the dev preview (#/dev/monolith?dev) and in
// the app, on the iPhone 15 (the iPhone 15 Pro's size) and the iPhone SE. Screenshots land in
// reports/monolith/m1/ (small JPEGs) so the report shows them; the checks are the real test.
const PROFILES = ['iPhone 15', 'iPhone SE'];
const DIR = 'reports/monolith/m1';

test.beforeEach(() => {
  test.skip(!PROFILES.includes(test.info().project.name), 'M1 shots: iPhone 15 and iPhone SE');
});

const tag = () => test.info().project.name.replace(/ /g, '-');

async function shot(target: Page | Locator, name: string) {
  mkdirSync(DIR, { recursive: true });
  await (target as Page).waitForTimeout?.(300);
  await target.screenshot({ path: `${DIR}/${name}-${tag()}.jpg`, type: 'jpeg', quality: 80, animations: 'disabled' });
}

async function openPreview(page: Page) {
  await page.goto('./#/dev/monolith?dev');
  await expect(page.getByTestId('m1-buttons')).toBeVisible();
}

/** Nothing on the page is wider than the screen. */
async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
}

test('M1 button: primary, secondary, quiet, destructive, disabled; 44 pt targets; press feedback', async ({ page }) => {
  await openPreview(page);
  const section = page.getByTestId('m1-buttons');
  const buttons = section.locator('button');
  expect(await buttons.count()).toBeGreaterThanOrEqual(7);
  for (const b of await buttons.all()) {
    const box = (await b.boundingBox())!;
    expect(box.height, await b.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.width, await b.innerText()).toBeGreaterThanOrEqual(44);
  }
  const look = (b: Locator) =>
    b.evaluate((el) => {
      const s = getComputedStyle(el);
      const bar = getComputedStyle(el, '::after');
      return { radius: s.borderTopLeftRadius, bg: s.backgroundColor, shadow: s.boxShadow, color: s.color, weight: s.fontWeight, bar: bar.height, barColor: bar.backgroundColor, h: el.getBoundingClientRect().height };
    });
  const primary = await look(buttons.nth(0));
  expect(primary).toMatchObject({ radius: '0px', bg: 'rgba(0, 0, 0, 0)', shadow: 'none', color: 'rgb(255, 255, 255)', weight: '900', bar: '4px', barColor: 'rgb(159, 211, 255)' });
  expect(primary.h).toBeGreaterThanOrEqual(56);
  const disabled = await look(buttons.nth(1));
  expect(disabled).toMatchObject({ color: 'rgb(85, 88, 93)', barColor: 'rgb(46, 48, 52)' });
  await expect(section.getByRole('note')).toHaveText('Pick a day first');
  const secondary = await look(buttons.nth(2));
  expect(secondary).toMatchObject({ bar: '1px', barColor: 'rgba(255, 255, 255, 0.35)', weight: '900' });
  const destructive = await look(section.getByRole('button', { name: 'Delete set' }));
  expect(destructive.color).toBe('rgb(255, 128, 128)');
  await noSideScroll(page);
  await shot(section, 'button');

  // Pressed: ice blue text and an 8 px bar on the first frame, without moving anything around it.
  const before = (await buttons.nth(2).boundingBox())!;
  const box = (await buttons.nth(0).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await look(buttons.nth(0));
  expect(pressed).toMatchObject({ color: 'rgb(159, 211, 255)', bar: '8px' });
  expect((await buttons.nth(2).boundingBox())!.y).toBeCloseTo(before.y, 0);
  await shot(section, 'button-pressed');
  await page.mouse.up();
});

test('M1 divider: a 1 px hairline of white at 12%, full width of its rows', async ({ page }) => {
  await openPreview(page);
  const section = page.getByTestId('m1-dividers');
  const lines = section.locator('hr');
  await expect(lines).toHaveCount(3);
  for (const hr of await lines.all()) {
    const s = await hr.evaluate((el) => {
      const c = getComputedStyle(el);
      return { top: c.borderTopWidth, color: c.borderTopColor, h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width, hidden: el.getAttribute('aria-hidden') };
    });
    expect(s).toMatchObject({ top: '1px', color: 'rgba(255, 255, 255, 0.12)', h: 1, hidden: 'true' });
    expect(s.w).toBeGreaterThan(page.viewportSize()!.width - 60);
  }
  await shot(section, 'divider');
});

/** Every data field number fits its field: no clipping, no wrap, nothing past the screen edge. */
async function fieldsFit(section: Locator) {
  const bad = await section.locator('[data-field]').evaluateAll((fields) =>
    fields.flatMap((f) => {
      const n = f.querySelector<HTMLElement>('[data-value]')!;
      const fr = f.getBoundingClientRect();
      const nr = n.getBoundingClientRect();
      const lines = Math.round(nr.height / parseFloat(getComputedStyle(n).lineHeight));
      const out = nr.right > fr.right + 0.5 || nr.right > innerWidth || n.scrollWidth > n.clientWidth + 1 || lines > 1;
      return out ? [`${n.textContent} ${nr.right.toFixed(1)} > ${fr.right.toFixed(1)} (lines ${lines})`] : [];
    }),
  );
  expect(bad).toEqual([]);
}

/** The phone's largest text size, as the 130% specs do it (tests/text-130-1.7e.spec.ts): every size x1.3. */
async function largestText(page: Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(150);
}

for (const width of [0, 320]) {
  test(`M1 data field${width ? ' at 320 px' : ''}: label, giant tabular number, unit; worst cases never clip; honest blank`, async ({ page }) => {
    if (width) await page.setViewportSize({ width, height: 568 });
    await openPreview(page);
    const fields = page.getByTestId('m1-fields');
    const worst = page.getByTestId('m1-fields-worst');
    await fields.scrollIntoViewIfNeeded();
    const style = await fields.locator('[data-field][data-size="hero"]').first().evaluate((f) => {
      const n = f.querySelector('[data-value]')!;
      const l = f.firstElementChild!;
      const ns = getComputedStyle(n);
      const ls = getComputedStyle(l);
      return { tnum: ns.fontVariantNumeric, weight: ns.fontWeight, size: parseFloat(ns.fontSize), labelColor: ls.color, labelCase: ls.textTransform, labelSize: ls.fontSize };
    });
    expect(style).toMatchObject({ tnum: 'tabular-nums', weight: '900', labelColor: 'rgb(255, 255, 255)', labelCase: 'uppercase', labelSize: '12px' });
    // The hero is the biggest number on the screen.
    const sizes = await fields.locator('[data-value]').evaluateAll((ns) => ns.map((n) => parseFloat(getComputedStyle(n).fontSize)));
    expect(Math.max(...sizes)).toBe(style.size);
    expect(style.size).toBeGreaterThan(width ? 95 : 120);
    await fieldsFit(fields);
    await fieldsFit(worst);
    // Not trusted: two dashes, grey, read out as not known yet.
    const blank = worst.locator('[data-field][data-blank]').first();
    await expect(blank.locator('[data-value]')).toHaveText('--');
    await expect(blank).toContainText('not known yet');
    await noSideScroll(page);
    const suffix = width ? '-320' : '';
    await shot(fields, `data-field${suffix}`);
    await shot(worst, `data-field-worst${suffix}`);
    await largestText(page);
    await fieldsFit(fields);
    await fieldsFit(worst);
    await noSideScroll(page);
    await shot(worst, `data-field-worst-largest-text${suffix}`);
  });
}
