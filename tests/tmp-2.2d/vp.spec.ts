import { expect, test } from '../fixtures';
import { navIdle, usePlan } from '../workout-helpers';
test('vp @matrix', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(page.getByTestId('exercise-barbell-back-squat')).toBeVisible();
  await page.waitForTimeout(600); await navIdle(page);
  const r = await page.evaluate(() => [...document.querySelectorAll('main h2, [data-testid="set-todo"]')].map((e) => { const b = e.getBoundingClientRect(); return `${e.tagName}:${b.top.toFixed(1)}-${b.bottom.toFixed(1)} w${b.left.toFixed(1)}-${b.right.toFixed(1)}`; }));
  console.log(test.info().project.name, JSON.stringify(page.viewportSize()), r.join(' '));
  const ratios = await page.evaluate(() => new Promise<string>((res) => {
    const els = [...document.querySelectorAll('main h2, [data-testid="set-todo"], [data-testid="set-row"], [data-testid="check-current"], [data-testid="check"]')];
    const out: string[] = [];
    const io = new IntersectionObserver((es) => { for (const e of es) out.push((e.target as HTMLElement).dataset.testid + ':' + e.intersectionRatio.toFixed(4) + ':' + JSON.stringify(e.boundingClientRect.toJSON()) + ' inter ' + JSON.stringify(e.intersectionRect.toJSON())); io.disconnect(); res(out.join('\n')); });
    els.forEach((e) => io.observe(e));
  }));
  console.log(ratios);
});
