import { eatNextClick } from './eatNextClick';
import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { animate } from 'motion/react';
import { tick } from '../../ui/haptics';
import styles from './Deck.module.css';

// The swipe deck (PLAN 3.5a, SPEC 20.3; shared since 3.5e: Quick workout's curate deck and the owner
// review queue): one card per item, our own card design. The card tilts with the finger, flies off
// past a threshold (or on a flick), and springs back below it. The cue is a glow growing on the side
// the card moves toward, with a chip (the card face draws both, DeckCues). The drag writes the card's
// transform directly, one write per frame, transform and opacity only (60 fps on WebKit); the spring
// back keeps the finger's velocity. With onNever, a hold of the card scales it to 0.97 and fills a
// ring, then onNever. Reduced motion: no tilt or fly, a fade. Right is 'keep', left is 'swap'.

/** Share of the card's width past which a release decides (or a flick, FLICK px per ms). */
const DECIDE_SHARE = 0.32;
const FLICK = 0.55;
/** PLAN 3.5i, a `light` deck: a light flick decides, by its speed alone (hardly any distance). */
const LIGHT_FLICK = 0.3;
const LIGHT_TRAVEL = 10;
/** Movement before a press counts as a drag (and stops being a long press). */
const SLOP = 8;
/** The hold shows itself after HOLD_SHOW_MS, and decides at LONG_PRESS_MS. */
const HOLD_SHOW_MS = 140;
export const LONG_PRESS_MS = 620;
/** Degrees of tilt at one card width. */
const TILT = 12;
const SPRING = { type: 'spring' as const, stiffness: 520, damping: 34 };
const FLY = { type: 'tween' as const, duration: 0.22, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] };

export type Decision = 'keep' | 'swap';

export type DeckProps<T extends { id: string }> = {
  items: readonly T[];
  index: number;
  /** Left swipe has something to do (else the card shakes and onNothingToSwap says why). */
  canSwap: boolean;
  reduced: boolean;
  onDecide: (d: Decision) => void;
  /** A decision's flight starts (the screen fades its buttons when the last card goes). */
  onFlyStart?: (d: Decision) => void;
  /** A long press: no hold ring without it. */
  onNever?: () => void;
  onNothingToSwap: () => void;
  /** Bumped by the buttons under the deck: the card flies as if swiped. */
  fling: { kind: Decision; n: number } | null;
  /** The card's face (the top one gets `action`, a button in its words). */
  renderCard: (item: T, at: { position: number; of: number; under: boolean }) => ReactNode;
  /** The top card's accessible name. */
  label: (item: T) => string;
  /** The hold ring's word ("Never show"). */
  holdWord?: string;
  /** PLAN 3.5i: a light flick decides (velocity, not distance), the card takes the full height, and (3.5v) the card underneath comes up as it is, no arrival fade. */
  light?: boolean;
  /**
   * 3.5f round 3 (B3): the card a left puts in, drawn under the top card while it is dragged left (the
   * next card shows under a right drag). Left out: the next card shows either way (Replace, where a
   * left is "Next"). With canSwap false a left drag meets resistance over "Nothing else to swap".
   */
  swapIn?: T | null;
};

type Drag = { src: 'pointer' | 'touch'; id: number; x: number; y: number; axis: 'x' | 'y' | null; dx: number; shown: number; lastX: number; lastT: number; v: number };

/** Round 3 (B3): a left drag with nothing to swap in gives way less and less (at most RESIST px). */
const RESIST = 44;
const resist = (dx: number) => -RESIST * (1 - Math.exp(dx / 120));

