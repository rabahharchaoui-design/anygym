import { useMemo, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { normalizeName } from '../../lib/import/anygymImportV1';
import styles from '../workout/Picker.module.css';
import css from './Import.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The name in the file the app could not match. */
  fileName: string;
  onPick: (exerciseId: string) => void;
  onSkip: () => void;
};

/** Import review (SPEC 9.3): a name the app could not match is picked from the exercise list, or skipped. */
export function PickExerciseSheet({ open, onClose, fileName, onPick, onSkip }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="Pick the exercise" scroll>
      {open && <Body fileName={fileName} onPick={onPick} onSkip={onSkip} />}
    </Sheet>
  );
}

function Body({ fileName, onPick, onSkip }: Omit<Props, 'open' | 'onClose'>) {
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const q = normalizeName(query);
    return q ? PLAN_EXERCISES.filter((e) => normalizeName(e.name).includes(q)) : PLAN_EXERCISES;
  }, [query]);
  return (
    <div className={styles.body}>
      <h2 className={styles.title}>Pick the exercise</h2>
      <p className={styles.none}>In your file: “{fileName}”</p>
      <input
        type="search"
        className={styles.search}
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {items.length === 0 && <p className={styles.none}>Nothing matches “{query.trim()}”.</p>}
      <ul className={styles.list} aria-label="Exercises">
        {items.map((e) => (
          <li key={e.id}>
            <button type="button" className={`${styles.item} pressable`} onClick={() => onPick(e.id)}>
              <span className={styles.itemName}>{e.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <button type="button" className={`${css.secondary} pressable`} onClick={onSkip}>
          Skip these
        </button>
      </div>
    </div>
  );
}
