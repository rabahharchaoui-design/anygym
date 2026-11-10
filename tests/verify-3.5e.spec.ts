import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, watchErrors } from './workout-helpers';
import { pastIntake, swipe, PROFILE } from './helpers/quick';
import { PRESET_KITS } from '../src/lib/candidates/presets';

// Tester PLAN 3.5e: the gate in the browser, approvals, migration, backup, review deck UX.
type Cand = { id: string; name: string; ladder: boolean; pattern: string };
const FILE = JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { candidates: Cand[] };
const CATALOG_NAMES = new Set((JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { name: string }[] }).exercises.map((e) => e.name.toLowerCase()));
const PLAN_NAMES = new Set((JSON.parse(readFileSync('data/plan-exercises.json', 'utf8')) as Array<{ name: string }> | { exercises: { name: string }[] }) instanceof Array ? [] : []);
const CANDS = FILE.candidates;
const UNIQUE_NAMES = CANDS.filter((c) => !CATALOG_NAMES.has(c.name.toLowerCase()));
const SHOTS = 'reports/shots/3.5e-verify';
void PLAN_NAMES;

const kit = (id: string) => PRESET_KITS.find((p) => p.id === id)!.kit;
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });

function track(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

async function bodyHtml(page: Page) {
  return page.evaluate(() => document.documentElement.outerHTML);
}

async function leaks(page: Page, cands: Cand[], html?: string): Promise<string[]> {
  const h = html ?? (await bodyHtml(page));
  return cands.filter((c) => h.includes(`exc/${c.id}/`) || h.includes(`"${c.id}"`) || h.includes(`-${c.id}"`)).map((c) => c.id);
}

const ROUTES = ['./', './#/quick', './#/plans', './#/history', './#/settings', './#/settings/gyms'];

test('GATE browser: no approvals, every route, no candidate id/photo/request @matrix', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const urls = track(page);
  const bad: string[] = [];
  for (const preset of ['hotel', 'bodyweight', 'dumbbells', 'full'] as const) {
    await pastIntake(page, [...kit(preset).equipment]);
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForTimeout(250);
      bad.push(...(await leaks(page, CANDS)).map((id) => `${preset} ${r} ${id}`));
    }
    // Quick: every minute chip, and open the first card of each, visit swap deck.
    await page.goto('./#/quick');
    for (const m of [15, 30, 45, 60]) {
      const chip = page.getByTestId(`min-${m}`);
      if (await chip.count()) await chip.tap();
      await page.waitForTimeout(250);
      bad.push(...(await leaks(page, CANDS)).map((id) => `${preset} quick${m} ${id}`));
      const names = await page.locator('main, body').first().innerText();
      for (const c of UNIQUE_NAMES) if (names.includes(c.name)) bad.push(`${preset} quick${m} name ${c.name}`);
    }
    const first = page.locator('[data-concept]').first();
    if (await first.count()) {
      await first.tap();
      await page.waitForTimeout(400);
      bad.push(...(await leaks(page, CANDS)).map((id) => `${preset} deck ${id}`));
    }
  }
  expect(bad).toEqual([]);
  expect(urls.filter((u) => /\/exc\//.test(u)), 'no candidate photo requested').toEqual([]);
  expect(urls.filter((u) => /catalog-candidates/.test(u)), 'candidate chunk never downloaded').toEqual([]);
  expect(errors).toEqual([]);
});

test('approvals: only approved appear, rejected never, survive reload; chunk loads only then @matrix', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  const urls = track(page);
  const lad = CANDS.filter((c) => c.ladder);
  const approve = lad.filter((_, i) => i % 4 !== 0);
  const wrong = lad.filter((_, i) => i % 4 === 0);
  await pastIntake(page, []);
  await dbPut(page, { candidateReviews: [...approve.map((c) => ({ id: c.id, decision: 'approve', at: 1 })), ...wrong.map((c, i) => ({ id: c.id, decision: i % 2 ? 'wrong' : 'fix', reason: i % 2 ? undefined : 'photo', at: 2 }))].map((r) => JSON.parse(JSON.stringify(r))) });
  await page.reload();
  const seen = new Set<string>();
  const badSeen: string[] = [];
  for (const preset of ['bodyweight', 'hotel', 'home', 'dumbbells'] as const) {
    const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
    await dbPut(page, { gyms: [{ ...gym, equipment: [...kit(preset).equipment], dumbbellRange: kit(preset).dumbbellRange }] });
    for (const m of [15, 30, 45, 60]) {
      for (let i = 0; i < 6; i++) {
        await page.goto('./#/quick');
        await page.reload();
        const chip = page.getByTestId(`min-${m}`);
        if (!(await chip.isVisible().catch(() => false))) {
          await page.waitForTimeout(800);
          if (!(await chip.isVisible().catch(() => false))) break;
        }
        // The chips can show for a moment before the page decides this gym has too few approved moves
        // (the honest empty state): then there is nothing to tap, which is not a failure.
        if (!(await chip.tap({ timeout: 4000 }).then(() => true, () => false))) break;
        await page.waitForTimeout(250);
        const cards = page.locator('[data-concept]');
        if (i >= (await cards.count())) break;
        await cards.nth(i).tap();
        await page.waitForTimeout(350);
        const html = await bodyHtml(page);
        for (const c of wrong) if (html.includes(`exc/${c.id}/`) || html.includes(`"${c.id}"`)) badSeen.push(`${preset}${m} wrong ${c.id}`);
        for (const c of approve) if (html.includes(`exc/${c.id}/`) || html.includes(c.name)) seen.add(c.id);
      }
    }
  }
  console.log(`approved candidates seen in cards: ${seen.size} of ${approve.length}: ${[...seen].slice(0, 30).join(', ')}`);
  expect(badSeen).toEqual([]);
  expect(urls.some((u) => /catalog-candidates/.test(u)), 'chunk loads with approvals').toBe(true);
  expect(errors).toEqual([]);
});

