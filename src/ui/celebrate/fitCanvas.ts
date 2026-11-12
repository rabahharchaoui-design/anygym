/**
 * Sizes a canvas to the box it fills, sharp on any phone but never more than 2x: a 3x full screen
 * canvas is 2.25 times the pixels for nothing the eye sees in motion. Drawing then works in CSS
 * pixels. Returns that box.
 */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): DOMRect {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  ctx.scale(dpr, dpr);
  return box;
}
