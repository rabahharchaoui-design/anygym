import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { animate } from 'motion/react';
import type { QuickItem } from '../../lib/quick';
import { setsText } from '../../lib/plans';
import { assetUrl, demoFor } from '../../data/exerciseInfo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { tick } from '../../ui/haptics';
import { CheckIcon, NeverIcon, SwapIcon } from '../../ui/icons';
import styles from './Quick.module.css';

// The curate deck (PLAN 3.5a, SPEC 20.3): one card per exercise, our own card design. The card tilts
// with the finger, flies off past a threshold (or on a flick), and springs back below it. The cue is
// a glow growing on the side the card moves toward, with a ✓ (keep) or ⇄ (swap) chip. The drag
// writes the card's transform directly, one write per frame, transform and opacity only (60 fps on
// WebKit); the spring back keeps the finger's velocity. A hold of the card scales it to 0.97 and
// fills a ring, then "Never show". Reduced motion: no tilt or fly, a fade.

/** Share of the card's width past which a release decides (or a flick, FLICK px per ms). */
const DECIDE_SHARE = 0.32;
const FLICK = 0.55;
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

type Props = {
  items: readonly QuickItem[];
  index: number;
  /** Left swipe has something to put in (else the card shakes and Swap says so). */
  canSwap: boolean;
  reduced: boolean;
  onDecide: (d: Decision) => void;
  /** A decision's flight starts (the screen fades its buttons when the last card goes). */
  onFlyStart?: (d: Decision) => void;
  onNever: () => void;
  onNothingToSwap: () => void;
  /** Bumped by the Keep and Swap buttons: the card flies as if swiped. */
  fling: { kind: Decision; n: number } | null;
};

type Drag = { id: number; x: number; y: number; axis: 'x' | 'y' | null; dx: number; lastX: number; lastT: number; v: number };

const amount = (it: QuickItem) => setsText({ sets: it.sets, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) });

export const itemLine = (it: QuickItem): string => `${amount(it)}${it.reps !== undefined ? ' reps' : ''}${it.eachSide ? ' each side' : ''}`;

/** The whole demo photo, never cropped: a head or the dumbbell over it is never cut off (round 2, P12). */
function Photo({ id }: { id: string }) {
  const demo = demoFor(id);
  const photos = useDemoPhotos(demo);
  const src = !demo ? null : photos.kind === 'net' ? assetUrl(demo.webp[0]!) : photos.kind === 'cache' ? photos.urls[0] : null;
  return (
    <div className={styles.photo} data-demo={demo ? '' : undefined}>
      {src ? (
        <>
          {/* Round 3 (P5): the same photo, soft and dim, fills the box: no dark bands, nothing cropped. */}
          <img className={styles.photoFill} src={src} alt="" decoding="async" draggable={false} aria-hidden="true" />
          <img className={styles.photoMain} src={src} alt="" decoding="async" draggable={false} />
        </>
      ) : (
        <span className={styles.photoOff}>Photo when you are back online</span>
      )}
    </div>
  );
}

function Card({ item, position, of, under, action }: { item: QuickItem; position: number; of: number; under?: boolean; action?: ReactNode }) {
  // 3.5b round 4 (M10): only a swap the person made; a plan move the gym changed says why on its line.
  const swapped = item.swapped === true;
  return (
    <>
      <Photo id={item.id} />
      <span className={styles.edge} data-side="keep" aria-hidden="true" />
      <span className={styles.edge} data-side="swap" aria-hidden="true" />
      {/* Round 3 (P4): the chip sits toward the screen's centre, so it stays in view as the card leaves. */}
      <span className={styles.cue} data-side="keep" aria-hidden="true">
        <CheckIcon width={26} height={26} strokeWidth={3} />
      </span>
      <span className={styles.cue} data-side="swap" aria-hidden="true">
        <SwapIcon width={24} height={24} strokeWidth={2.4} />
      </span>
      <div className={styles.cardBody}>
        <p className={`${styles.cardEyebrow} num`}>
          {position} of {of}
          {swapped && <span className={styles.swappedTag}>Swapped in</span>}
          {action}
        </p>
        <h2 className={styles.cardName} data-testid={under ? undefined : 'deck-name'}>
          {item.name}
        </h2>
        <p className={`${styles.cardSets} num`} data-testid={under ? undefined : 'deck-sets'}>
          {itemLine(item)}
        </p>
        <p className={styles.cardWhy}>{item.why}</p>
      </div>
    </>
  );
}

