import { useEffect, useLayoutEffect, useState, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useIsPresent, useReducedMotion, type PanInfo } from 'motion/react';
import { FADE, SHEET_SPRING } from './motion';
import { focusables, isTopSheet, pushSheet } from './sheetStack';
import { sheetHistory } from './sheetHistory';
import styles from './Sheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  /** Tall content: the body scrolls inside the sheet and only the grabber drags it down. */
  scroll?: boolean;
  /** Pulled down to close: instead of onClose (the weight sheet keeps changed plates, like Done). */
  onDragClose?: () => void;
};

/**
 * Bottom sheet (SPEC 10): springs up; pull down, tap the scrim or tap the grabber ("Close") to
 * close. A real modal dialog: focus moves in on open and back out on close, Tab stays inside, the
 * app behind is inert, and Escape or the Back button closes only the top sheet.
 */
export function Sheet({ open, onClose, label, children, scroll = false, onDragClose }: Props) {
  // Every open is a new frame: reopened while the last one is still sliding away, it starts fresh
  // (its content never keeps the cancelled state of the closing one).
  const opens = useRef(0);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opens.current += 1;
  wasOpen.current = open;
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetFrame key={`sheet-${opens.current}`} onClose={onClose} onDragClose={onDragClose} label={label} scroll={scroll}>
          {children}
        </SheetFrame>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Share of the sheet's height a pull must pass to close it, else it springs back. */
const DISMISS_FRACTION = 0.35;
/** A downward flick this fast (px/s) closes it from anywhere. */
const FLICK_VELOCITY = 800;
// Ends once it is off screen: the last pixels of the settle are past the edge anyway, so a closed
// sheet never lingers in the DOM.
const SHEET_CLOSE = { ...SHEET_SPRING, bounce: 0, restDelta: 12, restSpeed: 120 };
/** Pixels past the screen edge a closed sheet goes, so its upward shadow is gone too. */
const SHADOW_CLEARANCE = 64;

/** Longest the entrance can take before the content takes taps anyway (the spring settles in ~240 ms). */
const SETTLE_FALLBACK_MS = 600;

function SheetFrame({ onClose, onDragClose, label, children, scroll }: Omit<Props, 'open'> & { scroll: boolean }) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  // While it slides away, a closing sheet is no longer a dialog and takes no taps.
  const present = useIsPresent();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Until the entrance settles, the content takes no taps (the sheet itself swallows them, so an
  // early tap never lands on a row that is still moving, nor falls through to the scrim).
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), SETTLE_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Register as the top sheet, move focus in, and give it back as soon as it starts closing.
  useLayoutEffect(() => {
    if (!present) return;
    const root = rootRef.current!;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unregister = pushSheet(root);
    // Its own history entry: Back closes this sheet, not the screen (SPEC 13.4).
    const release = sheetHistory().open(() => closeRef.current());
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      unregister();
      release();
      if (before?.isConnected && !before.closest('[inert]')) before.focus({ preventScroll: true });
    };
  }, [present]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !rootRef.current || !isTopSheet(rootRef.current)) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tab and Shift+Tab cycle inside the sheet. Focus is moved by hand, so it never leaves the
  // sheet, whatever the browser counts as tabbable.
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    e.preventDefault();
    const list = focusables(dialogRef.current);
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (e.shiftKey ? list.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + list.length) % list.length;
    list[next]!.focus();
  };

  // Pulled down past 35% of its height, or flicked down fast: it closes. Anything less springs back.
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = dialogRef.current?.offsetHeight ?? 0;
    if (info.offset.y > h * DISMISS_FRACTION || (info.velocity.y > FLICK_VELOCITY && info.offset.y > 0)) (onDragClose ?? onClose)();
  };

  return (
    <div className={styles.root} ref={rootRef} data-closing={!present || undefined} {...(present ? {} : { inert: '' })}>
      <motion.div className={styles.scrim} data-testid={present ? 'sheet-scrim' : undefined} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} />
      <motion.div
        ref={dialogRef}
        role={present ? 'dialog' : undefined}
        aria-modal={present ? 'true' : undefined}
        aria-label={present ? label : undefined}
        tabIndex={-1}
        className={styles.sheet}
        data-scroll={scroll}
        data-state={settled ? 'open' : 'opening'}
        onAnimationComplete={() => setSettled(true)}
        onKeyDown={trapTab}
        initial={reduce ? { opacity: 0 } : { y: '100%' }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        // Closing uses the opening spring without its overshoot, and goes far enough that the shadow
        // above the sheet never lingers as a strip at the bottom edge.
        exit={reduce ? { opacity: 0 } : { y: (dialogRef.current?.offsetHeight ?? 800) + SHADOW_CLEARANCE, transition: SHEET_CLOSE }}
        transition={reduce ? FADE : SHEET_SPRING}
        drag={reduce ? false : 'y'}
        dragListener={!scroll}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 32 }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
      >
        {scroll ? <div className={styles.scrollBody}>{children}</div> : children}
        {/* The grabber doubles as the labelled Close button: no extra chrome, no layout change. Last in
            the DOM (and the Tab order), drawn first (CSS order), its hit area reaching up over the scrim. */}
        <button
          type="button"
          className={styles.grabberZone}
          aria-label="Close"
          onPointerDown={(e) => {
            dragged.current = false;
            if (scroll && !reduce) controls.start(e);
          }}
          onClick={() => {
            if (dragged.current) return;
            onClose();
          }}
        >
          <span className={styles.grabber} />
        </button>
      </motion.div>
    </div>
  );
}
