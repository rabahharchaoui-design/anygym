import { useMemo, useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { CATALOG_NAMES } from '../../data/importMatch';
import { normalizeName } from '../../lib/import/anygymImportV1';
import { catalogPick } from '../../lib/import/exerciseMatch';
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
  /** A plan exercise id, or a catalog exercise as catalogPick(id). */
  onPick: (pick: string) => void;
  /** Keep the file's own name: no catalog exercise, no demo, no muscles (PLAN 3.2). */
  onKeepName: () => void;
  onSkip: () => void;
};

const PLAN_NAMES = new Set(PLAN_EXERCISES.map((e) => normalizeName(e.name)));
/** Catalog exercises not already on the list under a plan name (the plan one keeps Last time). */
const CATALOG_ONLY = CATALOG_NAMES.filter((c) => !PLAN_NAMES.has(normalizeName(c.name)));

/**
 * Import review (SPEC 9.3, PLAN 3.2): which exercise a file name is, from a search of the plan's
 * exercises and the catalog; or keep it by its own name (not in the catalog), or skip it. The app
 * never picks a doubtful one by itself: this list only ranks.
 */
export function PickExerciseSheet({ open, onClose, ...rest }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="Pick the exercise" scroll footer>
      {open && <Body {...rest} />}
    </Sheet>
  );
}

function Body({ fileName, startFrom, loadType, skipCount, onPick, onKeepName, onSkip }: Omit<Props, 'open' | 'onClose'>) {
  const [query, setQuery] = useState('');
  // Closest names to the file's text first, never A to Z (ux-critic gate 2).
  const text = `${startFrom} ${fileName}`;
  const ranked = useMemo(() => closestFirst(PLAN_EXERCISES, text, loadType), [text, loadType]);
  const rankedCatalog = useMemo(() => closestFirst(CATALOG_ONLY, text), [text]);
  const q = normalizeName(query);
  const items = useMemo(() => (q ? ranked.filter((e) => normalizeName(e.name).includes(q)) : ranked), [q, ranked]);
  const catalogItems = useMemo(() => (q ? rankedCatalog.filter((e) => normalizeName(e.name).includes(q)) : rankedCatalog), [q, rankedCatalog]);
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
      {items.length === 0 && catalogItems.length === 0 && (
        <p className={styles.none}>
          Nothing matches “{query.trim()}”.
          <span className={styles.noneLine}>Keep the name to save it without photos or muscles.</span>
        </p>
      )}
      {items.length > 0 && (
        <section className={styles.section} aria-label="In your plans">
          <h3 className={styles.sectionTitle}>In your plans</h3>
          <ul className={styles.list} aria-label="Exercises">
            {items.map((e) => (
              <li key={e.id}>
                <button type="button" className={`${styles.item} ${css.pickItem} pressable`} onClick={() => onPick(e.id)}>
                  <span className={styles.itemName}>{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {catalogItems.length > 0 && (
        <section className={styles.section} aria-label="More exercises">
          <h3 className={styles.sectionTitle}>More exercises</h3>
          <ul className={styles.list} aria-label="More exercises" data-testid="pick-catalog">
            {catalogItems.map((e) => (
              <li key={e.id}>
                <button type="button" className={`${styles.item} ${css.pickItem} pressable`} onClick={() => onPick(catalogPick(e.id))}>
                  <span className={styles.itemName}>{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* PLAN 3.2a: pinned under the scrolling list (the sheet's footer slot), so no row ever runs under
          it; one row of two buttons, with what Keep the name costs said before the tap. */}
      <SheetFooter>
        <p className={css.pickHint} data-testid="pick-keep-hint">
          Keep the name saves “{fileName}” without photos or muscles.
        </p>
        <div className={css.pickFooter}>
          <button
            type="button"
            className={`${css.secondary} ${css.pickAction} pressable`}
            onClick={onKeepName}
            data-testid="pick-keep-name"
            aria-label={`Keep the name “${fileName}”: saved without photos or muscles`}
          >
            Keep the name
          </button>
          <button type="button" className={`${css.secondary} ${css.pickAction} pressable`} onClick={onSkip}>
            {skipText(skipCount)}
          </button>
        </div>
      </SheetFooter>
    </div>
  );
}

/** "Skip these 3 sets" (one set: "Skip this set"). */
export const skipText = (n: number) => (n === 1 ? 'Skip this set' : `Skip these ${n} sets`);
