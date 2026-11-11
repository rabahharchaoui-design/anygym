import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, watchErrors } from './workout-helpers';
import { pastIntake } from './helpers/quick';

const G_GEAR = ['treadmill', 'elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'yoga_mat', 'lat_pulldown', 'cable_station'];

async function seedGym(page: Page, unit: 'lb' | 'kg', max: number, step: number, equipment = G_GEAR) {
  const active = (await dbAll<Record<string, unknown>>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...active, name: 'Guam', type: 'hotel', unit, equipment, dumbbellRange: { min: step, max, step } }] });
  await page.reload();
}


for (const [unit, max, step] of [['kg', 22, 2], ['lb', 45, 5]] as const) {
  test(`cards at 30 and 45 for G's gym (${unit} rack)`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    await seedGym(page, unit, max, step);
    const lines: string[] = [];
    for (const m of [30, 45]) {
      await page.goto(`./#/quick?min=${m}`);
      await expect(page.locator('[data-concept]')).toHaveCount(4);
      await page.waitForTimeout(800);
      const heads = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-concept')!, (e.textContent ?? '').replace(/\s+/g, ' ')]));
      for (const [id, head] of heads) {
        const p2 = await page.context().newPage();
        await p2.goto(`./#/quick?min=${m}`);
        await expect(p2.locator('[data-concept]')).toHaveCount(4);
        await p2.locator(`[data-concept="${id}"]`).tap();
        await p2.getByTestId('quick-start').tap();
        await expect(p2).toHaveURL(/#\/workout\//);
        const open = (await dbAll<{ exerciseIds: string[]; endedAt?: number }>(p2, 'sessions')).filter((x) => x.endedAt === undefined).at(-1)!;
        lines.push(`${unit} ${m}min ${id} [${head}] => ${open.exerciseIds.join(', ')}`);
        // end it so the next card starts clean
        await dbPut(p2, { sessions: [{ ...open, endedAt: Date.now() }] });
        await p2.close();
      }
    }
    console.log('CARDS\n' + lines.join('\n'));
    expect(errors).toEqual([]);
  });
}

// ---- dumbbell cap through the coach (weekly Level up) ----
function lastWeek(day = 2): number {
  const now = new Date();
  const back = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back - 7 + day, 18).getTime();
}
const cases: Array<[unit: 'lb' | 'kg', max: number, step: number, eachLast: number]> = [
  ['lb', 45, 5, 40],
  ['lb', 45, 5, 45],
  ['kg', 22, 2, 20],
  ['kg', 22, 2, 22],
];
for (const [unit, max, step, each] of cases) {
  test(`coach at the rack top: ${unit} rack ${max}, last week ${each} each`, async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await seedGym(page, unit, max, step);
    const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
    const mk = async (id: string, at: number, exId: string, reps: number, total: number) => {
      await dbPut(page, {
        sessions: [{ id, gymId: gym.id, startedAt: at, endedAt: at + 3_600_000, imported: false, exerciseIds: [exId] }],
        sets: [0, 1, 2].map((o) => ({ id: `${id}-${o}`, sessionId: id, exerciseId: exId, order: o, kind: 'work', uncertain: false, reps, load: { kind: 'dumbbell_each', unit, total } })),
      });
    };
    await mk('v-last', lastWeek(2), 'dumbbell-bench-press', 12, each * 2);
    await mk('v-today', Date.now() - 2 * 3_600_000, 'dumbbell-bicep-curl', 9, 2 * step * 2);
    await page.goto('./');
    await page.reload();
    const card = page.getByTestId('coach-card');
    await page.waitForTimeout(1500);
    const text = (await card.count()) ? (await card.innerText()).replace(/\n+/g, ' | ') : '(no coach card)';
    console.log(`COACH ${unit} rack ${max}, last ${each}: ${text}`);
    await page.screenshot({ path: `reports/shots/3.5j-verify/coach-${unit}-${each}.png` });
    // never a target above the rack
    for (const m of text.matchAll(/→ (\d+(?:\.\d+)?)/g)) expect(Number(m[1])).toBeLessThanOrEqual(max);
    expect(errors).toEqual([]);
  });
}

// ---- cardio approved on the phone, and the candidate gate ----
const CAND_IDS = new Set<string>((JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { candidates: Array<{ id: string }> }).candidates.map((c) => c.id));

