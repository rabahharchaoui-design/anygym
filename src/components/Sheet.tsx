import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { FADE, SHEET_SPRING } from './motion';
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

/** Bottom sheet (SPEC 10): springs up, pull down or tap the scrim to close. */
export function Sheet({ open, onClose, label, children, scroll = false }: Props) {
  const reduce = useReducedMotion();
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 80 || info.velocity.y > 500) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={styles.root} key="sheet">
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
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={styles.sheet}
            data-scroll={scroll}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={reduce ? FADE : SHEET_SPRING}
            drag={reduce ? false : 'y'}
            dragListener={!scroll}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div
              className={styles.grabberZone}
              aria-hidden="true"
              onPointerDown={scroll && !reduce ? (e) => controls.start(e) : undefined}
            >
              <div className={styles.grabber} />
            </div>
            {scroll ? <div className={styles.scrollBody}>{children}</div> : children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
