import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { animate } from 'motion/react';
import type { QuickItem } from '../../lib/quick';
import { setsText } from '../../lib/plans';
import { assetUrl, demoFor } from '../../data/exerciseInfo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { tick } from '../../ui/haptics';
import { CheckIcon, NeverIcon, SwapIcon } from '../../ui/icons';
import styles from './Quick.module.css';

// The curate deck (PLAN 3.5a, SPEC 20.3): one card per exercise. Our own card design: the card tilts
// with the finger, flies off past a threshold (or on a flick), and springs back below it. The drag
// writes the card's transform directly, one write per frame, transform and opacity only (60 fps on
// WebKit); the spring back keeps the finger's velocity. Reduced motion: no tilt or fly, a fade.

/** Share of the card's width past which a release decides (or a flick, FLICK px per ms). */
const DECIDE_SHARE = 0.32;
const FLICK = 0.55;
/** Movement before a press counts as a drag (and stops being a long press). */
const SLOP = 8;
const LONG_PRESS_MS = 520;
/** Degrees of tilt at one card width. */
const TILT = 14;
/** The spring back (stiffness and damping), and the fly off. */
const SPRING = { type: 'spring' as const, stiffness: 520, damping: 34 };
const FLY = { type: 'tween' as const, duration: 0.22, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] };

export type Decision = 'keep' | 'swap';

type Props = {
  items: readonly QuickItem[];
  index: number;
  /** Left swipe has something to put in (else the card springs back and the screen says so). */
  canSwap: boolean;
  reduced: boolean;
  onDecide: (d: Decision) => void;
  onNever: () => void;
  onNothingToSwap: () => void;
  /** Bumped by the Keep and Swap buttons: the card flies as if swiped. */
  fling: { kind: Decision; n: number } | null;
};

type Drag = { id: number; x: number; y: number; t: number; axis: 'x' | 'y' | null; dx: number; lastX: number; lastT: number; v: number };

const amount = (it: QuickItem) => setsText({ sets: it.sets, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) });

export const itemLine = (it: QuickItem): string => `${amount(it)}${it.reps !== undefined ? ' reps' : ''}${it.eachSide ? ' each side' : ''}`;

function Photo({ id }: { id: string }) {
  const demo = demoFor(id);
  const photos = useDemoPhotos(demo);
  const src = !demo ? null : photos.kind === 'net' ? assetUrl(demo.webp[0]!) : photos.kind === 'cache' ? photos.urls[0] : null;
  return (
    <div className={styles.photo} data-demo={demo ? '' : undefined}>
      {src ? <img src={src} alt="" decoding="async" draggable={false} /> : <span className={styles.photoOff}>Photo when you are back online</span>}
    </div>
  );
}

