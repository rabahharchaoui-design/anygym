import { describe, expect, it } from 'vitest';
import { blobToBase64, encodePlan, fitWidth, MAX_WIDTH } from '../screenshots';

describe('screenshot sizing', () => {
  it('fits to 900 px wide, never upscales', () => {
    expect(fitWidth(1290, 2796)).toEqual({ width: 900, height: 1951 });
    expect(fitWidth(600, 800)).toEqual({ width: 600, height: 800 });
  });

  it('tries 70% first at full size, then lower quality, then smaller', () => {
    const plan = encodePlan(1290, 2796);
    expect(plan[0]).toEqual({ width: MAX_WIDTH, height: 1951, quality: 0.7 });
    expect(plan.map((p) => p.quality).slice(0, 4)).toEqual([0.7, 0.6, 0.5, 0.4]);
    expect(plan[4]!.width).toBe(675);
    expect(plan.every((p) => p.width <= MAX_WIDTH)).toBe(true);
  });

  it('base64 without a prefix', async () => {
    expect(await blobToBase64(new Blob([new Uint8Array([65, 66, 67])]))).toBe('QUJD');
  });
});
