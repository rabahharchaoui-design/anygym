import { expect, test, type Page } from './fixtures';
import { watchErrors } from './workout-helpers';
import { seedLifter } from './zz-gate-critic-seed';
const D = '/tmp/gc';
export async function scrollMain(page: Page, y: number) {
  await page.evaluate((dy) => {
    const els = [document.scrollingElement!, ...Array.from(document.querySelectorAll<HTMLElement>('*'))].filter((e) => e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) || e === document.scrollingElement);
    const best = els.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0]!;
    best.scrollBy(0, dy);
  }, y);
}
test.use({ video: 'on' });
test('lifter settings', async ({ page }, info) => {
  test.setTimeout(240000);
  const errors = watchErrors(page); page.setDefaultTimeout(6000);
  const p = info.project.name.replace(/ /g, '-');
  let n = 0;
  const shot = async (name: string) => { await page.waitForTimeout(600); await page.screenshot({ path: `${D}/${p}/st-${String(n++).padStart(2,'0')}-${name}.png` }); };
  const dump = async (label: string) => console.log(label, '|', (await page.locator('body').innerText()).replace(/\n+/g, ' / ').slice(0, 1500));
  const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { console.log('FAIL', name, String(e).slice(0, 300)); } };
  const back = async () => { await page.goBack(); await page.waitForTimeout(700); };
  await seedLifter(page, { missLast: ['barbell-back-squat'], thisWeekDays: 1 });
  await page.waitForTimeout(800);
  await shot('today'); await dump('TODAY');
  await step('settings', async () => { await page.getByRole('link', { name: 'Settings' }).or(page.getByRole('button', { name: 'Settings' })).first().tap(); await page.waitForTimeout(900); await shot('settings'); await dump('SETTINGS'); for (let i = 0; i < 4; i++) { await scrollMain(page, 700); await shot('settings-' + i); } });
  await step('autolevel', async () => { const c = page.getByTestId('settings-coach'); await c.scrollIntoViewIfNeeded(); await c.getByText('Auto level up', { exact: true }).tap(); await page.waitForTimeout(800); await shot('auto-sheet'); await dump('AUTO'); await page.getByRole('dialog').getByRole('button', { name: 'Not now' }).tap(); await page.waitForTimeout(600); });
  await step('gyms', async () => { await page.getByTestId('settings-gyms').scrollIntoViewIfNeeded(); await page.getByTestId('settings-gyms').tap(); await page.waitForTimeout(900); await shot('gyms'); await dump('GYMS'); await page.getByTestId('gyms-list').locator('button, a, [role=button]').first().tap(); await page.waitForTimeout(900); await shot('gym-detail'); await dump('GYMDETAIL'); await scrollMain(page, 800); await shot('gym-detail-2'); await scrollMain(page, 1600); await shot('gym-detail-3'); await back(); await back(); });
  await step('profile', async () => { await shot('settings-back'); const r = page.getByTestId('redo-intake'); await r.scrollIntoViewIfNeeded(); await shot('profile-section'); await r.tap(); await page.waitForTimeout(900); await shot('redo-intake'); await dump('REDO'); await back(); });
  console.log('ERR', JSON.stringify(errors));
});