function Card({ item, position, of, under }: { item: QuickItem; position: number; of: number; under?: boolean }) {
  const swapped = item.id !== item.slot || item.why.startsWith('Swapped');
  return (
    <>
      <Photo id={item.id} />
      <span className={styles.stamp} data-stamp="keep" aria-hidden="true">
        Keep
      </span>
      <span className={styles.stamp} data-stamp="swap" aria-hidden="true">
        Swap
      </span>
      <div className={styles.cardBody}>
        <p className={`${styles.cardEyebrow} num`}>
          {position} of {of}
          {swapped && <span className={styles.swappedTag}>Swapped in</span>}
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

export function Deck({ items, index, canSwap, reduced, onDecide, onNever, onNothingToSwap, fling }: Props) {
  const topRef = useRef<HTMLElement>(null);
  const underRef = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef(0);
  const busy = useRef(false);
  const swallow = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const top = items[index];
  const next = items[index + 1];

  const width = () => topRef.current?.offsetWidth || 320;

  /** One write per frame: the card's position and tilt, its stamps, and the card under it. */
  const write = (x: number) => {
    const el = topRef.current;
    if (!el) return;
    const w = width();
    const p = Math.max(-1, Math.min(1, x / (w * DECIDE_SHARE)));
    el.style.transform = reduced ? `translate3d(${x}px,0,0)` : `translate3d(${x}px,0,0) rotate(${(x / w) * TILT}deg)`;
    el.style.setProperty('--keep', String(Math.max(0, p)));
    el.style.setProperty('--swap', String(Math.max(0, -p)));
    const under = underRef.current;
    if (under && !reduced) under.style.transform = `scale(${0.94 + 0.06 * Math.min(1, Math.abs(p))}) translate3d(0,${10 - 10 * Math.min(1, Math.abs(p))}px,0)`;
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

  // A new top card starts clean (the card under it already sits where it should, its spring finishing).
  // One swapped in at the same place arrives from just behind, like a card dealt onto the deck.
  const shown = useRef<{ index: number; id: string } | null>(null);
  useLayoutEffect(() => {
    const el = topRef.current;
    if (el) {
      el.style.transform = '';
      el.style.removeProperty('--keep');
      el.style.removeProperty('--swap');
      el.style.opacity = '';
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
    // A Keep or Swap tapped while the last card was still flying runs now, on this card.
    const q = queued.current;
    queued.current = null;
    if (q && top) requestAnimationFrame(() => runFling(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top?.id, index, reduced]);

  useEffect(
    () => () => {
      stop.current?.();
      cancelAnimationFrame(frame.current);
      window.clearTimeout(press.current);
    },
    [],
  );

  const springBack = (from: number, v: number) => {
    stop.current?.();
    if (reduced) return write(0);
    const a = animate(from, 0, { ...SPRING, velocity: v * 1000, onUpdate: write });
    stop.current = () => a.stop();
  };

  const fly = (kind: Decision, from: number, v: number) => {
    busy.current = true;
    stop.current?.();
    tick();
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
    void v;
    stop.current = () => a.stop();
  };

  // Keep and Swap buttons: the same flight as a swipe. Tapped again mid flight: it waits its turn.
  // A deck opened again starts with no pending fling (the last tap belonged to the deck before).
  const flung = useRef(fling?.n ?? 0);
  const queued = useRef<Decision | null>(null);
  const canSwapRef = useRef(canSwap);
  canSwapRef.current = canSwap;
  const runFling = (kind: Decision) => {
    if (busy.current) {
      queued.current = kind;
      return;
    }
    if (!topRef.current) return;
    if (kind === 'swap' && !canSwapRef.current) {
      onNothingToSwap();
      if (!reduced) {
        // A small no: the card nudges and springs home.
        write(-28);
        springBack(-28, 0);
      }
      return;
    }
    fly(kind, 0, 0);
  };
  useEffect(() => {
    if (!fling || fling.n === flung.current) return;
    flung.current = fling.n;
    runFling(fling.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fling]);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (busy.current || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stop.current?.();
    swallow.current = false;
    const now = performance.now();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now, axis: null, dx: 0, lastX: e.clientX, lastT: now, v: 0 };
    window.clearTimeout(press.current);
    press.current = window.setTimeout(() => {
      const d = drag.current;
      if (!d || d.axis) return;
      drag.current = null;
      swallow.current = true;
      busy.current = false;
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
      window.clearTimeout(press.current);
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'y') {
        drag.current = null;
        return;
      }
      swallow.current = true;
      // Captured only once it is a drag, so a plain tap still reaches the buttons on the card.
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
    window.clearTimeout(press.current);
    if (!d || e.pointerId !== d.id) return;
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
      onNothingToSwap();
      return springBack(d.dx, d.v);
    }
    fly(kind, d.dx, d.v);
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
        <Card item={top} position={index + 1} of={items.length} />
        <button type="button" className={`${styles.never} pressable`} aria-label="Never show me this" data-testid="deck-never" onClick={onNever}>
          <NeverIcon width={18} height={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </article>
    </div>
    </div>
  );
}

/** The two round buttons under the deck: Swap (left) and Keep (right), mirroring the swipe. */
export function DeckButtons({ onSwap, onKeep, disabled }: { onSwap: () => void; onKeep: () => void; disabled?: boolean }) {
  return (
    <div className={styles.deckButtons}>
      <button type="button" className={`${styles.round} pressable`} data-kind="swap" onClick={onSwap} disabled={disabled} data-testid="deck-swap">
        <SwapIcon width={22} height={22} strokeWidth={2.2} aria-hidden="true" />
        <span>Swap</span>
      </button>
      <button type="button" className={`${styles.round} pressable`} data-kind="keep" onClick={onKeep} disabled={disabled} data-testid="deck-keep">
        <CheckIcon width={22} height={22} strokeWidth={2.6} aria-hidden="true" />
        <span>Keep</span>
      </button>
    </div>
  );
}
