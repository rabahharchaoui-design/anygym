// The intake's question bodies (PLAN 3.3). Built from the 2.2e components: ChoiceCard for five or
// fewer options, Chip when there are more, SlidingToggle for two option units.
import { useMemo, useState } from 'react';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Chip } from '../../ui/Chip';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { WheelColumn } from '../../ui/WheelColumn';
import { InfoButton } from '../../components/info/InfoButton';
import { Check } from 'lucide-react';
import type { DumbbellRange, EquipmentId, Unit } from '../../db/types';
import { groupsFor, toggleGroup, toggleItem } from '../../lib/intake/equipmentGroups';
import { EquipmentArt } from './EquipmentArt';
import { AGE_RANGES, CARDIO, CARDIO_FAVORITES, EQUIPMENT_INFO, EQUIPMENT_LABEL, GOALS, type AgeRangeId, type GoalId, type Option } from '../../lib/intake/options';
import { HEIGHT_CM, HEIGHT_FT, tapGoal, type Height, type IntakeAnswers, type UnitsAnswer } from '../../lib/intake/funnel';
import { flipBodyweight, RULER_START } from '../../lib/intake/ruler';
import { cmToFtIn, dumbbellRangeProblems, formatAmount, formatBodyweight, ftInToCm, parseDumbbellRange, type DumbbellRangeProblems } from '../../lib/load';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { POPULAR_IDS, pickerName } from '../../lib/picker';
import { normalizeName } from '../../lib/import/anygymImportV1';
import { BodyweightRuler } from './BodyweightRuler';
import { iconFor } from './icons';
import styles from './Intake.module.css';

