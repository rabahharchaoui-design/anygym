import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import type { GpsStatus, GpsWords } from '../../lib/run';
import styles from './Run.module.css';

type ChipProps = { status: GpsStatus; words: GpsWords; onPress: () => void };

/**
 * The GPS chip (PLAN 4.2, competitor gap 5): what the phone knows about where it is, in two or
 * three words. It informs and explains; it never stands between the user and Start.
 */
export function GpsChip({ status, words, onPress }: ChipProps) {
  return (
    <button type="button" className={`${styles.gps} pressable`} data-testid="gps-chip" data-status={status} data-tone={words.tone} aria-label={`${words.chip}. What this means`} onClick={onPress}>
      <span className={styles.gpsFace}>
        <span className={styles.gpsDot} aria-hidden="true" />
        {words.chip}
      </span>
    </button>
  );
}

type SheetProps = {
  open: boolean;
  status: GpsStatus;
  words: GpsWords;
  onClose: () => void;
  /** Start listening (the phone may ask). */
  onAsk: () => void;
};

/** Behind the chip: what the status means and, when location is off, how to turn it on. */
export function GpsSheet({ open, status, words, onClose, onAsk }: SheetProps) {
  const steps = status === 'denied';
  const ask = () => {
    onAsk();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label={words.title}>
      <div className={styles.sheet} data-testid="gps-sheet">
        <h2 className={styles.sheetTitle}>{words.title}</h2>
        {steps ? (
          <ol className={styles.steps}>
            {words.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
        ) : (
          words.lines.map((l) => (
            <p key={l} className={styles.sheetLine}>
              {l}
            </p>
          ))
        )}
        {status === 'denied' && <p className={styles.sheetLine}>You can still start a run.</p>}
        <div className={styles.sheetActions}>
          {status === 'ask' ? (
            <Button onClick={ask} data-testid="gps-ask">
              Use my location
            </Button>
          ) : status === 'denied' || status === 'no-signal' ? (
            <Button variant="secondary" onClick={ask} data-testid="gps-retry">
              Try again
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
