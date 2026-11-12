// GOLDEN 8: an app update keeps all data. A phone holds a database written by the previous schema
// version (10); the new build opens it, upgrades it to the current version and History still shows
// the workout. Built from the app's own frozen schema definitions (src/db/schema.ts).
import { expect, test, type Page } from '../fixtures';
import { DB_NAME, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_VERSION } from '../../src/db/schema';
import { dbAll } from '../workout-helpers';

test.describe.configure({ retries: 0 });

const PREVIOUS = SCHEMA_VERSION - 1;
const STORES: Record<string, string> = Object.assign({}, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10);

/** Replaces the app's database with one at the previous schema version holding `records`. */
function writePreviousDb(page: Page, args: { name: string; version: number; stores: Record<string, string>; records: Record<string, unknown[]> }) {
  return page.evaluate(
    ({ name, version, stores, records }) =>
      new Promise<void>((resolve, reject) => {
        const del = indexedDB.deleteDatabase(name);
        del.onerror = () => reject(del.error);
        del.onsuccess = () => {
          const open = indexedDB.open(name, version);
          open.onerror = () => reject(open.error);
          open.onupgradeneeded = () => {
            for (const [store, spec] of Object.entries(stores)) {
              const [key, ...indexes] = spec.split(',').map((s) => s.trim());
              const keyPath = key!.startsWith('[') ? key!.slice(1, -1).split('+') : key!.replace(/^[+&]+/, '');
              const os = open.result.createObjectStore(store, { keyPath });
              for (const ix of indexes) {
                const unique = ix.startsWith('&');
                const bare = ix.replace(/^[&*]+/, '');
                os.createIndex(bare, bare.startsWith('[') ? bare.slice(1, -1).split('+') : bare, { unique, multiEntry: ix.startsWith('*') });
              }
            }
          };
          open.onsuccess = () => {
            const names = Object.keys(records);
            const tx = open.result.transaction(names, 'readwrite');
            for (const n of names) for (const r of records[n]!) tx.objectStore(n).put(r);
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
    args,
  );
}

const idbVersion = (page: Page) =>
  page.evaluate(() => new Promise<number>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const v = req.result.version;
      req.result.close();
      resolve(v);
    };
  }));

test('golden: a database from the previous schema version opens, upgrades and keeps every workout', async ({ page }) => {
  // The app creates its gym and profile on a first open: keep those records, as an older build had them.
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gyms = await dbAll<{ id: string; isActive: boolean }>(page, 'gyms');
  const gym = gyms.find((g) => g.isActive)!;
  const start = Date.now() - 3 * 86_400_000;
  const records = {
    profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { goal: 'muscle', goals: ['muscle'], experience: '1_2y', minutes: 45 } }],
    gyms,
    sessions: [{ id: 'old-1', gymId: gym.id, startedAt: start, endedAt: start + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat'] }],
    sets: [0, 1, 2].map((order) => ({
      id: `old-1-${order}`, sessionId: 'old-1', exerciseId: 'barbell-back-squat', order, kind: 'work', uncertain: false, reps: 5,
      load: { kind: 'barbell', unit: 'lb', total: 225, barWeight: 45, perSide: [45, 45] },
    })),
  };
  // A page that runs none of the app, so nothing holds the database open while it is replaced.
  await page.goto('./manifest.webmanifest');
  await writePreviousDb(page, { name: DB_NAME, version: PREVIOUS * 10, stores: STORES, records });

  await page.goto('./#/history');
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await expect(page.getByTestId('history-row')).toContainText('3 sets');
  await page.getByTestId('history-row').tap();
  await expect(page.getByText('Barbell Back Squat').first()).toBeVisible();
  expect(await idbVersion(page)).toBe(SCHEMA_VERSION * 10);
  const sets = await dbAll<{ id: string; load: { total: number } }>(page, 'sets');
  expect(sets.map((s) => s.id).sort()).toEqual(['old-1-0', 'old-1-1', 'old-1-2']);
  expect(sets.every((s) => s.load.total === 225)).toBe(true);
  // The new store of the new version exists and works.
  expect(await dbAll(page, 'candidateReviews')).toEqual([]);
});
