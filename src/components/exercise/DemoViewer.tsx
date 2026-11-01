import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type PanInfo } from 'motion/react';
import { FADE, SHEET_SPRING } from '../../ui/motion';
import { isTopSheet, pushSheet } from '../../ui/sheetStack';
import { sheetHistory } from '../../ui/sheetHistory';
import { XIcon } from '../../ui/icons';
import type { DemoImages } from '../../lib/exerciseInfo';
import { FormDemo } from './FormDemo';
import styles from './DemoViewer.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  demo: DemoImages;
  /** "Form details": the exercise sheet (watch out, good for), when the caller has one. */
  onDetails?: () => void;
};

/**
 * The full screen form demo (PLAN 2.2b): a dark backdrop, the photos uncropped at full width, the
 * crossfade running. Closes with the button, a tap anywhere, a swipe down, Escape or Back.
 */
export function DemoViewer({ open, ...rest }: Props) {
  return createPortal(<AnimatePresence>{open && <Frame key="viewer" {...rest} />}</AnimatePresence>, document.body);
}

const SWIPE_CLOSE = 90;
const FLICK = 700;

function Frame({ onClose, name, demo, onDetails }: Omit<Props, 'open'>) {
  const reduce = useReducedMotion();
  const present = useIsPresent();
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!present) return;
    const root = rootRef.current!;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unregister = pushSheet(root);
    const release = sheetHistory().open(() => closeRef.current());
    root.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
    return () => {
      unregister();
      release();
      if (before?.isConnected && !before.closest('[inert]')) before.focus({ preventScroll: true });
    };
  }, [present]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !rootRef.current || !isTopSheet(rootRef.current)) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > SWIPE_CLOSE || info.velocity.y > FLICK) onClose();
  };

  return (
    <motion.div
      ref={rootRef}
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-label={`${name}, demo`}
      data-testid="demo-viewer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: FADE }}
      transition={reduce ? FADE : { duration: 0.2 }}
      style={{ pointerEvents: present ? undefined : 'none' }}
      onClick={onClose}
    >
      <motion.div
        className={styles.stage}
        drag={reduce ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.05, bottom: 0.9 }}
        dragSnapToOrigin
        onDragEnd={onDragEnd}
        initial={reduce ? false : { scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={reduce ? undefined : { scale: 0.96, y: 24 }}
        transition={SHEET_SPRING}
      >
        <FormDemo demo={demo} name={name} hero />
      </motion.div>
      <p className={styles.title}>{name}</p>
      <button type="button" className={`${styles.close} pressable`} data-close onClick={onClose} aria-label="Close demo">
        <XIcon width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {onDetails && (
        <button
          type="button"
          className={`${styles.details} pressable`}
          onClick={(e) => {
            e.stopPropagation();
            onDetails();
          }}
        >
          Form details
        </button>
      )}
    </motion.div>
  );
}