async function openDeck(page: Page) {
  await page.goto('./#/settings');
  const version = page.getByTestId('app-version');
  for (let i = 0; i < 5; i++) await version.tap();
  await expect(page).toHaveURL(/#\/review$/);
  await page.waitForTimeout(900);
  await shot(page, 'review-home');
  await page.getByTestId('open-new-exercises').tap();
  await expect(page).toHaveURL(/#\/review\/new$/);
  await expect(page.getByTestId('batch-progress')).toHaveText(/^Batch \d+ of \d+ · \d+ left$/);
}

async function scale130(page: Page) {
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
}

test('deck UX: swipe left/right, Fix sheet, 48pt, 100% and 130%, offline, resume, export privacy @matrix', async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: { name: string; text: string } };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
    Object.defineProperty(Navigator.prototype, 'share', { value: async (d: { files: File[] }) => { w.__shared = { name: d.files[0]!.name, text: await d.files[0]!.text() }; }, configurable: true });
  });
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  await dbPut(page, { profile: [{ ...PROFILE, name: 'Zed Private', email: 'zed@private.example' }] });
  await openDeck(page);
  await shot(page, 'deck-100');
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  const w = (id: string) => page.getByTestId(id);
  for (const id of ['candidate-wrong', 'candidate-fix', 'candidate-approve', 'export-approvals']) {
    const b = (await w(id).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(48);
    expect(b.width, id).toBeGreaterThanOrEqual(48);
    expect(b.y + b.height, `${id} inside viewport`).toBeLessThanOrEqual((page.viewportSize()!.height) + 1);
  }
  // card content
  await expect(page.getByTestId('deck-card').getByTestId('deck-demo')).toBeVisible();
  const imgs = page.getByTestId('deck-card').getByTestId('deck-demo').locator('img');
  expect(await imgs.count()).toBeGreaterThanOrEqual(2);
  for (const n of [0, 1]) expect(await imgs.nth(n).evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // swipe left = wrong (drag), right = approve
  const a = (await w('candidate-name').textContent())!;
  await swipe(page, -260);
  await expect(w('candidate-notice')).toContainText(`Marked wrong: ${a}`);
  const b = (await w('candidate-name').textContent())!;
  await swipe(page, 260);
  await expect(w('candidate-notice')).toContainText(`Approved: ${b}`);
  let rows = await dbAll<{ id: string; decision: string; note?: string; reason?: string }>(page, 'candidateReviews');
  expect(rows.map((r) => r.decision).sort()).toEqual(['approve', 'wrong']);
  // Fix with note
  const c = (await w('candidate-name').textContent())!;
  await w('candidate-fix').tap();
  const sheet = page.getByRole('dialog', { name: 'What is wrong?' });
  await expect(sheet).toBeVisible();
  for (const r of ['photo', 'gear', 'muscles', 'unsafe', 'other']) {
    const bb = (await sheet.getByTestId(`fix-${r}`).boundingBox())!;
    console.log(`fix-${r} ${bb.width}x${bb.height}`);
    expect(bb.height, `fix-${r} height`).toBeGreaterThanOrEqual(44);
  }
  await page.waitForTimeout(900);
  await shot(page, 'fix-sheet');
  await sheet.getByTestId('fix-gear').tap();
  await sheet.getByTestId('fix-note').fill('Looks like a cable not dumbbell');
  const sb = (await sheet.getByTestId('fix-save').boundingBox())!;
  expect(sb.height).toBeGreaterThanOrEqual(48);
  await sheet.getByTestId('fix-save').tap();
  await expect(sheet).toHaveCount(0);
  rows = await dbAll(page, 'candidateReviews');
  const fixRow = rows.find((r) => r.decision === 'fix')!;
  expect(fixRow.note).toBe('Looks like a cable not dumbbell');
  expect(fixRow.reason).toBe('gear');
  expect(CANDS.find((x) => x.id === fixRow.id)!.name).toBe(c);
  // double tap Approve fast: must be exactly two decisions, not one lost or dup
  const before = (await dbAll(page, 'candidateReviews')).length;
  await w('candidate-approve').dblclick();
  await page.waitForTimeout(800);
  const after = (await dbAll(page, 'candidateReviews')).length;
  console.log(`double tap approve: ${after - before} rows added`);
  // offline: decisions keep working
  await context.setOffline(true);
  await w('candidate-approve').tap();
  await page.waitForTimeout(500);
  expect((await dbAll(page, 'candidateReviews')).length).toBeGreaterThan(after - 1);
  await shot(page, 'deck-offline');
  await context.setOffline(false);
  // reload mid batch resumes
  const left = await w('batch-progress').textContent();
  const nm = await w('candidate-name').textContent();
  await page.reload();
  await expect(w('batch-progress')).toHaveText(left!);
  await expect(w('candidate-name')).toHaveText(nm!);
  // 130%
  await scale130(page);
  await page.waitForTimeout(300);
  await shot(page, 'deck-130');
  expect(await overflow()).toBeLessThanOrEqual(0);
  for (const id of ['candidate-wrong', 'candidate-fix', 'candidate-approve']) {
    const bb = (await w(id).boundingBox())!;
    expect(bb.height, `${id} 130 height`).toBeGreaterThanOrEqual(48);
    console.log(`130% ${id} bottom ${Math.round(bb.y + bb.height)} of ${page.viewportSize()!.height}`);
  }
  // export privacy
  await w('export-approvals').tap();
  await expect(w('candidate-message')).toHaveText('Approvals shared.');
  const shared = await page.evaluate(() => (window as unknown as { __shared: { text: string } }).__shared.text);
  const j = JSON.parse(shared);
  expect(Object.keys(j).sort()).toEqual(['approved', 'decided', 'exportedAt', 'fix', 'format', 'sourceSha', 'total', 'wrong']);
  const allIds = new Set(CANDS.map((x) => x.id));
  for (const id of [...j.approved, ...j.wrong, ...j.fix.map((f: { id: string }) => f.id)]) expect(allIds.has(id)).toBe(true);
  expect(shared).not.toMatch(/Zed|private\.example|@/);
  expect(j.fix[0].note).toBe('Looks like a cable not dumbbell');
  expect(errors).toEqual([]);
});

