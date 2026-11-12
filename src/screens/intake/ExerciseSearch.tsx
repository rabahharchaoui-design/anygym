// The searchable exercise chips of the intake's Love and Never lists (SPEC 14 item 11). Moved out of
// Steps.tsx as it was (PLAN 3.5f, code organization).
import { useMemo, useState } from 'react';
import { Chip } from '../../ui/Chip';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { POPULAR_IDS, pickerName } from '../../lib/picker';
import { normalizeName } from '../../lib/import/anygymImportV1';
import type { GymKit } from '../../lib/picker';
import { SWAP_DATA } from '../../data/patterns';
import { requiresOf, supports } from '../../lib/swap';
import styles from './Intake.module.css';
import fieldStyles from './IntakeFields.module.css';
import own from './ExerciseDeck.module.css';

const BY_ID = new Map(PLAN_EXERCISES.map((e) => [e.id, e]));
const POPULAR = POPULAR_IDS.map((id) => BY_ID.get(id)).filter((e): e is (typeof PLAN_EXERCISES)[number] => !!e);

/** 3.5f round 3 (M12): known to need gear this gym lacks (a move whose gear is not known for sure is never put there). */
const needsOther = (id: string, gym: GymKit): boolean => {
  const r = requiresOf(SWAP_DATA, id);
  return r !== null && !supports(r, gym);
};

/**
 * Searchable exercise chips (optional). `exclude`: ids picked on the other list. With `gym`, moves it
 * surely has come first and the ones that need gear it lacks sit under "Needs other gear" (round 3, M12).
 */
export function ExercisesStep({ value, onChange, exclude, testId, gym }: { value: readonly string[]; onChange: (v: string[]) => void; exclude: readonly string[]; testId: string; gym?: GymKit }) {
  const [query, setQuery] = useState('');
  const q = normalizeName(query);
  const picked = new Set(value);
  const shown = useMemo(() => {
    const base = q ? PLAN_EXERCISES.filter((e) => normalizeName(pickerName(e)).includes(q)).slice(0, 24) : POPULAR;
    const chosen = value.map((id) => BY_ID.get(id)).filter((e): e is (typeof PLAN_EXERCISES)[number] => !!e);
    const seen = new Set<string>();
    const all = [...(q ? [] : chosen), ...base].filter((e) => !exclude.includes(e.id) && !seen.has(e.id) && seen.add(e.id));
    const other = (e: (typeof all)[number]) => !!gym && !picked.has(e.id) && needsOther(e.id, gym);
    return { fits: all.filter((e) => !other(e)), other: all.filter(other) };
  }, [q, value, exclude, gym]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (e: (typeof PLAN_EXERCISES)[number]) => <Chip key={e.id} label={pickerName(e)} picked={picked.has(e.id)} onPress={() => onChange(picked.has(e.id) ? value.filter((x) => x !== e.id) : [...value, e.id])} testId={`${testId}-${e.id}`} />;
  return (
    <>
      <input
        type="search"
        className={fieldStyles.search}
        placeholder="Search exercises"
        aria-label="Search exercises"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="none"
        data-testid={`${testId}-search`}
      />
      {shown.fits.length + shown.other.length === 0 ? (
        <p className={fieldStyles.empty}>No exercise by that name yet.</p>
      ) : (
        <>
          <div className={styles.chips} role="group" data-testid={testId}>
            {shown.fits.map(chip)}
          </div>
          {shown.other.length > 0 && (
            <>
              <p className={own.gearDivider} data-testid={`${testId}-other-gear`}>
                Needs other gear
              </p>
              <div className={styles.chips} role="group" aria-label="Needs other gear" data-testid={`${testId}-other`}>
                {shown.other.map(chip)}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
