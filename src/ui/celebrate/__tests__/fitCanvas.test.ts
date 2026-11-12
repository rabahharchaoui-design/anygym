import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitCanvas } from '../fitCanvas';

// 3.6x: Particles and FxCanvas each sized their canvas by hand. The old lines are replayed on a
// stand in canvas next to the shared helper, for a table of boxes and pixel ratios.
type Box = { width: number; height: number };
const fake = (box: Box) => {
  const scaled: number[][] = [];
  const canvas = { width: 300, height: 150, getBoundingClientRect: () => ({ ...box }) as DOMRect };
  const ctx = { scale: (x: number, y: number) => void scaled.push([x, y]) };
  return { canvas, ctx, scaled };
};
function oldCopy(canvas: ReturnType<typeof fake>['canvas'], ctx: ReturnType<typeof fake>['ctx']) {
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  ctx.scale(dpr, dpr);
  return box;
}

afterEach(() => vi.unstubAllGlobals());

describe('fitCanvas', () => {
  const cases: Array<[Box, number | undefined]> = [
    [{ width: 393, height: 852 }, 3],
    [{ width: 393, height: 852 }, 2],
    [{ width: 375, height: 667 }, 1],
    [{ width: 320.5, height: 100.25 }, 1.5],
    [{ width: 0, height: 0 }, 2],
    [{ width: 200, height: 120 }, undefined],
    [{ width: 200, height: 120 }, 0],
  ];
  it.each(cases)('box %j at ratio %s: the same size, scale and box as the old copy', (box, dpr) => {
    vi.stubGlobal('window', { devicePixelRatio: dpr });
    const a = fake(box);
    const b = fake(box);
    const gotBox = fitCanvas(a.canvas as unknown as HTMLCanvasElement, a.ctx as unknown as CanvasRenderingContext2D);
    const oldBox = oldCopy(b.canvas, b.ctx);
    expect([a.canvas.width, a.canvas.height]).toEqual([b.canvas.width, b.canvas.height]);
    expect(a.scaled).toEqual(b.scaled);
    expect(gotBox).toEqual(oldBox);
    expect(a.scaled[0]![0]).toBeLessThanOrEqual(2);
  });
});
