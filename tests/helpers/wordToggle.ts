// PLAN M14/M15 (SPEC 10, 23): a toggle is words, not a filled pill. The picked word is the checked radio and
// one 3 px ice line (the toggle's [data-pill], the specs' name for the moving mark) sits under it.
import type { Locator } from '@playwright/test';

export interface WordMark {
  /** Number of moving marks in the toggle (one, or none while nothing is picked). */
  count: number;
  /** Height of the line in px (the --tab-mark-h token, 3). */
  height: number;
  /** True when the line's middle is inside the checked word's box (horizontally). */
  underChecked: boolean;
}

/** The ice line of a toggle (a radiogroup) and whether it is under the checked word. */
export const wordMark = (group: Locator): Promise<WordMark> =>
  group.evaluate((g) => {
    const line = g.querySelector<HTMLElement>('[data-pill]');
    const on = g.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
    const count = g.querySelectorAll('[data-pill]').length;
    if (!line || !on) return { count, height: 0, underChecked: false };
    const l = line.getBoundingClientRect();
    const o = on.getBoundingClientRect();
    const mid = l.left + l.width / 2;
    return { count, height: Math.round(l.height), underChecked: mid >= o.left - 1 && mid <= o.right + 1 };
  });