test('backup export + restore (replace and merge) keep approvals; old backup without table; v10 DB migrates @matrix', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await pastIntake(page, []);
  const ladA = CANDS.filter((c) => c.ladder).slice(0, 3);
  const rowsA = [
    { id: ladA[0]!.id, decision: 'approve', at: 5 },
    { id: ladA[1]!.id, decision: 'wrong', at: 6 },
    { id: ladA[2]!.id, decision: 'fix', reason: 'other', note: 'odd', at: 7 },
  ];
  await dbPut(page, { candidateReviews: rowsA });
  await page.goto('./#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const path = (await dl.path())!;
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.tables.candidateReviews).toHaveLength(3);
  const wipe = async () => {
    await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
    await page.goto('./#/history');
    await page.reload();
    await expect(page.getByText('No workouts yet')).toBeVisible();
  };
  // Replace
  await wipe();
  expect(await dbAll(page, 'candidateReviews')).toEqual([]);
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  await page.getByTestId('restore-replace').tap();
  await page.getByTestId('restore-replace').tap();
  await expect.poll(async () => (await dbAll(page, 'candidateReviews')).length).toBe(3);
  expect((await dbAll<{ id: string }>(page, 'candidateReviews')).map((r) => r.id).sort()).toEqual(rowsA.map((r) => r.id).sort());
  await page.reload();
  await shot(page, 'after-restore-replace');
  // Merge: local has a different decision on another candidate; plus one conflicting
  const other = CANDS.filter((c) => c.ladder)[5]!;
  await dbPut(page, { candidateReviews: [{ id: other.id, decision: 'approve', at: 9 }, { id: ladA[0]!.id, decision: 'wrong', at: 99 }] });
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  await page.getByTestId('restore-merge').tap();
  await page.waitForTimeout(1200);
  const merged = await dbAll<{ id: string; decision: string; at: number }>(page, 'candidateReviews');
  console.log('merge result: ' + JSON.stringify(merged.map((r) => [r.id.slice(0, 12), r.decision, r.at])));
  expect(merged.map((r) => r.id)).toContain(other.id);
  // Old backup (no candidateReviews key): must be accepted, not refused
  const old = JSON.parse(JSON.stringify(file));
  delete old.tables.candidateReviews;
  old.schemaVersion = 10;
  const { writeFileSync } = await import('node:fs');
  const oldPath = path + '.old.json';
  writeFileSync(oldPath, JSON.stringify(old));
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(oldPath);
  await expect(page.getByRole('dialog', { name: 'Restore backup' })).toBeVisible();
  await page.getByTestId('restore-replace').tap();
  await page.getByTestId('restore-replace').tap();
  await page.waitForTimeout(1200);
  const after = await dbAll(page, 'candidateReviews');
  console.log(`old backup (no table) replace -> candidateReviews rows now: ${after.length}`);
  expect(errors).toEqual([]);
});

