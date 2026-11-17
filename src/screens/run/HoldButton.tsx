import type { ReactNode } from 'react';
import { useHold } from '../../hooks/useHold';
import { tick } from '../../ui/haptics';
import styles from './LiveControls.module.css';

type Props = {
  /** What it does, said whole: "Hold to end the run". */
  label: string;
  /** The word under the button. */
  caption: string;
  tone: 'end' | 'unlock';
  /** Big: the only control on a locked screen. */
  big?: boolean;
  onDone: () => void;
  testId: string;
  children: ReactNode;
};

const R = 46;
const C = 2 * Math.PI * R;

/**
 * A round button that acts only after a full one second hold (SPEC 12.2). A ring fills around it
 * while the finger is down and empties when it lifts early: the ring is the whole explanation.
 */
export function HoldButton({ label, caption, tone, big = false, onDone, testId, children }: Props) {
  const { fraction, holding, bind } = useHold(() => {
    tick();
    onDone();
  });
  return (
    <div className={styles.control}>
      <button type="button" className={styles.hold} data-tone={tone} data-big={big || undefined} data-holding={holding || undefined} data-fraction={fraction.toFixed(2)} aria-label={label} data-testid={testId} {...bind}>
        <svg className={styles.holdRing} viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className={styles.holdTrack} />
          <circle cx="50" cy="50" r={R} className={styles.holdFill} strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} transform="rotate(-90 50 50)" />
        </svg>
        <span className={styles.holdFace}>{children}</span>
      </button>
      <span className={styles.caption}>{caption}</span>
    </div>
  );
}
