import { LockIcon, PauseIcon, PlayIcon, StopIcon } from '../../ui/icons';
import { useTapGuard } from '../../hooks/useTapGuard';
import { tick } from '../../ui/haptics';
import { HoldButton } from './HoldButton';
import styles from './LiveControls.module.css';

type Props = {
  /** Paused by hand: the big button resumes. */
  paused: boolean;
  locked: boolean;
  onPause: () => void;
  onResume: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onEnd: () => void;
};

/**
 * The bottom controls of the live run (SPEC 12.2). Each one keeps its place for the whole run:
 * Lock on the left, Pause (or Resume) in the middle, hold to End on the right. A locked screen
 * shows one thing only: hold to unlock.
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
        <HoldButton label="Hold to unlock" caption="Hold to unlock" tone="unlock" big onDone={onUnlock} testId="live-unlock">
          <LockIcon width={30} height={30} strokeWidth={2.2} aria-hidden="true" />
        </HoldButton>
      </div>
    );
  }
  return (
    <div className={styles.controls} data-testid="live-controls">
      <div className={styles.control}>
        <button type="button" className={styles.side} aria-label="Lock the screen" data-testid="live-lock" onClick={onLock}>
          <LockIcon width={24} height={24} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <span className={styles.caption}>Lock</span>
      </div>
      <div className={styles.control}>
        <button type="button" className={styles.main} data-paused={paused || undefined} aria-label={paused ? 'Resume the run' : 'Pause the run'} data-testid={paused ? 'live-resume' : 'live-pause'} onClick={main}>
          {paused ? <PlayIcon width={36} height={36} strokeWidth={2.4} aria-hidden="true" /> : <PauseIcon width={36} height={36} strokeWidth={2.4} aria-hidden="true" />}
        </button>
        <span className={styles.caption}>{paused ? 'Resume' : 'Pause'}</span>
      </div>
      <HoldButton label="Hold to end the run" caption="Hold to end" tone="end" onDone={onEnd} testId="live-end">
        <StopIcon width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
      </HoldButton>
    </div>
  );
}
