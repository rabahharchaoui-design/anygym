import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Button } from '../../ui/Button';
import { FADE } from '../../ui/motion';
import styles from './Run.module.css';

type Props = {
  /** The run that was picked ("Distance · 5 km"), so it is plain what was started. */
  what: string;
  onStop: () => void;
};

/**
 * What the countdown lands on until PLAN 4.3 builds the live run screen. It says honestly that
 * nothing is being recorded; Stop goes back to the start screen and stores nothing.
 */
export function RunStarted({ what, onStop }: Props) {
  return createPortal(
    <motion.section className={styles.started} data-testid="run-started" role="dialog" aria-modal="true" aria-label="Run started" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE}>
      <div className={styles.startedBody}>
        <p className={styles.startedWhat}>{what}</p>
        <h2 className={styles.startedTitle}>Run started</h2>
        <p className={styles.startedLine}>The live run screen comes in the next update. This run is not being recorded.</p>
      </div>
      <Button variant="secondary" size="lg" onClick={onStop} data-testid="run-stop">
        Stop
      </Button>
    </motion.section>,
    document.body,
  );
}
