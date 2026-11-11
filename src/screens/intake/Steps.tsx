// The intake's question bodies (PLAN 3.3). Built from the 2.2e components: ChoiceCard for five or
// fewer options, Chip when there are more, SlidingToggle for two option units.
import { useState } from 'react';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Chip } from '../../ui/Chip';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { InfoButton } from '../../components/info/InfoButton';
import { Check } from 'lucide-react';
import type { DumbbellRange, EquipmentId, Unit } from '../../db/types';
import { groupsFor, toggleGroup, toggleItem } from '../../lib/intake/equipmentGroups';
import { EquipmentArt } from './EquipmentArt';
import { CARDIO, CARDIO_FAVORITES, EQUIPMENT_INFO, EQUIPMENT_LABEL, GOALS, type GoalId, type Option } from '../../lib/intake/options';
import { tapGoal, type UnitsAnswer } from '../../lib/intake/funnel';
import { dumbbellRangeProblems, formatAmount, parseDumbbellRange, type DumbbellRangeProblems } from '../../lib/load';
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
