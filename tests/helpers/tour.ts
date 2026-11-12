import type { Locator, Page } from '@playwright/test';

export type Box = { x: number; y: number; width: number; height: number };

/** What the welcome lights: an element, or a box worked out on the spot (the day card, below). */
export type TourTarget = Locator | (() => Promise<Box | null>);

export const boxOf = (target: TourTarget): Promise<Box | null> => (typeof target === 'function' ? target() : target.boundingBox());

/** The welcome's own spacing (src/screens/today/WelcomeTour.tsx): the light's pad, the gap to the words, the screen edge. */
const PAD = 6;
const GAP = 12;
const EDGE = 16;

/**
 * PLAN 3.6v: the day card as the welcome lights it. Whole, when it and the words fit between the
 * top of the screen and the tab bar; on a screen too short for both (the 320 floor), down to Start,
 * so Start is still in the light and nothing lit is cut off.
 */
export const dayLit = (page: Page) => async (): Promise<Box | null> => {
  const day = page.getByRole('region', { name: "Today's plan day" });
  const card = await day.boundingBox();
  const start = await day.getByRole('button', { name: 'Start', exact: true }).boundingBox();
  const words = await page.getByTestId('tour-words').boundingBox();
  const tabs = await page.locator('[data-tour="tabs"]').boundingBox();
  if (!card || !start || !words || !tabs) return null;
  const room = tabs.y - GAP - EDGE;
  if (card.height + PAD * 2 + GAP + words.height <= room) return card;
  return { ...card, height: start.y + start.height - card.y };
};

/**
 * The words' line (17 pt, 1.3 line height): one line where it fits (375 points and up), wrapped at
 * most once on narrower phones, never a paragraph.
 */
export const tourLineMax = (page: Page) => (page.viewportSize()!.width >= 375 ? 30 : 52);

/**
 * The light's top and its target's top, read every frame while `act` runs and for `ms` after (PLAN
 * 3.6v). With reduced motion the light may only be at its old place or on the target (which may
 * itself jump as the page scrolls to it): a jump, never a glide. Reading frames in the page proves
 * that on any phone, where a fixed wait raced the first frame on a busy machine.
 */
export async function spotFrames(page: Page, target: string, act: () => Promise<void>, ms = 400): Promise<[number, number | null][]> {
  await page.evaluate((sel) => {
    const w = window as unknown as { __spotTops: [number, number | null][]; __spotFrame: number };
    w.__spotTops = [];
    const read = () => {
      const s = document.querySelector('[data-testid="tour-spot"]');
      const t = document.querySelector(sel);
      if (s) w.__spotTops.push([s.getBoundingClientRect().y, t ? t.getBoundingClientRect().y : null]);
      w.__spotFrame = requestAnimationFrame(read);
    };
    read();
  }, target);
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as { __spotTops: [number, number | null][]; __spotFrame: number };
    cancelAnimationFrame(w.__spotFrame);
    return w.__spotTops;
  });
}
