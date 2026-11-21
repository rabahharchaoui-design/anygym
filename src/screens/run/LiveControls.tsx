import { LockIcon } from '../../ui/icons';
import { useTapGuard } from '../../hooks/useTapGuard';
import { Button } from '../../ui/Button';
import { tick } from '../../ui/haptics';
import { HoldButton } from './HoldButton';
import styles from './LiveControls.module.css';

type Props = {
  /** Paused by hand: the big words resume. */
  paused: boolean;
  locked: boolean;
  onPause: () => void;
  onResume: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onEnd: () => void;
};

/**
 * The foot of the live run (SPEC 12.2, PLAN M2, board 06): "Pause" (or "Resume") as the biggest
 * words over the ice line, full width; under it "Hold to end" as small words over a track that fills
 * while held, and "Lock" as a word on the right. Each keeps its place for the whole run. A locked
 * screen shows one thing only: hold to unlock.
 */
export function LiveControls({ paused, locked, onPause, onResume, onLock, onUnlock, onEnd }: Props) {
  const main = useTapGuard(() => {
    tick();
    if (paused) onResume();
    else onPause();
  });
  if (locked) {
    return (
      <div className={styles.controls} data-testid="live-controls" data-locked>
        <HoldButton label="Hold to unlock" caption="Hold to unlock" big onDone={onUnlock} testId="live-unlock">
          <LockIcon width={18} height={18} strokeWidth={2.4} aria-hidden="true" />
        </HoldButton>
      </div>
    );
  }
  return (
    <div className={styles.controls} data-testid="live-controls">
      <Button size="xl" className={styles.main} data-paused={paused || undefined} aria-label={paused ? 'Resume the run' : 'Pause the run'} data-testid={paused ? 'live-resume' : 'live-pause'} onClick={main}>
        {paused ? 'Resume' : 'Pause'}
      </Button>
      <div className={styles.row}>
        <HoldButton label="Hold to end the run" caption="Hold to end" onDone={onEnd} testId="live-end" />
        <button type="button" className={styles.lock} aria-label="Lock the screen" data-testid="live-lock" onClick={onLock}>
          <LockIcon width={16} height={16} strokeWidth={2.4} aria-hidden="true" />
          Lock
        </button>
      </div>
    </div>
  );
}