async function listCards(page: Page, m: number): Promise<Array<{ id: string; head: string; ids: string[]; first: string }>> {
  await page.goto(`./#/quick?min=${m}`);
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await page.waitForTimeout(800);
  const heads = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-concept')!, (e.textContent ?? '').replace(/\s+/g, ' ')]));
  const out: Array<{ id: string; head: string; ids: string[]; first: string }> = [];
  for (const [id, head] of heads) {
    const p2 = await page.context().newPage();
    await p2.goto(`./#/quick?min=${m}`);
    await expect(p2.locator('[data-concept]').first()).toBeVisible();
    await p2.waitForTimeout(500);
    if (!(await p2.locator(`[data-concept="${id}"]`).count())) {
      await p2.close();
      continue;
    }
    await p2.locator(`[data-concept="${id}"]`).tap();
    await p2.getByTestId('quick-start').tap();
    await expect(p2).toHaveURL(/#\/workout\//);
    const open = (await dbAll<{ exerciseIds: string[]; endedAt?: number }>(p2, 'sessions')).filter((x) => x.endedAt === undefined).at(-1)!;
    out.push({ id: id!, head: head!, ids: open.exerciseIds, first: open.exerciseIds[0]! });
    await dbPut(p2, { sessions: [{ ...open, endedAt: Date.now() }] });
    await p2.close();
  }
  return out;
}

test('cardio approved on the phone (treadmill, jogging, stairs; walking declined): warm up on a machine G has, counted in minutes; gate holds', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await pastIntake(page);
  await seedGym(page, 'lb', 45, 5);
  await dbPut(page, { candidateReviews: [['Running_Treadmill', 'approve'], ['Stairmaster', 'approve'], ['Jogging_Treadmill', 'approve'], ['Walking_Treadmill', 'reject']].map(([id, decision], i) => ({ id, decision, at: 1000 + i })) });
  await page.reload();
  const lines: string[] = [];
  for (const m of [30, 45]) {
    const cards = await listCards(page, m);
    for (const c of cards) {
      const meta = c.head.match(/(\d+) exercises?.*?~(\d+) min/);
      lines.push(`${m}min ${c.id} [${c.head}] => ${c.ids.join(', ')}`);
      const cand = c.ids.filter((i) => CAND_IDS.has(i));
      for (const i of cand) expect(['Running_Treadmill', 'Stairmaster', 'Jogging_Treadmill'], `${m} ${c.id}: unapproved candidate ${i}`).toContain(i);
      expect(c.ids).not.toContain('Walking_Treadmill');
      const minutes = Number(meta![2]);
      expect(minutes, `${m} ${c.id} over`).toBeLessThanOrEqual(m + 2);
    }
  }
  console.log('CARDIO CARDS\n' + lines.join('\n'));
  expect(errors).toEqual([]);
});

test('no approvals: no candidate in any card and no cardio claimed, G gym, 45 min', async ({ page }) => {
  test.setTimeout(120_000);
  await pastIntake(page);
  await seedGym(page, 'kg', 22, 2);
  for (const c of await listCards(page, 45)) {
    expect(c.ids.filter((i) => CAND_IDS.has(i)), c.id).toEqual([]);
    expect(c.head).not.toMatch(/warm up|cardio|treadmill/i);
  }
});

