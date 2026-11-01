import { expect, test } from '../fixtures';
import { pickExercises, exerciseView, checkCurrent, loggedRows } from '../workout-helpers';
test('perf dbg @matrix', async ({ page, browserName }) => {
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const ws = page.getByRole('dialog', { name: 'Pick the weight' });
  await view.getByTestId('weight-cell').first().tap();
  await ws.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await ws.getByRole('button', { name: 'Done' }).tap();
  await expect(checkCurrent(view)).toBeEnabled();
  await page.waitForTimeout(800);
  for (let k = 0; k < 2; k++) {
    await page.evaluate(() => {
      const w = window as any; w.__perf = { marks: [] as string[] };
      const t0 = { v: 0 };
      document.addEventListener('pointerdown', () => { t0.v = performance.now(); w.__perf.marks.push('down 0'); }, { capture: true, once: true });
      document.addEventListener('click', () => w.__perf.marks.push('click ' + Math.round(performance.now() - t0.v)), { capture: true, once: true });
      const rows = () => document.querySelectorAll('[data-testid="set-row"]').length;
      const n0 = rows();
      let first = true;
      const mo = new MutationObserver(() => {
        const dt = performance.now() - t0.v;
        if (first && t0.v) { first = false; w.__perf.marks.push('firstMut ' + Math.round(dt)); }
        if (rows() > n0) { mo.disconnect(); w.__perf.marks.push('logged ' + Math.round(dt)); requestAnimationFrame(() => requestAnimationFrame(() => w.__perf.marks.push('painted ' + Math.round(performance.now() - t0.v)))); }
      });
      mo.observe(document.querySelector('main')!, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(k + 1);
    await page.waitForTimeout(300);
    console.log(test.info().project.name, await page.evaluate(() => (window as any).__perf.marks.join(' | ')));
    await page.getByRole('button', { name: 'Skip' }).tap().catch(() => {});
    await page.waitForTimeout(500);
  }
});
