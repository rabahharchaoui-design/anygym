// PLAN M14 (SPEC 10, 23): a toggle is words, not a pill. The picked word is the checked radio and it
// carries a 3 px ice line (the option's ::after, scaled to full width). Not picked: the line is flat.
import type { Locator } from '@playwright/test';

export interface WordMark {
  /** Height of the line in px (the --tab-mark-h token, 3). */
  height: number;
  /** Horizontal scale of the line: 1 for the picked word, 0 otherwise. */
  scaleX: number;
}

/** The ice line under one word of a toggle (a radio button of a SlidingToggle with `words`). */
export const wordMark = (radio: Locator): Promise<WordMark> =>
  radio.evaluate((el) => {
    const s = getComputedStyle(el, '::after');
    const m = new DOMMatrix(s.transform === 'none' ? undefined : s.transform);
    return { height: parseFloat(s.height), scaleX: m.a };
  });
