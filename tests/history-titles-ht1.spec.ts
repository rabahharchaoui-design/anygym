// PLAN HT1: a Quick workout's History row is named for what was logged ("Quick · Back + Shoulders"),
// on one line cut cleanly at every phone width, and VoiceOver reads the whole title and the date.
import { expect, test, type Page } from './fixtures';

const MIN = 60_000;
const DAY = 86_400_000;
const bar = (total: number) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: [] });

const activeGym = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open('anygym');
        req.onsuccess = () => {
          const q = req.result.transaction('gyms', 'readonly').objectStore('gyms').getAll();
          q.onsuccess = () => {
            req.result.close();
            resolve((q.result as { id: string; isActive: boolean }[]).find((g) => g.isActive)?.id ?? null);
          };
          q.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

async function seed(page: Page) {
  await page.goto('./');
  await expect.poll(() => activeGym(page)).not.toBeNull();
  const gymId = (await activeGym(page))!;
  const now = Date.now();
  const sessions: unknown[] = [];
  const sets: unknown[] = [];
  const add = (id: string, daysAgo: number, parts: [string, number][]) => {
    const start = now - daysAgo * DAY;
    sessions.push({ id, gymId, startedAt: start, endedAt: start + 40 * MIN, imported: false, exerciseIds: parts.map(([e]) => e) });
    let order = 0;
    for (const [exerciseId, n] of parts) for (let i = 0; i < n; i++) sets.push({ id: `${id}-${order}`, sessionId: id, exerciseId, order: order++, kind: 'work', uncertain: false, reps: 10, load: bar(95) });
  };
  add('ht1-three', 2, [['barbell-back-squat', 4], ['barbell-bent-over-row', 3], ['dumbbell-lateral-raise', 3]]);
  add('ht1-two', 1, [['barbell-bent-over-row', 6], ['dumbbell-lateral-raise', 3]]);
  await page.evaluate(
    (recs) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(Object.keys(recs), 'readwrite');
          for (const n of Object.keys(recs)) for (const r of recs[n]!) tx.objectStore(n).put(r);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { sessions, sets } as Record<string, unknown[]>,
  );
}

test('HT1: Quick rows are named for what was logged, on one clean line, read in full @matrix', async ({ page }) => {
  await seed(page);
  await page.goto('./#/history');
  const rows = page.getByTestId('history-row');
  await expect(rows.first()).toContainText('Quick · Back + Shoulders');
  await expect(rows.nth(1)).toContainText('Quick · Legs + Back + Shoulders');
  for (const i of [0, 1]) {
    const title = rows.nth(i).locator('span').first().locator('span').first();
    // One line: the title box is one line tall and never wider than its row.
    const box = await title.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const row = el.closest('a')!.getBoundingClientRect();
      return { h: r.height, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.1, right: r.right, rowRight: row.right, white: cs.whiteSpace, overflow: cs.textOverflow };
    });
    expect(box.h).toBeLessThanOrEqual(box.line * 1.5);
    expect(box.right).toBeLessThanOrEqual(box.rowRight + 0.5);
    expect([box.white, box.overflow]).toEqual(['nowrap', 'ellipsis']);
  }
  // VoiceOver: the row's name is the whole title and the date, whatever the screen cuts.
  const date = await page.evaluate((d) => new Date(Date.now() - d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), DAY);
  const name = await rows.first().evaluate((el) => el.textContent ?? '');
  expect(name).toContain('Quick · Back + Shoulders');
  expect(name).toContain(date);
  await expect(page.getByRole('link', { name: /Quick · Legs \+ Back \+ Shoulders/ })).toHaveCount(1);
  // The workout's own page says the same.
  await rows.first().tap();
  await expect(page.getByRole('heading', { name: 'Quick · Back + Shoulders' })).toBeVisible();
});
