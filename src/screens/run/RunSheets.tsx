import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import styles from './Run.module.css';

/** SPEC 12.2, word for word. */
export const POCKET_LINES = ['Keep AnyGym open with the screen on.', 'Your music keeps playing.', 'Locking the phone pauses GPS.'] as const;

type PocketProps = { open: boolean; onGo: () => void; onClose: () => void };

/** Shown once, before the first run (SPEC 12.2 pocket mode). "Got it" goes on to the countdown. */
export function PocketSheet({ open, onGo, onClose }: PocketProps) {
  return (
    <Sheet open={open} onClose={onClose} label="Before your first run">
      <div className={styles.sheet} data-testid="pocket-sheet">
        <h2 className={styles.sheetTitle}>Before your first run</h2>
        {POCKET_LINES.map((l) => (
          <p key={l} className={styles.sheetLine}>
            {l}
          </p>
        ))}
        <p className={styles.sheetLine}>The screen dims by itself after 10 seconds. Tap it to wake it.</p>
        <div className={styles.sheetActions}>
          <Button onClick={onGo} data-testid="pocket-go">
            Got it
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

type SettingsProps = { open: boolean; autoPause: boolean; onAutoPause: (on: boolean) => void; onClose: () => void };

/** Run settings (SPEC 12.3 "Toggle in run settings"): auto pause, on by default. */
export function RunSettingsSheet({ open, autoPause, onAutoPause, onClose }: SettingsProps) {
  return (
    <Sheet open={open} onClose={onClose} label="Run settings">
      <div className={styles.sheet} data-testid="run-settings-sheet">
        <h2 className={styles.sheetTitle}>Run settings</h2>
        <Switch label="Auto pause" hint="The clock stops when you stand still and starts again when you move." checked={autoPause} onChange={onAutoPause} />
        <div className={styles.sheetActions}>
          <Button variant="secondary" onClick={onClose} data-testid="run-settings-done">
            Done
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
