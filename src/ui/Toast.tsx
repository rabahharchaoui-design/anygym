import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { FADE, SHEET_SPRING } from './motion';
import { Undo2 } from 'lucide-react';
import styles from './Toast.module.css';

/**
 * `subject`: a name the toast may shorten ("Barbell Back Squ…") so the toast stays on one line
 * with its action (Session 2 gate B2); `text` follows it and is never cut ("removed").
 */
export type ToastMessage = { id: number; text: string; subject?: string; /** Words before the subject, never cut: 'Removed ·'. */ lead?: string; action?: { label: string; onPress: () => void } };

/** An Undo toast stays put across screens; any other toast clears when the screen changes (gate B2). */
export const isUndoToast = (t: ToastMessage | null): boolean => t?.action?.label === UNDO;
/** Keep only an Undo toast: the setter for a screen change. */
export const keepUndoOnly = (t: ToastMessage | null): ToastMessage | null => (isUndoToast(t) ? t : null);

/** The one Undo toast (PLAN 2.2e): every screen's "done, with Undo" reads and looks the same. */
export const undoToast = (id: number, text: string, onUndo: () => void, subject?: string): ToastMessage => ({ id, text, ...(subject ? { subject } : {}), action: { label: UNDO, onPress: onUndo } });

const UNDO = 'Undo';

/**
 * SPEC 13.3: a toast that appears under a finger must not act on that same gesture. A tap on its
 * action in this long after it appears (a double tap on the button that made it) does nothing.
 */
export const TOAST_ARM_MS = 600;

type Props = { toast: ToastMessage | null; /** Extra space below, e.g. above a bottom bar. */ bottom?: string };

/**
 * One short message at the bottom (SPEC 13.1), with an optional action like Undo. One spot on every
 * screen, just above its bottom pill or tab bar (`bottom`), on an opaque surface so it never reads
 * through over a row (SPEC 23, gate B2), always one line.
 */
export function Toast({ toast, bottom = '0px' }: Props) {
  const reduce = useReducedMotion();
  return (
    <div className={styles.anchor} style={{ ['--toast-bottom' as string]: bottom }} aria-live="polite" data-toast-anchor>
      <AnimatePresence>
        {toast && (
          <ToastCard key={toast.id} toast={toast} reduce={!!reduce} />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One toast. While it slides away it is gone for taps and for screen readers (inert): a new toast can
 * be on screen at the same moment, and only that one's Undo may be tapped.
 */
function ToastCard({ toast, reduce }: { toast: ToastMessage; reduce: boolean }) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  const shownAt = useRef(performance.now());
  const press = () => {
    if (performance.now() - shownAt.current < TOAST_ARM_MS) return;
    toast.action?.onPress();
  };
  useEffect(() => {
    if (!present) ref.current?.setAttribute('inert', '');
  }, [present]);
  return (
    <motion.div
      ref={ref}
      aria-hidden={present ? undefined : true}
      data-leaving={present ? undefined : ''}
      style={present ? undefined : { pointerEvents: 'none' }}
      role="status"
      className={styles.toast}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: 0.15 } }}
      transition={reduce ? FADE : SHEET_SPRING}
    >
      <span className={styles.text} data-testid="toast-text">
        {toast.lead && <span className={styles.lead}>{toast.lead}</span>}
        {toast.lead && ' '}
        {toast.subject && <span className={styles.subject}>{toast.subject}</span>}
        {toast.subject && toast.text && ' '}
        {toast.text && <span className={styles.rest}>{toast.text}</span>}
      </span>
      {toast.action && (
        <button type="button" className={`${styles.action} pressable`} onClick={press} data-undo={toast.action.label === UNDO || undefined}>
          {toast.action.label === UNDO && <Undo2 className={styles.actionIcon} width={16} height={16} strokeWidth={2.4} aria-hidden="true" />}
          {toast.action.label}
        </button>
      )}
    </motion.div>
  );
}