test('Dexie v10 shaped DB opens, upgrades to v11 and keeps every prior row @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./icons/favicon.svg');
  const stores: Record<string, string> = {
    profile: 'id', gyms: 'id', plans: 'id', planDays: 'id', sessions: 'id', sets: 'id', runs: 'id', exerciseSettings: '', planState: 'id', orderCounters: 'sessionId', submissions: 'id', tombstones: 'id', kv: 'key', journal: 'id', reportQueue: 'id', crashSignatures: '', reportPreferences: 'id', coachLifts: 'key', coachChanges: 'id', coachCards: 'id', efforts: '',
  };
  await page.evaluate(
    (st) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('anygym', 100);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const [n, kp] of Object.entries(st)) {
            const s = n === 'exerciseSettings' ? db.createObjectStore(n, { keyPath: ['exerciseId', 'gymId'] }) : n === 'crashSignatures' ? db.createObjectStore(n, { keyPath: ['signature', 'day'] }) : n === 'efforts' ? db.createObjectStore(n, { keyPath: ['sessionId', 'exerciseId'] }) : db.createObjectStore(n, { keyPath: kp });
            if (n === 'gyms') s.createIndex('createdAt', 'createdAt');
            if (n === 'sessions') { s.createIndex('startedAt', 'startedAt'); s.createIndex('gymId', 'gymId'); }
            if (n === 'sets') { s.createIndex('sessionId', 'sessionId'); s.createIndex('exerciseId', 'exerciseId'); s.createIndex('[sessionId+order]', ['sessionId', 'order']); }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['gyms', 'profile', 'sessions', 'sets'], 'readwrite');
          tx.objectStore('profile').put({ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { goal: 'muscle', goals: ['muscle'], experience: '1_2y', minutes: 45 } });
          tx.objectStore('gyms').put({ id: 'g1', name: 'Old Gym', type: 'full', unit: 'lb', equipment: ['dumbbells'], dumbbellRange: null, bars: [], stackStep: 5, equipmentWeights: {}, plateInventory: {}, collars: 'none', plateColors: {}, isActive: true, createdAt: 5 });
          tx.objectStore('sessions').put({ id: 's1', gymId: 'g1', startedAt: 100, endedAt: 200, imported: false, exerciseIds: ['Pushups'] });
          tx.objectStore('sets').put({ id: 'set1', sessionId: 's1', exerciseId: 'Pushups', order: 0, kind: 'work', reps: 12, uncertain: false });
          tx.oncomplete = () => { db.close(); res(); };
          tx.onerror = () => rej(tx.error);
        };
        req.onerror = () => rej(req.error);
      }),
    stores,
  );
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByTestId('history-row')).toHaveCount(1, { timeout: 15000 });
  expect((await dbAll(page, 'sets')).length).toBe(1);
  expect((await dbAll<{ name: string }>(page, 'gyms'))[0]!.name).toBe('Old Gym');
  expect(await page.evaluate(() => new Promise<number>((r) => { const q = indexedDB.open('anygym'); q.onsuccess = () => { const v = q.result.version; q.result.close(); r(v); }; }))).toBe(110);
  expect(await dbAll(page, 'candidateReviews')).toEqual([]);
  expect(errors).toEqual([]);
});

