// The searchable exercise chips of the intake's Love and Never lists (SPEC 14 item 11). Moved out of
// Steps.tsx as it was (PLAN 3.5f, code organization).
import { useMemo, useState } from 'react';
import { Chip } from '../../ui/Chip';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { POPULAR_IDS, pickerName } from '../../lib/picker';
import { normalizeName } from '../../lib/import/anygymImportV1';
import styles from './Intake.module.css';

const BY_ID = new Map(PLAN_EXERCISES.map((e) => [e.id, e]));
const POPULAR = POPULAR_IDS.map((id) => BY_ID.get(id)).filter((e): e is (typeof PLAN_EXERCISES)[number] => !!e);

/** Searchable exercise chips (optional). `exclude`: ids picked on the other list. */
export function ExercisesStep({ value, onChange, exclude, testId }: { value: readonly string[]; onChange: (v: string[]) => void; exclude: readonly string[]; testId: string }) {
  const [query, setQuery] = useState('');
  const q = normalizeName(query);
  const picked = new Set(value);
  const shown = useMemo(() => {
    const base = q ? PLAN_EXERCISES.filter((e) => normalizeName(pickerName(e)).includes(q)).slice(0, 24) : POPULAR;
    const chosen = value.map((id) => BY_ID.get(id)).filter((e): e is (typeof PLAN_EXERCISES)[number] => !!e);
    const seen = new Set<string>();
    return [...(q ? [] : chosen), ...base].filter((e) => !exclude.includes(e.id) && !seen.has(e.id) && seen.add(e.id));
  }, [q, value, exclude]);
  return (
    <>
      <input
        type="search"
        className={styles.search}
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="none"
        data-testid={`${testId}-search`}
      />
      {shown.length === 0 ? (
        <p className={styles.empty}>No exercise by that name yet.</p>
      ) : (
        <div className={styles.chips} role="group" data-testid={testId}>
          {shown.map((e) => (
            <Chip key={e.id} label={pickerName(e)} picked={picked.has(e.id)} onPress={() => onChange(picked.has(e.id) ? value.filter((x) => x !== e.id) : [...value, e.id])} testId={`${testId}-${e.id}`} />
          ))}
        </div>
      )}
    </>
  );
}
