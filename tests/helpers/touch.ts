// Real touch events for the swipe deck (PLAN 3.5v). WebKit has no CDP, and Playwright's touchscreen
// only taps, so a finger's drag is built from the page's own Touch and TouchEvent objects: a
// touchstart on the element under the finger, touchmoves at a finger's pace, then a touchend. No
// mouse or pointer events are sent: only the touch stream moves the card.
import { expect, type Locator, type Page } from '../fixtures';

type Path = { x: number; y: number; dx: number; steps: number; stepMs: number; holdMs: number };
const MARK = 'data-touch-target';

// Chromium (the Android phones) takes real input through CDP: the browser itself makes the touch
// stream, the pointer events, touch-action and pointercancel, as Android Chrome does.
async function cdpGesture(page: Page, p: Path) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
  try {
    if (p.steps > 0 && p.stepMs < 20) {
      // A flick is quicker than the browser's frame rate (a headless frame can take 50 ms or more, and
      // each touch waits for the page to answer the one before): all of it is sent at once, so the page
      // sees it as one quick stroke, as a real finger's is.
      const all = [send('touchStart', p.x, p.y)];
      for (let i = 1; i <= p.steps; i++) all.push(send('touchMove', p.x + (p.dx * i) / p.steps, p.y + 1));
      all.push(send('touchEnd', p.x + p.dx, p.y + 1));
      await Promise.all(all);
      return;
    }
    await send('touchStart', p.x, p.y);
    if (p.holdMs) await page.waitForTimeout(p.holdMs);
    for (let i = 1; i <= p.steps; i++) {
      await page.waitForTimeout(p.stepMs);
      await send('touchMove', p.x + (p.dx * i) / p.steps, p.y + 1);
    }
    await send('touchEnd', p.x + p.dx, p.y + 1);
  } finally {
    await cdp.detach();
  }
}

async function gesture(page: Page, target: Locator, path: Path) {
  await target.evaluate((el, mark) => el.setAttribute(mark, ''), MARK);
  if (page.context().browser()?.browserType().name() === 'chromium') {
    // The finger lands on whatever is really there: something covering the card fails the test.
    const hit = await page.evaluate(([x, y, mark]) => {
      const el = document.elementFromPoint(x as number, y as number);
      const mine = document.querySelector(`[${mark}]`);
      mine?.removeAttribute(mark as string);
      return !!el && !!mine?.contains(el) ? '' : `${el?.tagName} ${el?.className}`;
    }, [path.x, path.y, MARK] as const);
    if (hit) throw new Error(`the finger is not on the card: ${hit}`);
    return cdpGesture(page, path);
  }
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
  // A card still arriving (springing in) is not where the finger would land: wait until it stands still.
  let box = (await target.boundingBox())!;
  await expect
    .poll(async () => {
      const was = box;
      box = (await target.boundingBox())!;
      return box.x === was.x && box.y === was.y && box.width === was.width && box.height === was.height;
    })
    .toBe(true);
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
