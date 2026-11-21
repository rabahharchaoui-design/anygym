// PLAN M1: how wide a data field's number is, in em of Inter 900 with tabular figures, so the field
// can pick the biggest size that still fits its width (never clipped, never wrapped). Pure layout
// geometry: it reads the printed text only, it never works out a value.

/** What stands where a value is not trusted (the same two dashes the run screens print for no pace). */
export const BLANK = '--';

export type DataFieldSize = 'hero' | 'large' | 'medium';

/** Letter spacing of each size, in em: --track-number in tokens.css (PLAN M2: the hero's -5% made the
 *  colon and the point touch their neighbours, so every size uses the looser figure tracking). */
export const TRACKING: Record<DataFieldSize, number> = { hero: -0.02, large: -0.02, medium: -0.02 };

// Advance widths measured in WebKit from the shipped Inter (weight 900, 'tnum'): every figure and the
// dash are 0.645 em, the colon, point and comma 0.269 em. Letters vary; 0.95 em covers the widest (m, w).
const FIGURE = 0.645;
const NARROW = 0.269;
const OTHER = 0.95;
/** A little room so a rounding pixel never clips the last figure. */
const SAFETY = 1.03;

function advance(ch: string): number {
  if (/[0-9-]/.test(ch)) return FIGURE;
  if (/[:.,]/.test(ch)) return NARROW;
  if (ch === ' ') return NARROW;
  return OTHER;
}

/** The printed width of `text` in em at one font size, tracking included. Never less than one figure. */
export function numberEm(text: string, size: DataFieldSize): number {
  const chars = [...text];
  const raw = chars.reduce((sum, ch) => sum + advance(ch) + TRACKING[size], 0);
  return Math.max(FIGURE, raw) * SAFETY;
}
