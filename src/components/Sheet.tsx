import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useIsPresent, useReducedMotion, type PanInfo } from 'motion/react';
import { FADE, SHEET_SPRING } from './motion';
import { focusables, isTopSheet, pushSheet } from './sheetStack';
import styles from './Sheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  children: ReactNode;
  /** Tall content: the body scrolls inside the sheet and only the grabber drags it down. */
  scroll?: boolean;
};

/**
 * Bottom sheet (SPEC 10): springs up; pull down, tap the scrim or tap the grabber ("Close") to
 * close. A real modal dialog: focus moves in on open and back out on close, Tab stays inside, the
 * app behind is inert, and Escape closes only the top sheet.
 */
export function Sheet({ open, onClose, label, children, scroll = false }: Props) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetFrame key="sheet" onClose={onClose} label={label} scroll={scroll}>
          {children}
        </SheetFrame>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetFrame({ onClose, label, children, scroll }: Omit<Props, 'open'> & { scroll: boolean }) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  // While it slides away, a closing sheet is no longer a dialog and takes no taps.
  const present = useIsPresent();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Register as the top sheet, move focus in, and give it back as soon as it starts closing.
  useLayoutEffect(() => {
    if (!present) return;
    const root = rootRef.current!;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unregister = pushSheet(root);
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      unregister();
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

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 80 || info.velocity.y > 500) onClose();
  };

  return (
    <div className={styles.root} ref={rootRef} data-closing={!present || undefined} {...(present ? {} : { inert: '' })}>
      <motion.div
        className={styles.scrim}
        data-testid="sheet-scrim"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
      />
      <motion.div
        ref={dialogRef}
        role={present ? 'dialog' : undefined}
        aria-modal={present ? 'true' : undefined}
        aria-label={present ? label : undefined}
        tabIndex={-1}
        className={styles.sheet}
        data-scroll={scroll}
        onKeyDown={trapTab}
        initial={reduce ? { opacity: 0 } : { y: '100%' }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: '100%' }}
        transition={reduce ? FADE : SHEET_SPRING}
        drag={reduce ? false : 'y'}
        dragListener={!scroll}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
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