export function SwipeDeck<T extends { id: string }>({ items, index, canSwap, reduced, onDecide, onFlyStart, onNever, onNothingToSwap, fling, renderCard, label, holdWord, light, swapIn }: DeckProps<T>) {
  const topRef = useRef<HTMLElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef(0);
  const showHold = useRef(0);
  const busy = useRef(false);
  const swallow = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const top = items[index];
  const next = items[index + 1];
  /** What shows under a left drag: the move a left puts in, the next card, or nothing to swap. */
  const leftUnder: T | null = !canSwap ? null : swapIn === undefined ? (next ?? null) : swapIn;
  const split = !canSwap || swapIn !== undefined;
  const unders = () => Array.from(deckRef.current?.querySelectorAll<HTMLElement>('[data-under]') ?? []);

  const width = () => topRef.current?.offsetWidth || 320;

  /** One write per frame: the card's position and tilt, its cues, and the card under it. */
  const write = (x: number) => {
    const el = topRef.current;
    if (!el) return;
    const w = width();
    const p = Math.max(-1, Math.min(1, x / (w * DECIDE_SHARE)));
    el.style.transition = 'none';
    el.style.transform = reduced ? `translate3d(${x}px,0,0)` : `translate3d(${x}px,0,0) rotate(${(x / w) * TILT}deg)`;
    el.style.setProperty('--keep', String(Math.max(0, p)));
    el.style.setProperty('--swap', String(Math.max(0, -p)));
    // The chip is fully there by about 40 px, the glow keeps growing to the threshold.
    el.style.setProperty('--keep-chip', String(Math.min(1, Math.max(0, x) / 40)));
    el.style.setProperty('--swap-chip', String(Math.min(1, Math.max(0, -x) / 40)));
    if (Math.abs(x) > 2) el.dataset.dragging = '';
    else delete el.dataset.dragging;
    const deck = deckRef.current;
    if (deck) {
      const dir = x < -2 ? 'swap' : x > 2 ? 'keep' : '';
      if (deck.dataset.dir !== dir) deck.dataset.dir = dir;
    }
    if (!reduced) for (const under of unders()) under.style.transform = `translate3d(0,${10 - 10 * Math.min(1, Math.abs(p))}px,0) scale(${0.94 + 0.06 * Math.min(1, Math.abs(p))})`;
  };
  const schedule = (x: number) => {
    pending.current = x;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current !== null) write(pending.current);
      pending.current = null;
    });
  };

  const clearHold = () => {
    window.clearTimeout(press.current);
    window.clearTimeout(showHold.current);
    const el = topRef.current;
    if (el && el.dataset.holding !== undefined) {
      delete el.dataset.holding;
      el.style.transition = 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)';
      el.style.transform = '';
    }
  };

  // A new top card starts clean; one swapped in at the same place arrives from just behind.
  const shown = useRef<{ index: number; id: string } | null>(null);
  useLayoutEffect(() => {
    const el = topRef.current;
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.removeProperty('--keep');
      el.style.removeProperty('--swap');
      el.style.removeProperty('--keep-chip');
      el.style.removeProperty('--swap-chip');
      el.style.opacity = '';
      delete el.dataset.holding;
      delete el.dataset.dragging;
      const was = shown.current;
      if (!light && top && was && was.index === index && was.id !== top.id) {
        el.animate(
          reduced
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'translate3d(0,14px,0) scale(0.92)' },
                { opacity: 1, transform: 'none' },
              ],
          { duration: reduced ? 160 : 280, easing: reduced ? 'ease-out' : 'cubic-bezier(0.34, 1.36, 0.64, 1)' },
        );
      }
    }
    for (const under of unders()) under.style.transform = '';
    if (deckRef.current) deckRef.current.dataset.dir = '';
    shown.current = top ? { index, id: top.id } : null;
    busy.current = false;
  }, [top?.id, index, reduced, light]);

  useEffect(
    () => () => {
      stop.current?.();
      cancelAnimationFrame(frame.current);
      window.clearTimeout(press.current);
      window.clearTimeout(showHold.current);
    },
    [],
  );

  const springBack = (from: number, v: number) => {
    stop.current?.();
    if (reduced) return write(0);
    const a = animate(from, 0, { ...SPRING, velocity: v * 1000, onUpdate: write });
    stop.current = () => a.stop();
  };

  /** Nothing else fits: a small shake, no movement with reduced motion (the Swap button says why). */
  const shake = () => {
    onNothingToSwap();
    const el = topRef.current;
    if (!el || reduced) return;
    stop.current?.();
    write(0);
    el.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-12px,0,0)' }, { transform: 'translate3d(9px,0,0)' }, { transform: 'translate3d(-5px,0,0)' }, { transform: 'translate3d(0,0,0)' }], {
      duration: 320,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    });
  };

  const fly = (kind: Decision, from: number) => {
    busy.current = true;
    stop.current?.();
    tick();
    onFlyStart?.(kind);
    const el = topRef.current;
    if (reduced || !el) {
      // Reduced motion: no movement, the card fades out (SPEC 23.3).
      const a = el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' });
      if (a) a.onfinish = () => onDecide(kind);
      else onDecide(kind);
      return;
    }
    const to = (kind === 'keep' ? 1 : -1) * (width() * 1.35 + 80);
    const a = animate(from, to, { ...FLY, onUpdate: write, onComplete: () => onDecide(kind) });
    stop.current = () => a.stop();
  };

  // Keep and Swap buttons: the same flight as a swipe. A tap while a card is still flying is
  // dropped, like every other one tap action (a double tap never decides two cards).
  const flung = useRef(fling?.n ?? 0);
  const canSwapRef = useRef(canSwap);
  canSwapRef.current = canSwap;
  useEffect(() => {
    if (!fling || fling.n === flung.current) return;
    flung.current = fling.n;
    if (busy.current || drag.current || !topRef.current) return;
    if (fling.kind === 'swap' && !canSwapRef.current) return shake();
    fly(fling.kind, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fling]);

  // One gesture, two ways in (PLAN 3.5v): pointer events (mouse, pen) and touch events (a finger; its touchstart takes over from its pointerdown).
  const begin = (src: Drag['src'], id: number, x: number, y: number, target: Element) => {
    if (busy.current || drag.current) return;
    // A new press: whatever the last drag or hold swallowed is over.
    swallow.current = false;
    if (target.closest('button')) return;
    stop.current?.();
    drag.current = { src, id, x, y, axis: null, dx: 0, shown: 0, lastX: x, lastT: performance.now(), v: 0 };
    clearHold();
    if (!onNever) return;
    // The hold shows itself: the card presses in and a ring fills (round 2, P9).
    showHold.current = window.setTimeout(() => {
      const el = topRef.current;
      if (!el || !drag.current || drag.current.axis) return;
      el.dataset.holding = '';
      if (!reduced) {
        el.style.transition = 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)';
        el.style.transform = 'scale(0.97)';
      }
    }, HOLD_SHOW_MS);
    press.current = window.setTimeout(() => {
      const d = drag.current;
      if (!d || d.axis) return;
      drag.current = null;
      swallow.current = true;
      clearHold();
      tick();
      eatNextClick();
      onNever?.();
    }, LONG_PRESS_MS);
  };

  const move = (d: Drag, x: number, y: number, capture?: () => void) => {
    const dx = x - d.x;
    const dy = y - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      clearHold();
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'y') {
        drag.current = null;
        return;
      }
      swallow.current = true;
      // Captured only once it is a drag, so a plain tap still reaches the button on the card.
      capture?.();
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = 0.7 * ((x - d.lastX) / dt) + 0.3 * d.v;
    d.lastX = x;
    d.lastT = now;
    d.dx = dx;
    d.shown = dx < 0 && !canSwap ? resist(dx) : dx;
    schedule(d.shown);
  };

  const finish = (d: Drag, cancelled: boolean) => {
    clearHold();
    drag.current = null;
    if (d.axis !== 'x') return;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    write(d.shown);
    const flick = Math.abs(d.v) > (light ? LIGHT_FLICK : FLICK) && Math.sign(d.v) === Math.sign(d.dx) && Math.abs(d.dx) > (light ? LIGHT_TRAVEL : 24);
    const past = Math.abs(d.dx) > width() * DECIDE_SHARE || flick;
    if (cancelled || !past) return springBack(d.shown, d.v);
    const kind: Decision = d.dx > 0 ? 'keep' : 'swap';
    if (kind === 'swap' && !canSwap) {
      springBack(d.shown, 0);
      return onNothingToSwap();
    }
    fly(kind, d.dx);
  };

  const pointerDrag = (e: ReactPointerEvent<HTMLElement>) => (drag.current?.src === 'pointer' && drag.current.id === e.pointerId ? drag.current : null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    begin('pointer', e.pointerId, e.clientX, e.clientY, e.target as Element);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = pointerDrag(e);
    if (d) move(d, e.clientX, e.clientY, () => e.currentTarget.setPointerCapture?.(e.pointerId));
  };
  const end = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = pointerDrag(e);
    if (d) finish(d, cancelled);
  };

  const touchOf = (e: ReactTouchEvent<HTMLElement>) => {
    const d = drag.current;
    return (d?.src === 'touch' && Array.from(e.changedTouches).find((t) => t.identifier === d.id)) || null;
  };
  const onTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const d = drag.current;
    // The same finger's pointerdown already began this gesture: the touch stream carries it on.
    if (d?.src === 'pointer' && !d.axis) {
      d.src = 'touch';
      d.id = t.identifier;
    } else begin('touch', t.identifier, t.clientX, t.clientY, e.target as Element);
  };
  const onTouchMove = (e: ReactTouchEvent<HTMLElement>) => {
    const t = touchOf(e);
    if (t && drag.current) move(drag.current, t.clientX, t.clientY);
  };
  const touchEnd = (e: ReactTouchEvent<HTMLElement>, cancelled: boolean) => {
    if (touchOf(e) && drag.current) finish(drag.current, cancelled);
  };

  if (!top) return null;
  return (
    <div className={styles.deckWrap}>
      <div ref={deckRef} className={styles.deck} data-testid="deck" data-tall={light || undefined} data-split={split || undefined}>
        {next && (
          <article key={`${index + 1}:${next.id}`} className={styles.card} data-under="" data-for={split ? 'keep' : undefined} data-testid="deck-under-keep" aria-hidden="true">
            {renderCard(next, { position: index + 2, of: items.length, under: true })}
          </article>
        )}
        {split &&
          (leftUnder ? (
            <article key={`swap:${index}:${leftUnder.id}`} className={styles.card} data-under="" data-for="swap" data-testid="deck-under-swap" data-exercise={leftUnder.id} aria-hidden="true">
              {renderCard(leftUnder, { position: index + 1, of: items.length, under: true })}
            </article>
          ) : (
            <div className={styles.ghost} data-under="" data-for="swap" data-testid="deck-under-none" aria-hidden="true">
              Nothing else to swap
            </div>
          ))}
        <article
          ref={topRef}
          key={`${index}:${top.id}`}
          className={styles.card}
          data-top=""
          data-reduced={reduced || undefined}
          data-testid="deck-card"
          data-exercise={top.id}
          aria-roledescription="card"
          aria-label={label(top)}
          style={{ ['--hold-ms' as string]: `${LONG_PRESS_MS - HOLD_SHOW_MS}ms` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => end(e, false)}
          onPointerCancel={(e) => end(e, true)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={(e) => touchEnd(e, false)}
          onTouchCancel={(e) => touchEnd(e, true)}
          onContextMenu={(e) => e.preventDefault()}
          onClickCapture={(e) => {
            if (swallow.current) {
              e.stopPropagation();
              e.preventDefault();
              swallow.current = false;
            }
          }}
        >
          {renderCard(top, { position: index + 1, of: items.length, under: false })}
          {onNever && (
            <span className={styles.hold} aria-hidden="true">
              <svg viewBox="0 0 64 64" width="64" height="64">
                <circle className={styles.holdTrack} cx="32" cy="32" r="27" />
                <circle className={styles.holdFill} cx="32" cy="32" r="27" pathLength="100" />
              </svg>
              <span className={styles.holdWord}>{holdWord ?? 'Never show'}</span>
            </span>
          )}
        </article>
      </div>
    </div>
  );
}