// ---- an old gym and an old backup ----
test('a gym made before 3.5j (no elliptical, no yoga mat) backs up, restores and still works; its picker shows the new items off', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await pastIntake(page);
  const OLD = ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'];
  const active = (await dbAll<Record<string, unknown>>(page, 'gyms')).find((g) => g.isActive)!;
  await dbPut(page, { gyms: [{ ...active, name: 'Old hotel', equipment: OLD, dumbbellRange: { min: 5, max: 50, step: 5 } }] });
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const path = await download.path();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  // make it look older: strip any field the new build might add to a gym
  expect(file.tables.gyms.find((g: { name: string }) => g.name === 'Old hotel').equipment).toEqual(OLD);
  await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
  await page.goto('./#/history');
  await page.reload();
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  await page.getByTestId('restore-replace').tap();
  await page.getByTestId('restore-replace').tap();
  await expect.poll(async () => (await dbAll<{ name: string; equipment: string[] }>(page, 'gyms')).map((g) => g.name)).toContain('Old hotel');
  const g = (await dbAll<{ name: string; equipment: string[]; dumbbellRange: unknown }>(page, 'gyms')).find((x) => x.name === 'Old hotel')!;
  expect(g.equipment).toEqual(OLD);
  expect(g.dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
  await page.goto('./#/settings/gyms');
  await page.getByTestId('gyms-list').locator('button', { hasText: 'Old hotel' }).tap();
  await page.getByTestId('edit-equipment').tap();
  const picker = page.getByTestId('gym-equipment');
  await expect(picker.getByTestId('equip-elliptical')).toHaveAttribute('aria-pressed', 'false');
  await expect(picker.getByTestId('equip-yoga_mat')).toHaveAttribute('aria-pressed', 'false');
  await expect(picker.getByTestId('equip-treadmill')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByTestId('range-max')).toHaveValue('50');
  await page.screenshot({ path: 'reports/shots/3.5j-verify/old-gym-picker.png' });
  for (const c of await listCards(page, 30)) expect(c.ids.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// ---- the Added toast now has a Make active button: does it ever sit on a gym row? ----
test('Added toast with Make active: does not cover a gym row; tapping the new row opens its detail', async ({ page }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  await page.goto('./#/settings/gyms');
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('gym-name').fill('Dbl');
  await page.getByTestId('add-gym').tap();
  const toastBtn = page.getByRole('button', { name: 'Make active' });
  await expect(toastBtn).toBeVisible();
  await page.waitForTimeout(500);
  const tb = (await toastBtn.boundingBox())!;
  const rows = await page.getByTestId('gyms-list').locator('button').evaluateAll((els) => els.map((e) => ({ t: e.textContent, r: e.getBoundingClientRect().toJSON() })));
  const hit = rows.filter((r) => r.r.top < tb.y + tb.height && r.r.bottom > tb.y && r.r.left < tb.x + tb.width && r.r.right > tb.x);
  await page.screenshot({ path: 'reports/shots/3.5j-verify/added-toast.png' });
  console.log('TOAST', JSON.stringify(tb), 'rows', rows.length, 'overlapping rows', hit.map((h) => h.t));
  await page.getByTestId('gyms-list').locator('button', { hasText: 'Dbl' }).tap();
  await expect(page.getByTestId('make-active')).toBeVisible({ timeout: 4000 });
  expect(errors).toEqual([]);
});

test('double tap on Add gym never lands on the toast Make active (new gym stays inactive)', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/settings/gyms');
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('gym-name').fill('Dbl2');
  await page.getByTestId('add-gym').dblclick({ delay: 120 });
  await page.waitForTimeout(1200);
  const gyms = await dbAll<{ name: string; isActive: boolean }>(page, 'gyms');
  console.log('AFTER DBLCLICK', JSON.stringify(gyms.map((g) => [g.name, g.isActive])));
  expect(gyms.filter((g) => g.name === 'Dbl2')).toHaveLength(1);
  expect(gyms.find((g) => g.name === 'Dbl2')!.isActive).toBe(false);
});

test('the Heaviest field survives zero, huge, negative and junk values', async ({ page }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  await page.goto('./#/settings/gyms');
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  const kit = page.getByTestId('new-gym-equipment');
  const out: string[] = [];
  for (const v of ['0', '1', '99999', '-5', 'abc', '22.5', '4', '1e9', '']) {
    await kit.getByTestId('range-max').fill(v);
    await page.waitForTimeout(100);
    const dis = await page.getByTestId('add-gym').isDisabled();
    out.push(`${JSON.stringify(v)} -> disabled=${dis} cap="${(await kit.getByTestId('range-cap').innerText()).trim()}" note="${(await kit.getByTestId('range-note').innerText()).trim()}"`);
  }
  console.log('RANGE\n' + out.join('\n'));
  await kit.getByTestId('range-max-unit').getByRole('radio', { name: 'kg' }).tap();
  for (const v of ['0', '1', '99999', '22', '3']) {
    await kit.getByTestId('range-max').fill(v);
    await page.waitForTimeout(100);
    out.push(`kg ${v} -> disabled=${await page.getByTestId('add-gym').isDisabled()} cap="${(await kit.getByTestId('range-cap').innerText()).trim()}" note="${(await kit.getByTestId('range-note').innerText()).trim()}"`);
  }
  console.log('RANGE kg\n' + out.slice(9).join('\n'));
  expect(errors).toEqual([]);
});
