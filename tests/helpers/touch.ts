// Real touch events for the swipe deck (PLAN 3.5v). WebKit has no CDP, and Playwright's touchscreen
// only taps, so a finger's drag is built from the page's own Touch and TouchEvent objects: a
// touchstart on the element under the finger, touchmoves at a finger's pace, then a touchend. No
// mouse or pointer events are sent: only the touch stream moves the card.
import { expect, type Locator, type Page } from '../fixtures';

type Path = { x: number; y: number; dx: number; steps: number; stepMs: number; holdMs: number };
const MARK = 'data-touch-target';

async function gesture(page: Page, target: Locator, path: Path) {
  await target.evaluate((el, mark) => el.setAttribute(mark, ''), MARK);
  await page.evaluate(async ([p, mark]) => {
    // The finger lands on whatever is really there: something covering the card fails the test.
    const el = document.elementFromPoint(p.x, p.y);
    const mine = document.querySelector(`[${mark}]`);
    mine?.removeAttribute(mark);
    if (!el || !mine?.contains(el)) throw new Error(`the finger is not on the card: ${el?.tagName} ${el?.className}`);
    // WebKit builds a Touch only through document.createTouch (its Touch constructor is closed).
    type Legacy = { createTouch(view: Window, target: EventTarget, id: number, pageX: number, pageY: number, screenX: number, screenY: number): Touch; createTouchList(...touches: Touch[]): TouchList };
    const doc = document as unknown as Legacy;
    const touch = (x: number, y: number) => doc.createTouch(window, el, 7, x + scrollX, y + scrollY, x, y);
    const fire = (type: string, t: Touch, down: boolean) => {
      const live = down ? doc.createTouchList(t) : doc.createTouchList();
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: live as unknown as Touch[], targetTouches: live as unknown as Touch[], changedTouches: doc.createTouchList(t) as unknown as Touch[] }));
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    fire('touchstart', touch(p.x, p.y), true);
    if (p.holdMs) await wait(p.holdMs);
    for (let i = 1; i <= p.steps; i++) {
      await wait(p.stepMs);
      fire('touchmove', touch(p.x + (p.dx * i) / p.steps, p.y + 1), true);
    }
    fire('touchend', touch(p.x + p.dx, p.y + 1), false);
  }, [path, MARK] as const);
}

async function middle(target: Locator) {
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height * 0.35) };
}

/** A finger's flick across the card: `dx` px (right is positive) in a few quick touchmoves. */
export async function touchFlick(page: Page, target: Locator, dx: number) {
  await gesture(page, target, { ...(await middle(target)), dx, steps: 4, stepMs: 12, holdMs: 0 });
}

/** A slow drag of `dx` px (about 25 px a step every 30 ms): distance decides, not speed. */
export async function touchDrag(page: Page, target: Locator, dx: number) {
  await gesture(page, target, { ...(await middle(target)), dx, steps: Math.max(4, Math.round(Math.abs(dx) / 8)), stepMs: 30, holdMs: 0 });
}

/** A finger held still on the card. */
export async function touchHold(page: Page, target: Locator, ms = 750) {
  await gesture(page, target, { ...(await middle(target)), dx: 0, steps: 0, stepMs: 0, holdMs: ms });
}
