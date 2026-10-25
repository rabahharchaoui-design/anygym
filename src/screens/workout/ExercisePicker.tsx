import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../ui/motion';
import { Sheet } from '../../ui/Sheet';
import { PLAN_EXERCISES } from '../../data/planExercises';
import type { Gym } from '../../db/types';
import { recentExerciseIds } from '../../db/history';
import { useLive } from '../../hooks/useLive';
import { BODY_PARTS, pickerId, pickerName, pickerSections, type BodyPart } from '../../lib/picker';
import styles from './Picker.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  gym: Gym | undefined;
  /** Already in the workout: shown as added, not picked again. */
  added: string[];
  onAdd: (exerciseIds: string[]) => void;
};

const CHIPS: BodyPart[] = [...BODY_PARTS, 'More'];

/**
 * The fast exercise picker (SPEC 20.3, 21.2): search on top, body part chips, then Recent, Popular
 * and All. Tap several, then "Add 3". No load type question here: the list
 * knows it (only exercises it does not know ask once, when they open).
 */
export function ExercisePicker({ open, onClose, gym, added, onAdd }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="Add exercise" scroll>
      {open && <PickerBody gym={gym} added={added} onAdd={onAdd} />}
    </Sheet>
  );
}

function PickerBody({ gym, added, onAdd }: Omit<Props, 'open' | 'onClose'>) {
  const [query, setQuery] = useState('');
  const [part, setPart] = useState<BodyPart | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const chipsRef = useRef<HTMLDivElement>(null);
  // The active chip comes fully into view with a 16 pt inset from the edge it was hidden past.
  useLayoutEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const inset = 16;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    if (c.left < r.left + inset) row.scrollTo({ left: row.scrollLeft + c.left - r.left - inset, behavior });
    else if (c.right > r.right - inset) row.scrollTo({ left: row.scrollLeft + c.right - r.right + inset, behavior });
  }, [part]);
  const recent = useLive(() => recentExerciseIds(8), []);

  const sections = useMemo(
    () => pickerSections(PLAN_EXERCISES, { query, part, recent: recent.data ?? [], gym }),
    [query, part, recent.data, gym],
  );

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className={styles.body}>
      <h2 className={styles.title}>Add exercise</h2>
      <input
        type="search"
        className={styles.search}
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => {
          // The chip stays while the search still matches inside it; with nothing there it lets go
          // and the search spans every body part (a chip tapped after narrows it again).
          const q = e.target.value;
          setQuery(q);
          if (part && pickerSections(PLAN_EXERCISES, { query: q, part, recent: recent.data ?? [], gym }).length === 0) setPart(null);
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <div className={styles.chips} role="group" aria-label="Body part" ref={chipsRef}>
        {CHIPS.map((c) => (
          <button key={c} type="button" className={`${styles.chip} pressable`} aria-pressed={part === c} onClick={() => setPart((p) => (p === c ? null : c))}>
            {c}
          </button>
        ))}
      </div>

      {recent.ready && sections.length === 0 && (
        <p className={styles.none} data-testid="picker-none">
          {part ? (
            <>
              <span className={styles.noneLine}>Nothing in {part} matches “{query.trim()}”.</span>
              <button type="button" className={`${styles.noneLink} pressable`} onClick={() => setPart(null)}>
                Search everything
              </button>
            </>
          ) : (
            <>Nothing matches “{query.trim()}”.</>
          )}
        </p>
      )}
      {sections.map((s) => (
        <section key={s.title} className={styles.section} aria-label={s.title}>
          <h3 className={styles.sectionTitle}>{s.title}</h3>
          <ul className={styles.list}>
            {s.items.map((e) => {
              const isAdded = added.some((id) => pickerId(id) === e.id);
              const label = pickerName(e);
              const on = picked.includes(e.id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`${styles.item} pressable`}
                    aria-pressed={isAdded ? undefined : on}
                    disabled={isAdded}
                    aria-label={isAdded ? `${label}, added` : label}
                    onClick={() => toggle(e.id)}
                  >
                    <span className={styles.itemName}>{label}</span>
                    {isAdded ? (
                      <span className={styles.added}>Added</span>
                    ) : (
                      <span className={styles.tick} data-on={on || undefined} aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M6 12.5l4 4 8-9" />
                        </svg>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className={styles.footer}>
        <button type="button" className={`${styles.addButton} pressable`} disabled={picked.length === 0} onClick={() => onAdd(picked)}>
          {picked.length === 0 ? 'Pick exercises' : `Add ${picked.length}`}
        </button>
      </div>
    </div>
  );
}
