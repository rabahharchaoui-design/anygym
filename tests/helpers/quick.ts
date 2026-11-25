import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page } from '../fixtures';
import { dbAll, dbPut } from '../workout-helpers';
import { mouseFlick, stillBox } from './touch';

// PLAN 3.5a: shared Quick workout helpers (tests/quick-3.5a.spec.ts and tests/video-3.5a.spec.ts).

export const PROFILE = { id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, intake: { goal: 'muscle', goals: ['muscle'], experience: '1_2y', minutes: 45 } };
export const DUMBBELLS = ['dumbbells', 'adjustable_bench'];

type Gym = { id: string; isActive: boolean; equipment: string[]; dumbbellRange: unknown };

/** This phone has been through the intake (the build card is for people past it), at a gym with `equipment`. */
export async function pastIntake(page: Page, equipment?: string[]) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  await dbPut(page, { profile: [PROFILE] });
  if (equipment) {
    const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
    await dbPut(page, { gyms: [{ ...gym, equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null }] });
  }
  await page.reload();
}

/**
 * PLAN D0: the Quick pool is bigger now (bodyweight moves have demos), so no gym is "too empty" by its
 * equipment any more. This is the honest empty state's other way in: the person hid every move with
 * "never show me this" (profile.dislikes.never), so fewer than 3 moves fit and Quick says so.
 */
export async function hideEveryMove(page: Page) {
  const ids = new Set<string>((JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { id: string }[] }).exercises.map((e) => e.id));
  for (const e of JSON.parse(readFileSync('data/exercise-map.json', 'utf8')) as { planId: string }[]) ids.add(e.planId);
  await dbPut(page, { profile: [{ ...PROFILE, dislikes: { never: [...ids] } }] });
  await page.reload();
}

/**
 * PLAN 3.5g: warm up rows come first in the set table. Logs the current row, and keeps logging while the
 * row just logged was a warm up, so it ends having logged the first WORK set.
 */
export async function logFirstWorkSet(page: Page) {
  const current = page.locator('[data-testid="set-todo"][data-state="current"]');
  for (let i = 0; i < 5; i++) {
    const warm = (await current.getByRole('button', { name: /^Warm up set/ }).count()) > 0;
    await page.getByTestId('check-current').tap();
    await page.waitForTimeout(400);
    if (!warm) return;
  }
}

export const counter = () => {
  let n = 0;
  return {
    tap: async (l: Locator) => {
      await l.tap();
      n++;
    },
    get count() {
      return n;
    },
  };
};

export const card = (page: Page) => page.getByTestId('deck-card');

/**
 * Taps Keep and waits for its real result: the next card is on top, or Ready to go is up. A tap
 * while the last card is still flying out is dropped by design, and once the last card is kept the
 * buttons fade away, so a loop never taps again on a fixed delay (a busy phone is still flying).
 */
export async function keepCard(page: Page) {
  const top = () => page.evaluate(() => document.querySelector('[data-testid="deck-card"]')?.getAttribute('data-exercise') ?? null);
  const before = await top();
  await page.getByTestId('deck-keep').tap();
  await expect.poll(async () => (await page.getByTestId('ready-list').isVisible()) || (await top()) !== before).toBe(true);
}

/** A drag on the top card with the mouse (pointer events, as a finger would move it). */
export async function swipe(page: Page, dx: number, opts: { steps?: number; release?: boolean; slow?: boolean } = {}) {
  const box = await stillBox(card(page));
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
  if (!opts.slow && opts.release !== false) return mouseFlick(page, x, y, dx, 6, opts.steps ?? 12);
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (opts.slow) {
    // About a finger's pace: one move per frame.
    const steps = opts.steps ?? 30;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x + (dx * i) / steps, y + 6);
      await page.waitForTimeout(16);
    }
  } else await page.mouse.move(x + dx, y + 6, { steps: opts.steps ?? 12 });
  if (opts.release !== false) await page.mouse.up();
}

export async function longPress(page: Page) {
  const box = await stillBox(card(page));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}


/** One idea card as the person reads it: its face, then what is behind its info button (3.5f). */
export type IdeaRead = {
  id: string;
  title: string;
  why: string;
  /** The face's one numbers line, "6 exercises · ~28 min". */
  face: string;
  /** Behind the info button: the full line, "6 exercises · 2 pairs · ~29 min". */
  meta: string;
  chip: string;
  level: number;
  dots: number;
  dotsOn: number;
  gear: number;
  gearIcons: string[];
  gearLabel: string;
  noGear: boolean;
  short: string[];
  map: number;
  h: number;
};

/** 3.5f: calm card face. The idea sheet behind one card's info button, read, then closed. */
export async function readIdea(page: Page, c: Locator): Promise<IdeaRead> {
  const face = await c.evaluate((e) => ({
    id: e.getAttribute('data-concept')!,
    title: e.querySelector('[data-testid="concept-title"]')?.textContent ?? '',
    why: e.querySelector('[data-testid="concept-why"]')?.textContent ?? '',
    face: e.querySelector('[data-testid="concept-meta"]')?.textContent ?? '',
    map: e.querySelectorAll('[data-testid="mini-map"]').length,
    h: e.getBoundingClientRect().height,
  }));
  await c.getByTestId('concept-info').tap();
  const sheet = page.getByTestId('idea-sheet');
  await expect(sheet).toBeVisible();
  const back = await sheet.evaluate((e) => ({
    chip: e.querySelector('[data-testid="style-chip"]')?.textContent ?? '',
    level: Number(e.querySelector('[data-testid="effort"]')?.getAttribute('data-level')),
    dots: e.querySelectorAll('[data-testid="effort"] > span').length,
    dotsOn: e.querySelectorAll('[data-testid="effort"] > span[data-on]').length,
    meta: e.querySelector('[data-testid="idea-meta"]')?.textContent ?? '',
    gear: e.querySelectorAll('[data-testid="concept-gear"] svg[data-art]').length,
    gearIcons: Array.from(e.querySelectorAll('[data-testid="concept-gear"] svg[data-art]')).map((s) => s.getAttribute('data-art')!),
    gearLabel: e.querySelector('[data-testid="concept-gear"]')?.getAttribute('aria-label') ?? '',
    noGear: (e.querySelector('[data-testid="concept-gear"]')?.textContent ?? '').includes('No equipment'),
    short: Array.from(e.querySelectorAll('[data-testid="concept-short"]')).map((s) => s.textContent ?? ''),
  }));
  await page.keyboard.press('Escape');
  // Gone for good (a closing sheet keeps its words until it is off screen).
  await expect(sheet).toHaveCount(0);
  return { ...face, ...back };
}

/** 3.5f: calm card face. Every idea card on screen, each with what is behind its info button. */
export async function readIdeas(page: Page): Promise<IdeaRead[]> {
  const cards = page.locator('[data-concept]');
  const out: IdeaRead[] = [];
  for (let i = 0, n = await cards.count(); i < n; i++) out.push(await readIdea(page, cards.nth(i)));
  return out;
}
