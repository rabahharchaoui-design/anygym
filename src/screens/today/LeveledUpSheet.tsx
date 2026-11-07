// "See changes" for Auto level up (PLAN 3.8, SPEC 15): each lift old → new with its one line why,
// and an Undo for each.
import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { undoChange } from '../../db/coach';
import { formatWeight } from '../../lib/load';
import type { ChangeRecord } from '../../lib/coach';
import { ChangeRow } from './CoachCard';
import styles from './Coach.module.css';

type Props = { open: boolean; onClose: () => void; changes: readonly ChangeRecord[] };

export function LeveledUpSheet({ open, onClose, changes }: Props) {
  const [error, setError] = useState(false);
  const undo = (id: string) => {
    setError(false);
    undoChange(id).catch(() => setError(true));
  };
  return (
    <Sheet open={open} onClose={onClose} label="Leveled up this week">
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>Leveled up this week</h2>
        <p className={styles.sheetSub}>You hit all your reps on these last week. Undo any you want to keep as they were.</p>
        <ul className={styles.list} data-testid="leveled-list">
          {changes.map((c) => (
            <ChangeRow
              key={c.id}
              c={c}
              undone={c.undoneAt !== undefined}
              trailing={
                c.undoneAt !== undefined ? (
                  <span className={styles.undone} data-testid="change-undone">
                    Back to {formatWeight(c.from, c.unit)}
                  </span>
                ) : (
                  <button type="button" className={`${styles.undo} pressable`} onClick={() => undo(c.id)} aria-label={`Undo ${c.name}`} data-testid="change-undo">
                    Undo
                  </button>
                )
              }
            />
          ))}
        </ul>
        <p className={styles.text} role="status">
          {error ? 'Could not undo that. Try again.' : ''}
        </p>
      </div>
    </Sheet>
  );
}
