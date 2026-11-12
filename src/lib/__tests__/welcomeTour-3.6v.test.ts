import { describe, expect, it } from 'vitest';
import { fitTarget } from '../welcomeTour';

// PLAN 3.6v: on a short screen the day card is lit down to Start, so the light and the words fit whole.
describe('fitTarget', () => {
  const card = { x: 16, y: 100, width: 288, height: 390 };
  it('keeps the whole element when it and the words fit', () => {
    expect(fitTarget(card, 300, 600, 150)).toEqual(card);
  });
  it('lights down to the key part when they do not', () => {
    expect(fitTarget(card, 300, 468, 150)).toEqual({ ...card, height: 200 });
  });
  it('keeps the whole element when it has no key part', () => {
    expect(fitTarget(card, null, 100, 150)).toEqual(card);
  });
  it('never grows past the element nor below zero', () => {
    expect(fitTarget(card, 900, 100, 150).height).toBe(390);
    expect(fitTarget(card, 50, 100, 150).height).toBe(0);
  });
});
