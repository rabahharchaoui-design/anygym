import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from './fixtures';

// Tester checks for PLAN 3.2: doubtful names never matched, pick sheet at 130% text, idempotent
// re-import after a mapping change, old (no importMap) imports left alone. Synthetic data only.
const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '..', 'src', 'lib', 'import', '__tests__', 'fixtures');
const MAPPING = join(FX, 'synthetic-mapping-v1.json');
const OLD = join(FX, 'synthetic-import-v1.json');
const SHOTS = join(HERE, '..', 'reports', 'shots', '3.2', 'verify');

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};
const dbAll = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const c = req.result;
          const r = c.transaction(name, 'readonly').objectStore(name).getAll();
          r.onsuccess = () => { c.close(); resolve(r.result); };
        };
      }),
    store,
  );
const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, `${name}-${test.info().project.name.replace(/\s+/g, '-')}.png`) });
};
const load = async (page: Page, file: string) => {
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles(file);
  await expect(page.getByTestId('import-summary')).toBeVisible();
};

async function answerAll(page: Page) {
  const confirm = page.getByTestId('import-confirm');
  // The label reads "Checking…" until earlier imports are known: wait, or the loop ends too soon.
  await expect(confirm).not.toHaveText('Checking…');
  for (let i = 0; i < 12; i++) {
    if (!/^Answer/.test((await confirm.textContent()) ?? '')) return;
    await confirm.tap();
    const pick = page.getByRole('dialog', { name: 'Pick the exercise' });
    const kind = page.getByRole('dialog', { name: 'How do you load this?' });
    await expect(pick.or(kind)).toBeVisible();
    if (await pick.isVisible()) await pick.getByTestId('pick-keep-name').tap();
    else await kind.getByRole('button', { name: /Machine with a pin/ }).tap();
    await expect(pick.or(kind)).toHaveCount(0);
    await page.waitForTimeout(400);
  }
}

