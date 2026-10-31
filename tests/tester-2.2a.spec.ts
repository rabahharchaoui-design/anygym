import { expect, test } from './fixtures';
import { resolveMuscles } from '../src/lib/muscles';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const overrides = JSON.parse(readFileSync('data/muscle-overrides.json', 'utf8'));

const cat = (catalog as any).exercises ?? catalog;
const IDS = ['Barbell_Incline_Bench_Press_-_Medium_Grip', 'Barbell_Bench_Press_-_Medium_Grip', 'Face_Pull', 'Barbell_Full_Squat'];

test('tester: lit regions equal muscles.ts on all four bodies @matrix', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?dev#/dev/muscles');
  const notes: string[] = [];
  for (const id of IDS) {
    const ex = (cat as any[]).find((e) => e.id === id);
    if (!ex) { notes.push('missing ' + id); continue; }
    const want = resolveMuscles(ex, overrides as any);
    await page.getByLabel('Exercise').selectOption('cat:' + id);
    if (!want) { await expect(page.getByTestId('muscle-map-empty')).toBeVisible(); notes.push(id + ' empty'); continue; }
    for (const body of ['Male', 'Female']) {
      await page.getByTestId('muscle-body').getByRole('radio', { name: body, exact: true }).click();
      for (const view of ['Front', 'Back']) {
        await page.getByTestId('muscle-view').getByRole('radio', { name: view, exact: true }).click();
        const svg = page.locator(`svg[data-view="${view.toLowerCase()}"][data-body="${body.toLowerCase()}"]`);
        await expect(svg).toHaveCount(1);
        const lit = await svg.evaluate((el) => {
          const o: Record<string, string> = {};
          el.querySelectorAll('[data-role]').forEach((p) => { const r = p.getAttribute('data-region')!; const role = p.getAttribute('data-role')!; if (role !== 'none') o[r] = role; });
          return o;
        });
        const roles = await svg.evaluate((el) => [...new Set([...el.querySelectorAll('[data-role]')].map((p) => p.getAttribute('data-role')))]);
        notes.push(`${id} ${body} ${view} lit=${JSON.stringify(lit)} roles=${roles}`);
        for (const [r, role] of Object.entries(lit)) {
          if (role === 'primary' || role === 'secondary') expect((want.shading as any)[r], `${id} ${body} ${view} ${r}`).toBe(role);
        }
        // front/back constraints
        if (view === 'Front') expect(lit['back-deltoids']).toBeUndefined();
        if (view === 'Back') expect(lit['front-deltoids']).toBeUndefined();
        await page.waitForTimeout(350);
// (screenshots removed by orchestrator to keep the repo lean)         if (id.startsWith('Barbell_Bench') || id === 'Face_Pull') await page.getByTestId('muscle-card').screenshot({ path: `reports/shots/2.2a/tester-${id.slice(0,12)}-${body}-${view}-${test.info().project.name.replace(/\s+/g,'-')}.png` });
      }
    }
  }
  console.log(notes.join('\n'));
  expect(errors).toEqual([]);
});
