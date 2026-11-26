import { expect, test, type Locator, type Page } from './fixtures';
import { firstFix, holdFor, live, move, openRun, wake } from './helpers/run';
import { quickWith } from './workout-helpers';

// PLAN R1 (5, 6), at the 320 pt floor: the set table's column heads are never cut off (no
// ellipsis), and a data field label never breaks inside a word ("DISTANCE"), with the largest text
// size simulated the way the tester did it (every font 130%).

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones and the 320 floor');
});

/** Each word of each element sits on one line (a word broken in two has two line boxes). */
const brokenWords = (els: Locator) =>
  els.evaluateAll((nodes) => {
    const out: string[] = [];
    for (const el of nodes) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? '';
        for (const m of text.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index!);
          r.setEnd(n, m.index! + m[0].length);
          const tops = new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  });

/** Text cut off by its box (an ellipsis or a clip). */
const cutOff = (els: Locator) => els.evaluateAll((nodes) => nodes.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent));

async function largestText(page: Page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size) el.style.fontSize = `${size * 1.3}px`;
    }
  });
}

test('R1 (5) the set table heads fit at 320 pt: nothing cut off, no word broken @matrix', async ({ page }) => {
  await quickWith(page, [['dumbbell bench', 'Dumbbell Bench Press']]);
  const heads = page.locator('[data-head] > span');
  await expect(heads.first()).toBeVisible();
  expect(await cutOff(heads)).toEqual([]);
  expect(await brokenWords(heads)).toEqual([]);
});

test('R1 (6) a run summary data field label never breaks inside a word at the largest text size @matrix', async ({ page, context }) => {
  await openRun(page, context);
  await page.getByTestId('run-start').tap();
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  const r = { page, context, north: 0 };
  await move(r, 10);
  await wake(page);
  // The run summary's three-up row (distance, time, pace) is the narrowest place a label sits.
  await holdFor(page, page.getByTestId('live-end'), 1250);
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await largestText(page);
  const labels = page.getByTestId('run-summary').locator('[data-field] > span:has(+ span [data-value])');
  await expect(labels.first()).toBeVisible();
  expect(await labels.allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/distance/i)]));
  expect(await brokenWords(labels)).toEqual([]);
});