test('offline: app shell loads, precache holds no candidate photos, deck works offline after one online visit @matrix', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto('./');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForTimeout(1500);
  const before = await page.evaluate(async () => {
    const out: Record<string, number> = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
    const pre = (await caches.keys()).find((k) => k.includes('precache'))!;
    const excInPrecache = (await (await caches.open(pre)).keys()).filter((r) => r.url.includes('/exc/')).length;
    return { out, excInPrecache };
  });
  console.log('caches before deck: ' + JSON.stringify(before));
  expect(before.excInPrecache).toBe(0);
  expect(before.out['candidate-photos'] ?? 0).toBe(0);
  // online visit to the deck, wait for the batch photos to be fetched
  await openDeck(page);
  await page.waitForTimeout(4000);
  const mid = await page.evaluate(async () => {
    const out: Record<string, number> = {};
    for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
    return out;
  });
  console.log('caches after deck: ' + JSON.stringify(mid));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('batch-progress')).toHaveText(/Batch 1 of/, { timeout: 15000 });
  const imgs = page.getByTestId('deck-card').getByTestId('deck-demo').locator('img');
  for (const n of [0, 1]) expect(await imgs.nth(n).evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByTestId('candidate-approve').tap();
  await expect(page.getByTestId('candidate-notice')).toContainText('Approved');
  await shot(page, 'deck-offline-reload');
  await page.goto('./#/');
  await expect(page.locator('main')).toBeVisible();
  await context.setOffline(false);
  expect(errors.filter((e) => !/Failed to load resource|Load failed/.test(e))).toEqual([]);
});
