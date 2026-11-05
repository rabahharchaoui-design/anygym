import { useEffect, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { Thumb } from './Thumb';
import type { SwapChoices } from './useWorkout';
import styles from './SwapSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The exercise being replaced. */
  name: string;
  options: SwapChoices;
  /** A plan workout: "Always use this" can be offered. */
  canAlways: boolean;
  onPick: (to: string, always: boolean) => void;
  onStopAlways: (slot: string) => void;
};

/**
 * Replace (PLAN 3.4, SPEC 7.2): up to 4 exercises this gym can do, best first, each with why. A demo
 * photo only for a sure match (the tile draws the equipment otherwise, SPEC 4.3). One tap swaps for
 * this workout; the switch makes the same tap stick for the plan, and it starts off every time.
 */
export function SwapSheet({ open, onClose, name, options, canAlways, onPick, onStopAlways }: Props) {
  const [always, setAlways] = useState(false);
  useEffect(() => {
    if (open) setAlways(false);
  }, [open]);
  const { restore, choices, noPattern } = options;
  const none = choices.length === 0 && !restore;
  return (
    <Sheet open={open} onClose={onClose} label={`Replace ${name}`} scroll>
      {open && (
        <div className={styles.body} data-testid="swap-sheet">
          <h2 className={styles.title}>Replace {name}</h2>
          {none ? (
            <div className={styles.empty} data-testid="swap-empty">
              <p className={styles.emptyTitle}>{noPattern ? 'No sure swap for this one' : 'Nothing else fits this gym'}</p>
              <p className={styles.emptySub}>Keep it, or skip it. The rest of your workout is not affected.</p>
              <button type="button" className={`${styles.keep} pressable`} onClick={onClose}>
                Keep it
              </button>
            </div>
          ) : (
            <>
              <p className={styles.sub}>{always ? 'From now on in this plan' : 'For this workout only'}</p>
              <ul className={styles.list}>
                {restore && (
                  <li>
                    <button type="button" className={`${styles.row} pressable`} data-testid="swap-restore" onClick={() => onPick(restore.id, false)}>
                      <span className={styles.text}>
                        <span className={styles.name}>{restore.name}</span>
                        <span className={styles.reason}>Back to the plan</span>
                      </span>
                    </button>
                  </li>
                )}
                {choices.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={`${styles.row} pressable`} data-testid={`swap-choice-${c.id}`} onClick={() => onPick(c.id, canAlways && always)}>
                      <Thumb name={c.name} loadType={c.loadType} photo={c.photo} />
                      <span className={styles.text}>
                        <span className={styles.name}>{c.name}</span>
                        <span className={styles.reason}>{c.reason}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {canAlways && choices.length > 0 && <Switch label="Always use this" hint="Turn this on, then tap your pick" checked={always} onChange={setAlways} />}
              {options.always && (
                <button type="button" className={`${styles.keep} pressable`} data-testid="swap-stop-always" onClick={() => onStopAlways(options.always!.slot)}>
                  Stop always using {options.always.name}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
