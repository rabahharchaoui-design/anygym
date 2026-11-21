import type { ReactNode } from 'react';
import { useHold } from '../../hooks/useHold';
import { tick } from '../../ui/haptics';
import styles from './LiveControls.module.css';

type Props = {
  /** What it does, said whole: "Hold to end the run". */
  label: string;
  /** The words on it. */
  caption: string;
  /** Big: the only control on a locked screen. */
  big?: boolean;
  onDone: () => void;
  testId: string;
  /** A small mark before the words. */
  children?: ReactNode;
};

/**
 * Words that act only after a full one second hold (SPEC 12.2, style sheet "Hold to end"): small
 * words over a 3 px track that fills ice from the left while the finger is down and empties when it
 * lifts early. The filling track is the whole explanation.
 */
export function HoldButton({ label, caption, big = false, onDone, testId, children }: Props) {
  const { fraction, holding, bind } = useHold(() => {
    tick();
    onDone();
  });
  return (
    <button type="button" className={styles.hold} data-big={big || undefined} data-holding={holding || undefined} data-fraction={fraction.toFixed(2)} aria-label={label} data-testid={testId} {...bind}>
      <span className={styles.holdWords}>
        {children}
        {caption}
      </span>
      <span className={styles.holdTrack} aria-hidden="true">
        <span className={styles.holdFill} style={{ transform: `scaleX(${fraction})` }} />
      </span>
    </button>
  );
}
