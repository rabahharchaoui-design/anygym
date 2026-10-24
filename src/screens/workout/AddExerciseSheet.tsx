import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { PLAN_EXERCISES } from '../../data/planExercises';
import styles from './Workout.module.css';

type Props = { open: boolean; onClose: () => void; added: string[]; onPick: (exerciseId: string) => void };

/** "+ Add exercise": the plan exercises, type to filter, big rows. */
export function AddExerciseSheet({ open, onClose, added, onPick }: Props) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => (q ? PLAN_EXERCISES.filter((e) => e.name.toLowerCase().includes(q)) : PLAN_EXERCISES), [q]);

  return (
    <Sheet open={open} onClose={onClose} label="Add exercise" scroll>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>Add exercise</h2>
        <input
          type="search"
          className={styles.search}
          placeholder="Search"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <ul className={styles.pickList} aria-label="Exercises">
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`${styles.pickRow} pressable`}
                aria-label={added.includes(e.id) ? `${e.name}, added` : e.name}
                onClick={() => onPick(e.id)}
              >
                <span>{e.name}</span>
                {added.includes(e.id) && <span className={styles.pickAdded}>Added</span>}
              </button>
            </li>
          ))}
        </ul>
        {list.length === 0 && <p className={styles.hint}>Nothing matches “{query.trim()}”.</p>}
      </div>
    </Sheet>
  );
}