/** One pick. Cards for five or fewer options, chips for more. `pulse`: the card that was just tapped. */
export function SingleChoice<T extends string | number>({
  options,
  value,
  onPick,
  pulse,
  testId,
  columns,
  fill = true,
}: {
  options: readonly Option<string>[];
  value: T | undefined;
  onPick: (id: string) => void;
  pulse: string | null;
  testId: string;
  columns?: '1' | '2' | '4';
  /** PLAN 3.3a: the cards grow to fill the screen (off while something shows under them). */
  fill?: boolean;
}) {
  if (options.length <= 5)
    return (
      <div className={styles.cards} role="group" data-testid={testId} data-fill={fill ? '' : 'off'}>
        {options.map((o) => (
          <div key={o.id} className={styles.pulseWrap} data-pulse={pulse === o.id || undefined}>
            <ChoiceCard icon={iconFor(o.icon)} label={o.label} hint={o.hint} picked={String(value) === o.id} onPress={() => onPick(o.id)} testId={`${testId}-${o.id}`} />
          </div>
        ))}
      </div>
    );
  return (
    <div className={styles.chips} data-grid={columns ?? '2'} data-fill role="group" data-testid={testId}>
      {options.map((o) => (
        <div key={o.id} className={styles.pulseWrap} data-pulse={pulse === o.id || undefined}>
          <Chip block icon={iconFor(o.icon)} label={o.label} picked={String(value) === o.id} onPress={() => onPick(o.id)} testId={`${testId}-${o.id}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * PLAN 3.3a: the main goal, up to two. The first tap is tagged Main and leads the plan, the
 * second Also; a third swaps out the Also. Tall tiles that fill the screen, two across.
 */
export function GoalChoice({ value, onChange }: { value: readonly GoalId[]; onChange: (v: GoalId[]) => void }) {
  return (
    <div className={styles.chips} data-grid="2" data-fill role="group" data-testid="q-goal">
      {GOALS.map((o) => {
        const at = value.indexOf(o.id);
        return (
          <Chip
            key={o.id}
            block
            tile
            icon={iconFor(o.icon)}
            label={o.label}
            picked={at >= 0}
            tag={at === 0 ? 'Main' : at === 1 ? 'Also' : ''}
            onPress={() => onChange(tapGoal(value, o.id))}
            testId={`q-goal-${o.id}`}
          />
        );
      })}
    </div>
  );
}

/** Pick any. `only`: an option that clears the rest when picked ("None"). */
export function MultiChoice({
  options,
  value,
  onChange,
  only,
  testId,
  columns,
  fill = true,
}: {
  options: readonly Option<string>[];
  value: readonly string[] | undefined;
  onChange: (v: string[]) => void;
  only?: string;
  testId: string;
  columns?: '1' | '2' | '4';
  /** PLAN 3.3a: the options grow to fill the screen. */
  fill?: boolean;
}) {
  const picked = new Set(value ?? []);
  // Options with pictures become tall tiles when they fill; plain words stay centered.
  const tiles = fill && options.every((o) => !!o.icon);
  const toggle = (id: string) => {
    if (picked.has(id)) return onChange([...picked].filter((x) => x !== id));
    if (id === only) return onChange([id]);
    onChange([...[...picked].filter((x) => x !== only), id]);
  };
  if (options.length <= 5)
    return (
      <div className={styles.cards} role="group" data-testid={testId} data-fill={fill ? '' : 'off'}>
        {options.map((o) => (
          <ChoiceCard key={o.id} icon={iconFor(o.icon)} label={o.label} picked={picked.has(o.id)} onPress={() => toggle(o.id)} testId={`${testId}-${o.id}`} />
        ))}
      </div>
    );
  return (
    <div className={styles.chips} data-grid={columns ?? '2'} data-fill={fill ? '' : 'off'} role="group" data-testid={testId}>
      {options.map((o) => (
        <Chip key={o.id} block tile={tiles} icon={iconFor(o.icon)} label={o.label} picked={picked.has(o.id)} onPress={() => toggle(o.id)} testId={`${testId}-${o.id}`} />
      ))}
    </div>
  );
}

/** The calm units screen: big two option toggles, the units preselected from the phone's region. */
export function UnitsStep({ value, onChange }: { value: UnitsAnswer; onChange: (v: UnitsAnswer) => void }) {
  const row = (id: string, label: string, toggle: React.ReactNode) => (
    <div className={styles.unitRow}>
      <span className={styles.unitLabel} id={id}>
        {label}
      </span>
      {toggle}
    </div>
  );
  return (
    <div className={styles.units}>
      {row(
        'u-weight',
        'Weight',
        <SlidingToggle block labelledBy="u-weight" testId="units-weight" options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} value={value.weight} onChange={(weight) => onChange({ ...value, weight })} />,
      )}
      {row(
        'u-distance',
        'Distance',
        <SlidingToggle block labelledBy="u-distance" testId="units-distance" options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'miles' }]} value={value.distance} onChange={(distance) => onChange({ ...value, distance })} />,
      )}
      {row(
        'u-measure',
        'Body measurements',
        <SlidingToggle block labelledBy="u-measure" testId="units-measure" options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'inches' }]} value={value.measure} onChange={(measure) => onChange({ ...value, measure })} />,
      )}
      <div className={styles.unitApart}>
        {row(
          'u-body',
          'Which body should the muscle map show?',
          <SlidingToggle block labelledBy="u-body" testId="units-body" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value={value.body} onChange={(body) => onChange({ ...value, body })} />,
        )}
        <p className={styles.fieldHint} data-testid="units-body-hint">
          Optional. You can change this in Settings.
        </p>
      </div>
    </div>
  );
}

/** B4: the sheet's weight line only where it applies: a bar whose weight the user needs. */
const BAR_WEIGHT_INFO: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['barbell_rack', 'ez_curl_bar']);

/**
 * SPEC 3 equipment picker (PLAN 3.3a): a picture tile for every item, three across, grouped, each
 * group with its own All. ⓘ on anything unusual (SPEC 13.7). Nothing picked is a real answer.
 */
export function EquipmentStep({
  value,
  onChange,
  askRange,
  range,
  unit,
  onRange,
  choices,
}: {
  value: readonly EquipmentId[];
  onChange: (v: EquipmentId[]) => void;
  /** Dumbbells are on at a place with no preset range: ask for it, right under them. */
  askRange: boolean;
  range: DumbbellRange | undefined;
  unit: Unit;
  onRange: (r: DumbbellRange | undefined) => void;
  /** What this place asks about. */
  choices: readonly EquipmentId[];
}) {
  const on = new Set(value);
  const all = choices.every((id) => on.has(id));
  const groups = groupsFor(choices);
  return (
    <>
      <div className={styles.equipBar}>
        <span className={`${styles.equipCount} num`} aria-live="polite">
          {on.size === 0 ? 'Nothing: bodyweight only' : `${on.size} of ${choices.length} on`}
        </span>
        <button type="button" className={`${styles.textButton} pressable`} onClick={() => onChange(all ? [] : [...choices])} data-testid="equip-all">
          {all ? 'Turn all off' : 'Turn all on'}
        </button>
      </div>
      <div className={styles.equipGroups} data-testid="equipment">
        {groups.map((g) => {
          const groupOn = g.items.every((id) => on.has(id));
          const titleId = `equip-group-${g.id}`;
          return (
            <section key={g.id} className={styles.equipGroup} aria-labelledby={titleId} data-testid={`equip-group-${g.id}`}>
              <div className={styles.groupHead}>
                <h2 className={styles.groupTitle} id={titleId}>
                  {g.label}
                </h2>
                <button
                  type="button"
                  className={`${styles.groupAll} pressable`}
                  aria-pressed={groupOn}
                  aria-label={`All ${g.label.toLowerCase()}`}
                  onClick={() => onChange(toggleGroup(value, g.items))}
                  data-testid={`equip-all-${g.id}`}
                >
                  <Check className={styles.groupAllCheck} width={14} height={14} strokeWidth={3} aria-hidden="true" />
                  All
                </button>
              </div>
              <ul className={styles.equipGrid}>
                {g.items.flatMap((id) => [
                  <li key={id} className={styles.tileCell}>
                    <button type="button" className={`${styles.tile} pressable`} aria-pressed={on.has(id)} onClick={() => onChange(toggleItem(value, id))} data-testid={`equip-${id}`}>
                      <Check className={styles.tileCheck} width={12} height={12} strokeWidth={3.5} aria-hidden="true" data-check />
                      <span className={styles.tileArt}>
                        <EquipmentArt id={id} className={styles.art} />
                      </span>
                      <span className={styles.tileName}>{EQUIPMENT_LABEL[id]}</span>
                    </button>
                    {EQUIPMENT_INFO[id] && (
                      <InfoButton id={EQUIPMENT_INFO[id]!} className={styles.tileInfo} art={<EquipmentArt id={id} accent />} showWeight={BAR_WEIGHT_INFO.has(id)} />
                    )}
                  </li>,
                  ...(id === 'dumbbells' && askRange
                    ? [
                        <li key="dumbbell-range" className={styles.rangeCell}>
                          <DumbbellRangeFields range={range} unit={unit} onRange={onRange} />
                        </li>,
                      ]
                    : []),
                ])}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}

const RANGE_WORDS: Record<NonNullable<DumbbellRangeProblems['min' | 'max' | 'step']>, string> = {
  number: 'type a number.',
  zero: 'must be above 0.',
  'under-min': 'must not be under the lightest.',
  'too-heavy': 'is more than any dumbbell weighs.',
  'too-small': 'is not a step dumbbells come in.',
  'misses-max': 'never lands on the heaviest.',
};
const RANGE_LABEL = { min: 'Lightest', max: 'Heaviest', step: 'Goes up by' } as const;
const RANGE_EXAMPLE: Record<Unit, Record<keyof typeof RANGE_LABEL, string>> = {
  lb: { min: '5', max: '50', step: '5' },
  kg: { min: '2', max: '24', step: '2' },
};

/** Lightest, heaviest and the jump between them, typed by the user (SPEC 3). load.ts checks them. */
function DumbbellRangeFields({ range, unit, onRange }: { range: DumbbellRange | undefined; unit: Unit; onRange: (r: DumbbellRange | undefined) => void }) {
  const [text, setText] = useState({ min: range ? formatAmount(range.min) : '', max: range ? formatAmount(range.max) : '', step: range ? formatAmount(range.step) : '' });
  const change = (key: keyof typeof text, v: string) => {
    const next = { ...text, [key]: v };
    setText(next);
    onRange(parseDumbbellRange(next.min, next.max, next.step, unit) ?? undefined);
  };
  const problems = dumbbellRangeProblems(text.min, text.max, text.step, unit);
  const first = (['min', 'max', 'step'] as const).find((k) => problems[k]);
  const field = (key: keyof typeof text) => (
    <label className={styles.rangeField}>
      <span className={styles.fieldLabel}>{RANGE_LABEL[key]}</span>
      <input
        className={`${styles.rangeInput} num`}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder={RANGE_EXAMPLE[unit][key]}
        value={text[key]}
        aria-invalid={problems[key] ? true : undefined}
        onChange={(e) => change(key, e.target.value)}
        data-testid={`range-${key}`}
      />
    </label>
  );
  return (
    <fieldset className={styles.range} data-testid="dumbbell-range">
      <legend className={styles.rangeTitle}>Your dumbbells, in {unit}</legend>
      <div className={styles.rangeFields}>
        {field('min')}
        {field('max')}
        {field('step')}
      </div>
      <p className={styles.rangeNote} role="status" data-testid="range-note">
        {first ? `${RANGE_LABEL[first]}: ${RANGE_WORDS[problems[first]!]}` : ''}
      </p>
    </fieldset>
  );
}

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

/** How they feel about cardio, and right there which they like (SPEC 14 step 9). */
export function CardioStep({ cardio, favorites, onCardio, onFavorites }: { cardio: string | undefined; favorites: readonly string[] | undefined; onCardio: (id: string) => void; onFavorites: (v: string[]) => void }) {
  return (
    <>
      <SingleChoice options={CARDIO} value={cardio} onPick={onCardio} pulse={null} testId="q-cardio" fill={!cardio || cardio === 'none'} />
      {cardio && cardio !== 'none' && (
        <section className={styles.aboutGroup}>
          <span className={styles.fieldLabel}>Any you like? Optional.</span>
          <MultiChoice options={CARDIO_FAVORITES} value={favorites} onChange={onFavorites} testId="q-cardioFavorites" fill={false} />
        </section>
      )}
    </>
  );
}

/** One optional screen for both lists (SPEC 14 step 11): the toggle says which one a tap fills. */
export function BothExercisesStep({ love, never, onLove, onNever }: { love: readonly string[]; never: readonly string[]; onLove: (v: string[]) => void; onNever: (v: string[]) => void }) {
  const [mode, setMode] = useState<'love' | 'never'>(love.length === 0 && never.length > 0 ? 'never' : 'love');
  return (
    <>
      <SlidingToggle block label="Which list" testId="ex-mode" options={[{ value: 'love', label: `Love${love.length ? ` (${love.length})` : ''}` }, { value: 'never', label: `Never${never.length ? ` (${never.length})` : ''}` }]} value={mode} onChange={setMode} />
      {mode === 'love' ? <ExercisesStep key="love" value={love} exclude={never} onChange={onLove} testId="q-love" /> : <ExercisesStep key="never" value={never} exclude={love} onChange={onNever} testId="q-never" />}
    </>
  );
}

/** The most a name can be (lib/intake/funnel.ts sanitize keeps the same). */
const NAME_MAX = 40;

/** SPEC 14 step 13: name, height and age on one optional screen. Each is saved only if given. */
export function AboutStep({
  answers,
  onName,
  onHeight,
  onAge,
  measure,
}: {
  answers: Pick<IntakeAnswers, 'name' | 'height' | 'age'>;
  onName: (v: string | undefined) => void;
  onHeight: (v: Height) => void;
  onAge: (v: AgeRangeId | undefined) => void;
  measure: 'cm' | 'in';
}) {
  const name = answers.name ?? '';
  return (
    <div className={styles.about}>
      <label className={styles.nameField}>
        <span className={styles.fieldLabel}>Your name</span>
        <input
          type="text"
          className={styles.nameInput}
          value={name}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(e) => onName(e.target.value || undefined)}
          data-testid="name-input"
        />
        <span className={styles.fieldHint} data-limit={name.length >= NAME_MAX || undefined} data-testid="name-hint">
          {name.length >= NAME_MAX ? `That's the limit: ${NAME_MAX} letters.` : 'Shown on your profile. Optional.'}
        </span>
      </label>
      <div className={styles.aboutGroup}>
        <span className={styles.fieldLabel}>Height</span>
        <HeightStep value={answers.height} measure={measure} onChange={onHeight} />
      </div>
      <div className={styles.aboutGroup}>
        <span className={styles.fieldLabel} id="age-label">
          Age
        </span>
        <div className={styles.chips} data-grid="2" role="group" aria-labelledby="age-label" data-testid="q-age">
          {AGE_RANGES.map((o) => (
            <Chip key={o.id} block label={o.label} picked={answers.age === o.id} onPress={() => onAge(answers.age === o.id ? undefined : o.id)} testId={`q-age-${o.id}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One huge number with its unit over the ruler; the unit toggle flips the number through load.ts. */
export function BodyweightStep({
  value,
  unit: defaultUnit,
  onChange,
}: {
  value: { value: number; unit: Unit } | undefined;
  unit: Unit;
  onChange: (v: { value: number; unit: Unit }) => void;
}) {
  const [shownUnit, setShownUnit] = useState<Unit>(value?.unit ?? defaultUnit);
  const [start, setStart] = useState<number>(value?.value ?? RULER_START[value?.unit ?? defaultUnit]);
  const unit = value?.unit ?? shownUnit;
  const current = value?.value ?? start;
  const flip = (to: Unit) => {
    if (to === unit) return;
    setShownUnit(to);
    if (value) onChange({ value: flipBodyweight(value.value, value.unit, to), unit: to });
    else setStart(RULER_START[to]);
  };
  return (
    <div className={styles.measure}>
      <SlidingToggle block label="Weight unit" testId="bw-unit" options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} value={unit} onChange={flip} />
      <p className={`${styles.bigNumber} num`} data-touched={!!value || undefined} aria-live="polite" data-testid="bw-value">
        {formatBodyweight(current)}
        <span className={styles.bigUnit}>{unit}</span>
      </p>
      <BodyweightRuler unit={unit} value={current} touched={!!value} onChange={(v) => onChange({ value: v, unit })} />
      <p className={styles.measureHint} data-hidden={!!value || undefined}>
        Slide or tap to confirm
      </p>
    </div>
  );
}

const CM_ITEMS = Array.from({ length: HEIGHT_CM.max - HEIGHT_CM.min + 1 }, (_, i) => ({ value: HEIGHT_CM.min + i, label: `${HEIGHT_CM.min + i} cm` }));
const FT_ITEMS = Array.from({ length: HEIGHT_FT.max - HEIGHT_FT.min + 1 }, (_, i) => ({ value: HEIGHT_FT.min + i, label: `${HEIGHT_FT.min + i} ft` }));
const IN_ITEMS = Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i} in` }));
const START_CM = 170;
const START_IN = { ft: 5, in: 7 };

/** Two wheels (ft and in) or one (cm); the toggle converts through load.ts. */
export function HeightStep({ value, measure, onChange }: { value: Height | undefined; measure: 'cm' | 'in'; onChange: (v: Height) => void }) {
  const [shown, setShown] = useState<'cm' | 'in'>(value?.unit ?? measure);
  const unit = value?.unit ?? shown;
  const cm = value?.unit === 'cm' ? value.cm : START_CM;
  const ftIn = value?.unit === 'in' ? { ft: value.ft, in: value.in } : START_IN;
  const flip = (to: 'cm' | 'in') => {
    if (to === unit) return;
    setShown(to);
    if (!value) return;
    if (to === 'cm' && value.unit === 'in') onChange({ unit: 'cm', cm: Math.min(HEIGHT_CM.max, Math.max(HEIGHT_CM.min, ftInToCm(value.ft, value.in))) });
    if (to === 'in' && value.unit === 'cm') {
      const f = cmToFtIn(value.cm);
      onChange({ unit: 'in', ft: Math.min(HEIGHT_FT.max, Math.max(HEIGHT_FT.min, f.ft)), in: f.in });
    }
  };
  return (
    <div className={styles.measureTight}>
      <SlidingToggle block label="Height unit" testId="height-unit" options={[{ value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Feet and inches' }]} value={unit} onChange={flip} />
      <div className={styles.wheels} data-testid="height-wheels">
        {unit === 'cm' ? (
          <WheelColumn rows={3} items={CM_ITEMS} value={cm} picked={!!value} label="Height in centimeters" testId="wheel-cm" onChange={(v) => onChange({ unit: 'cm', cm: v })} />
        ) : (
          <>
            <WheelColumn rows={3} items={FT_ITEMS} value={ftIn.ft} picked={!!value} label="Feet" testId="wheel-ft" onChange={(v) => onChange({ unit: 'in', ft: v, in: ftIn.in })} />
            <WheelColumn rows={3} items={IN_ITEMS} value={ftIn.in} picked={!!value} label="Inches" testId="wheel-in" onChange={(v) => onChange({ unit: 'in', ft: ftIn.ft, in: v })} />
          </>
        )}
      </div>
      <p className={styles.measureHint} data-hidden={!!value || undefined}>
        Spin or tap to confirm
      </p>
    </div>
  );
}
