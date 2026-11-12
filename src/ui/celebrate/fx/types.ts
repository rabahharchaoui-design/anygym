// What a canvas effect is (PLAN 3.6h): a list of pieces made once, and a pure picture of them at a
// moment in time. FxCanvas owns the canvas, the clock, the pause and the still.

/** The palette, read from tokens.css by the canvas (never a colour written in an effect). */
export type Inks = { accent: string; hi: string; text: string; pair: string; dim: string };

export type Fx<P> = {
  /** One run, in ms. */
  life: number;
  /** The frame (0 to 1) that is the still picture under reduced motion. */
  stillAt: number;
  /** The last frame stays on the canvas (a ring that assembled) instead of clearing. */
  holds: boolean;
  make(count: number, rnd: () => number, w: number, h: number): P[];
  draw(ctx: CanvasRenderingContext2D, parts: readonly P[], t: number, w: number, h: number, inks: Inks): void;
};

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
export const easeOut = (u: number): number => 1 - (1 - u) ** 3;
