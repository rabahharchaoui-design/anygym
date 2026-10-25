import { useMemo, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { normalizeName } from '../../lib/import/anygymImportV1';
import { closestFirst } from '../../lib/picker';
import styles from '../workout/Picker.module.css';
import css from './Import.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The name in the file the app could not match (its `name` field). */
  fileName: string;
  /** Where the list starts: closest matches to this text first (the file's planExercise). */
  startFrom: string;
  /** The load type the file says (ranked first), when it says one. */
  loadType?: string;
  /** How many sets "Skip these" leaves out. */
  skipCount: number;
  onPick: (exerciseId: string) => void;
  onSkip: () => void;
};

/** Import review (SPEC 9.3): a name the app could not match is picked from the exercise list, or skipped. */
export function PickExerciseSheet({ open, onClose, fileName, startFrom, loadType, skipCount, onPick, onSkip }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="Pick the exercise" scroll>
      {open && <Body fileName={fileName} startFrom={startFrom} loadType={loadType} skipCount={skipCount} onPick={onPick} onSkip={onSkip} />}
    </Sheet>
  );
}

function Body({ fileName, startFrom, loadType, skipCount, onPick, onSkip }: Omit<Props, 'open' | 'onClose'>) {
  const [query, setQuery] = useState('');
  // Closest names to the file's text first, never A to Z (ux-critic gate 2).
  const ranked = useMemo(() => closestFirst(PLAN_EXERCISES, `${startFrom} ${fileName}`, loadType), [startFrom, fileName, loadType]);
  const items = useMemo(() => {
    const q = normalizeName(query);
    return q ? ranked.filter((e) => normalizeName(e.name).includes(q)) : ranked;
  }, [query, ranked]);
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
          {skipText(skipCount)}
        </button>
      </div>
    </div>
  );
}

/** "Skip these 3 sets" (one set: "Skip this set"). */
export const skipText = (n: number) => (n === 1 ? 'Skip this set' : `Skip these ${n} sets`);
