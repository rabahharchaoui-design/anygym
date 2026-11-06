import { expect, type Locator, type Page } from '../fixtures';
import { dbAll, dbPut } from '../workout-helpers';

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

/** A drag on the top card with the mouse (pointer events, as a finger would move it). */
export async function swipe(page: Page, dx: number, opts: { steps?: number; release?: boolean; slow?: boolean } = {}) {
  await expect(card(page)).toBeVisible();
  await page.waitForTimeout(60);
  const box = (await card(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.45;
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
  const box = (await card(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}