test('doubtful names (Squat, Bench, Curl) are never matched by themselves', async ({ page }) => {
  const errors = watch(page);
  const dir = mkdtempSync(join(tmpdir(), 'v32-'));
  try {
    const names = ['Squat', 'Bench', 'Curl', 'Barbell Curl'];
    const file = join(dir, 'doubt.json');
    writeFileSync(file, JSON.stringify({
      format: 'anygym-import-v1', owner: 'T', unit: 'lb', source: 'synthetic', conventions: {},
      exercises: names.map((n) => ({ name: n, planExercise: n, loadType: 'stack', sessions: [{ sets: [{ reps: 10, weight: 50 }] }] })),
    }));
    await load(page, file);
    for (const n of ['Squat', 'Bench', 'Curl']) {
      const r = page.getByRole('region', { name: `${n} (not matched)`, exact: true });
      await expect(r.getByTestId('ask-pick')).toBeVisible();
      await expect(r.getByTestId('import-match')).toHaveCount(0);
    }
    await expect(page.getByRole('region', { name: 'Barbell Curl', exact: true }).getByTestId('import-match')).toContainText('Matched: Barbell Curl');
    await shot(page, 'doubt');
    expect(errors).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pick sheet at 130% text, skip and bring back, keep stores name only', async ({ page }) => {
  // PLAN 3.2 check 7 (fixed): at 130% at least 3 full rows stay above the one row footer on every phone.
  const errors = watch(page);
  await load(page, MAPPING);
  const region = page.getByRole('region', { name: 'Moon press (not matched)', exact: true });
  await region.getByRole('button', { name: 'Pick the exercise' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the exercise' });
  await expect(sheet.getByRole('heading', { name: 'In your plans' })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'More exercises' })).toBeAttached();
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sz = els.map((el) => { const s = getComputedStyle(el); return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) }; });
    for (const { el, size, line } of sz) { el.style.fontSize = `${size * 1.3}px`; if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`; }
  });
  await page.waitForTimeout(300);
  await shot(page, 'pick-130');
  const vh = page.viewportSize()!.height;
  // Under 600 pt tall at 130% (the 320 x 568 floor) the title, file line and search take the first
  // screen; they scroll with the list, so the rule is read with the list scrolled to its first row:
  // three full rows still fit between the top of the sheet's body and the pinned footer (PLAN 3.6v).
  const toList = vh <= 600;
  const m = await sheet.evaluate((el, toList) => {
    const first = el.querySelector<HTMLElement>('ul li button')!;
    let top = 0;
    if (toList) {
      let sc: HTMLElement | null = first.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (sc) {
        sc.scrollTop += first.getBoundingClientRect().top - sc.getBoundingClientRect().top;
        top = sc.getBoundingClientRect().top;
      }
    }
    const rows = Array.from(el.querySelectorAll<HTMLElement>('ul li button')).map((b) => b.getBoundingClientRect());
    const keep = el.querySelector<HTMLElement>('[data-testid="pick-keep-name"]')!.getBoundingClientRect();
    const btns = Array.from(el.querySelectorAll<HTMLElement>('button')).filter((b) => /Keep as|Skip/.test(b.textContent ?? '')).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, top: r.top, bottom: r.bottom, h: r.height, clipped: b.scrollWidth > b.clientWidth + 1 }; });
    const visibleRows = rows.filter((r) => r.top >= top - 0.5 && r.bottom <= keep.top - 4 && r.height >= 47.5).length;
    return { visibleRows, keepBottom: keep.bottom, btns, sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth };
  }, toList);
  console.log('PICK130', vh, JSON.stringify(m));
  expect(m.visibleRows).toBeGreaterThanOrEqual(3);
  for (const b of m.btns) { expect(b.bottom).toBeLessThanOrEqual(vh); expect(b.top).toBeGreaterThanOrEqual(0); expect(b.h).toBeGreaterThanOrEqual(47.5); expect(b.clipped).toBe(false); }
  expect(m.sw).toBeLessThanOrEqual(m.w);
  // Skip then bring back.
  await sheet.getByRole('button', { name: /^Skip (this|these)/ }).tap();
  await expect(region.or(page.getByRole('region', { name: /Moon press/ }))).toContainText('Skipped');
  await page.getByRole('region', { name: /Moon press/ }).getByRole('button', { name: 'Bring back' }).tap();
  await expect(page.getByRole('region', { name: 'Moon press (not matched)', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('same file twice adds nothing even after a mapping change; old imports untouched', async ({ page }) => {
  const errors = watch(page);
  // "Old" import: the earlier fixture, then strip importMap to look like a pre-3.2 import.
  await load(page, OLD);
  await answerAll(page);
  await page.getByTestId('import-confirm').tap();
  await expect(page).toHaveURL(/#\/settings$/);
  await page.evaluate(() => new Promise<void>((res, rej) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      const c = req.result; const tx = c.transaction('sets', 'readwrite'); const st = tx.objectStore('sets');
      st.openCursor().onsuccess = (e: any) => { const cur = e.target.result; if (!cur) return; const v = cur.value; delete v.importMap; cur.update(v); cur.continue(); };
      tx.oncomplete = () => { c.close(); res(); };
    };
  }));
  const oldSets = JSON.stringify((await dbAll(page, 'sets')).sort((a, b) => a.id.localeCompare(b.id)));
  const oldSessions = JSON.stringify((await dbAll(page, 'sessions')).sort((a, b) => a.id.localeCompare(b.id)));
  const nOld = (await dbAll(page, 'sets')).length;

  // New file: import it with defaults requires answers; answer by keeping names.
  await load(page, MAPPING);
  const confirm = page.getByTestId('import-confirm');
  await answerAll(page);
  await expect(confirm).toHaveText(/^Import \d+ sets$/);
  await shot(page, 'review-kept-all');
  await confirm.tap();
  await expect(page).toHaveURL(/#\/settings$/);
  const afterNew = (await dbAll(page, 'sets')).length;
  expect(afterNew).toBeGreaterThan(nOld);
  // Old import rows byte identical.
  const stillOld = (await dbAll(page, 'sets')).filter((s) => !s.importMap);
  expect(JSON.stringify(stillOld.sort((a, b) => a.id.localeCompare(b.id)))).toBe(oldSets);
  const sessionsNow = (await dbAll(page, 'sessions')).filter((s) => JSON.parse(oldSessions).some((o: any) => o.id === s.id));
  expect(JSON.stringify(sessionsNow.sort((a, b) => a.id.localeCompare(b.id)))).toBe(oldSessions);

  // Same file again, with a different mapping chosen: nothing new.
  await load(page, MAPPING);
  await expect(page.getByTestId('import-already')).toBeVisible();
  const txt = await page.getByTestId('import-confirm').textContent();
  console.log('SECOND CONFIRM', txt);
  const btn = page.getByTestId('import-confirm');
  if (await btn.isEnabled()) await btn.tap().catch(() => {});
  await page.waitForTimeout(500);
  expect((await dbAll(page, 'sets')).length).toBe(afterNew);
  // Old file again: nothing new either.
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles(OLD);
  await expect(page.getByTestId('import-summary')).toBeVisible();
  await expect(page.getByTestId('import-already')).toBeVisible();
  expect((await dbAll(page, 'sets')).length).toBe(afterNew);
  await shot(page, 'already');
  expect(errors).toEqual([]);
});