export function Deck({ items, index, canSwap, reduced, onDecide, onFlyStart, onNever, onNothingToSwap, fling }: Props) {
  const topRef = useRef<HTMLElement>(null);
  const underRef = useRef<HTMLElement>(null);
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
    const under = underRef.current;
    if (under && !reduced) under.style.transform = `translate3d(0,${10 - 10 * Math.min(1, Math.abs(p))}px,0) scale(${0.94 + 0.06 * Math.min(1, Math.abs(p))})`;
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
      if (top && was && was.index === index && was.id !== top.id) {
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
    if (underRef.current) underRef.current.style.transform = '';
    shown.current = top ? { index, id: top.id } : null;
    busy.current = false;
  }, [top?.id, index, reduced]);

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

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (busy.current || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // A new press: whatever the last drag or hold swallowed is over.
    swallow.current = false;
    if ((e.target as Element).closest('button')) return;
    stop.current?.();
    const now = performance.now();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, dx: 0, lastX: e.clientX, lastT: now, v: 0 };
    clearHold();
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
      onNever();
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
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
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = 0.7 * ((e.clientX - d.lastX) / dt) + 0.3 * d.v;
    d.lastX = e.clientX;
    d.lastT = now;
    d.dx = dx;
    schedule(dx);
  };

  const end = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    clearHold();
    drag.current = null;
    if (d.axis !== 'x') return;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    write(d.dx);
    const past = Math.abs(d.dx) > width() * DECIDE_SHARE || (Math.abs(d.v) > FLICK && Math.sign(d.v) === Math.sign(d.dx) && Math.abs(d.dx) > 24);
    if (cancelled || !past) return springBack(d.dx, d.v);
    const kind: Decision = d.dx > 0 ? 'keep' : 'swap';
    if (kind === 'swap' && !canSwap) {
      springBack(d.dx, d.v);
      return onNothingToSwap();
    }
    fly(kind, d.dx);
  };

  if (!top) return null;
  return (
    <div className={styles.deckWrap}>
      <div className={styles.deck} data-testid="deck">
        {next && (
          <article ref={underRef} key={`${index + 1}:${next.id}`} className={styles.card} data-under="" aria-hidden="true">
            <Card item={next} position={index + 2} of={items.length} under />
          </article>
        )}
        <article
          ref={topRef}
          key={`${index}:${top.id}`}
          className={styles.card}
          data-top=""
          data-reduced={reduced || undefined}
          data-testid="deck-card"
          data-exercise={top.id}
          aria-roledescription="card"
          aria-label={`${top.name}. ${itemLine(top)}. ${top.why}`}
          style={{ ['--hold-ms' as string]: `${LONG_PRESS_MS - HOLD_SHOW_MS}ms` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => end(e, false)}
          onPointerCancel={(e) => end(e, true)}
          onContextMenu={(e) => e.preventDefault()}
          onClickCapture={(e) => {
            if (swallow.current) {
              e.stopPropagation();
              e.preventDefault();
              swallow.current = false;
            }
          }}
        >
          <Card
            item={top}
            position={index + 1}
            of={items.length}
            action={
              // In the words, never over the photo (round 2, P12): the figure is never covered.
              <button type="button" className={`${styles.never} pressable`} aria-label="Never show me this" data-testid="deck-never" onClick={onNever}>
                <NeverIcon width={18} height={18} strokeWidth={2} aria-hidden="true" />
                <span>Never show</span>
              </button>
            }
          />
          <span className={styles.hold} aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle className={styles.holdTrack} cx="32" cy="32" r="27" />
              <circle className={styles.holdFill} cx="32" cy="32" r="27" pathLength="100" />
            </svg>
            <span className={styles.holdWord}>Never show</span>
          </span>
        </article>
      </div>
    </div>
  );
}

/** The two buttons under the deck: Swap (glass, left) and Keep (lime, right), mirroring the swipe. */
export function DeckButtons({ onSwap, onKeep, swapNote, leaving }: { onSwap: () => void; onKeep: () => void; swapNote?: string | null; leaving?: boolean }) {
  return (
    <div className={styles.deckButtons} data-leaving={leaving || undefined}>
      <button type="button" className={`${styles.round} pressable`} data-kind="swap" data-note={swapNote ? '' : undefined} onClick={onSwap} data-testid="deck-swap">
        <SwapIcon width={20} height={20} strokeWidth={2.2} aria-hidden="true" />
        {/* Nothing else fits: the button itself says so for a moment (round 2, B2), no toast. */}
        <span aria-live="polite" data-testid="swap-label">
          {swapNote ?? 'Swap'}
        </span>
      </button>
      <button type="button" className={`${styles.round} pressable`} data-kind="keep" onClick={onKeep} data-testid="deck-keep">
        <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />
        <span>Keep</span>
      </button>
    </div>
  );
}
