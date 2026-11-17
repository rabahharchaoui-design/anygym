// Which page a sideways swipe on the live run lands on (PLAN 4.3). Pure.
export type Page = 0 | 1;

/** A swipe turns the page once it has gone this share of the screen (or 56 px, whichever is less). */
export const SWIPE_SHARE = 0.18;

export function pageAfterSwipe(page: Page, dx: number, width: number): Page {
  const need = Math.min(56, width * SWIPE_SHARE);
  if (page === 0 && dx <= -need) return 1;
  if (page === 1 && dx >= need) return 0;
  return page;
}
