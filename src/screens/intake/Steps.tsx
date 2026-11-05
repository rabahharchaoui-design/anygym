// The intake's question bodies (PLAN 3.3). Built from the 2.2e components: ChoiceCard for five or
// fewer options, Chip when there are more, SlidingToggle for two option units.
import { useMemo, useState } from 'react';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Chip } from '../../ui/Chip';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { WheelColumn } from '../../ui/WheelColumn';
import { InfoButton } from '../../components/info/InfoButton';
import { EQUIPMENT_IDS, type DumbbellRange, type EquipmentId, type Unit } from '../../db/types';
import { EQUIPMENT_INFO, EQUIPMENT_LABEL, type Option } from '../../lib/intake/options';
import { HEIGHT_CM, HEIGHT_FT, type Height, type UnitsAnswer } from '../../lib/intake/funnel';
import { flipBodyweight, RULER_START } from '../../lib/intake/ruler';
import { cmToFtIn, formatAmount, formatBodyweight, ftInToCm, parseDumbbellRange } from '../../lib/load';
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
}: {
  options: readonly Option<string>[];
  value: T | undefined;
  onPick: (id: string) => void;
  pulse: string | null;
  testId: string;
}) {
  if (options.length <= 5)
    return (
      <div className={styles.cards} role="group" data-testid={testId}>
        {options.map((o) => (
          <div key={o.id} className={styles.pulseWrap} data-pulse={pulse === o.id || undefined}>
            <ChoiceCard icon={iconFor(o.icon)} label={o.label} hint={o.hint} picked={String(value) === o.id} onPress={() => onPick(o.id)} testId={`${testId}-${o.id}`} />
          </div>
        ))}
      </div>
    );
  return (
    <div className={styles.chips} data-grid={options.some((o) => o.icon) || undefined} role="group" data-testid={testId}>
      {options.map((o) => (
        <div key={o.id} className={styles.pulseWrap} data-pulse={pulse === o.id || undefined}>
          <Chip block icon={iconFor(o.icon)} label={o.label} picked={String(value) === o.id} onPress={() => onPick(o.id)} testId={`${testId}-${o.id}`} />
        </div>
      ))}
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
}: {
  options: readonly Option<string>[];
  value: readonly string[] | undefined;
  onChange: (v: string[]) => void;
  only?: string;
  testId: string;
}) {
  const picked = new Set(value ?? []);
  const toggle = (id: string) => {
    if (picked.has(id)) return onChange([...picked].filter((x) => x !== id));
    if (id === only) return onChange([id]);
    onChange([...[...picked].filter((x) => x !== only), id]);
  };
  if (options.length <= 5)
    return (
      <div className={styles.cards} role="group" data-testid={testId}>
        {options.map((o) => (
          <ChoiceCard key={o.id} icon={iconFor(o.icon)} label={o.label} picked={picked.has(o.id)} onPress={() => toggle(o.id)} testId={`${testId}-${o.id}`} />
        ))}
      </div>
    );
  return (
    <div className={styles.chips} data-grid={options.some((o) => o.icon) || undefined} role="group" data-testid={testId}>
      {options.map((o) => (
        <Chip key={o.id} block={options.some((x) => x.icon)} icon={iconFor(o.icon)} label={o.label} picked={picked.has(o.id)} onPress={() => toggle(o.id)} testId={`${testId}-${o.id}`} />
      ))}
    </div>
  );
}

/** The calm units screen: four big two option toggles, preselected from the phone's region. */
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
      {row(
        'u-body',
        'Body for the muscle map',
        <SlidingToggle block labelledBy="u-body" testId="units-body" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value={value.body} onChange={(body) => onChange({ ...value, body })} />,
      )}
    </div>
  );
}

/** SPEC 3 equipment picker with ⓘ on anything unusual (SPEC 13.7). Nothing picked is a real answer. */
export function EquipmentStep({
  value,
  onChange,
  askRange,
  range,
  unit,
  onRange,
}: {
  value: readonly EquipmentId[];
  onChange: (v: EquipmentId[]) => void;
  /** Dumbbells are on at a place with no preset range: ask for it, right under them. */
  askRange: boolean;
  range: DumbbellRange | undefined;
  unit: Unit;
  onRange: (r: DumbbellRange | undefined) => void;
}) {
  const on = new Set(value);
  const all = on.size === EQUIPMENT_IDS.length;
  return (
    <>
      <div className={styles.equipBar}>
        <span className={`${styles.equipCount} num`} aria-live="polite">
          {on.size === 0 ? 'Nothing: bodyweight only' : `${on.size} of ${EQUIPMENT_IDS.length} on`}
        </span>
        <button type="button" className={`${styles.textButton} pressable`} onClick={() => onChange(all ? [] : [...EQUIPMENT_IDS])} data-testid="equip-all">
          {all ? 'Turn all off' : 'Turn all on'}
        </button>
      </div>
      <ul className={styles.equipGrid} data-testid="equipment">
        {EQUIPMENT_IDS.flatMap((id) => [
          <li key={id} className={styles.equipCell}>
            <Chip block label={EQUIPMENT_LABEL[id]} picked={on.has(id)} onPress={() => onChange(on.has(id) ? value.filter((x) => x !== id) : EQUIPMENT_IDS.filter((x) => on.has(x) || x === id))} testId={`equip-${id}`} />
            {EQUIPMENT_INFO[id] && <InfoButton id={EQUIPMENT_INFO[id]!} className={styles.equipInfo} />}
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
    </>
  );
}

/** Lightest, heaviest and the jump between them, typed by the user (SPEC 3). Checked by load.ts. */
function DumbbellRangeFields({ range, unit, onRange }: { range: DumbbellRange | undefined; unit: Unit; onRange: (r: DumbbellRange | undefined) => void }) {
  const [text, setText] = useState({ min: range ? formatAmount(range.min) : '', max: range ? formatAmount(range.max) : '', step: range ? formatAmount(range.step) : '' });
  const change = (key: keyof typeof text, v: string) => {
    const next = { ...text, [key]: v };
    setText(next);
    onRange(parseDumbbellRange(next.min, next.max, next.step, unit) ?? undefined);
  };
  const full = text.min.trim() && text.max.trim() && text.step.trim();
  const field = (key: keyof typeof text, label: string) => (
    <label className={styles.rangeField}>
      <span className={styles.fieldLabel}>{label}</span>
      <input className={`${styles.rangeInput} num`} inputMode="decimal" enterKeyHint="next" value={text[key]} onChange={(e) => change(key, e.target.value)} data-testid={`range-${key}`} />
    </label>
  );
  return (
    <fieldset className={styles.range} data-testid="dumbbell-range">
      <legend className={styles.rangeTitle}>Your dumbbells, in {unit}</legend>
      <div className={styles.rangeFields}>
        {field('min', 'Lightest')}
        {field('max', 'Heaviest')}
        {field('step', 'Goes up by')}
      </div>
      <p className={styles.rangeNote} role="status">
        {full && !range ? 'Check these: the lightest must be above 0 and under the heaviest.' : ''}
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

export function NameStep({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  return (
    <label className={styles.nameField}>
      <span className={styles.fieldLabel}>Your name</span>
      <input
        type="text"
        className={styles.nameInput}
        value={value}
        maxLength={40}
        autoComplete="given-name"
        autoCapitalize="words"
        enterKeyHint="next"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onDone();
        }}
        data-testid="name-input"
      />
    </label>
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
        Slide the ruler to your weight
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
    <div className={styles.measure}>
      <SlidingToggle block label="Height unit" testId="height-unit" options={[{ value: 'cm', label: 'Centimeters' }, { value: 'in', label: 'Feet and inches' }]} value={unit} onChange={flip} />
      <div className={styles.wheels} data-testid="height-wheels">
        {unit === 'cm' ? (
          <WheelColumn items={CM_ITEMS} value={cm} picked={!!value} label="Height in centimeters" testId="wheel-cm" onChange={(v) => onChange({ unit: 'cm', cm: v })} />
        ) : (
          <>
            <WheelColumn items={FT_ITEMS} value={ftIn.ft} picked={!!value} label="Feet" testId="wheel-ft" onChange={(v) => onChange({ unit: 'in', ft: v, in: ftIn.in })} />
            <WheelColumn items={IN_ITEMS} value={ftIn.in} picked={!!value} label="Inches" testId="wheel-in" onChange={(v) => onChange({ unit: 'in', ft: ftIn.ft, in: v })} />
          </>
        )}
      </div>
      <p className={styles.measureHint} data-hidden={!!value || undefined}>
        Spin to your height
      </p>
    </div>
  );
}
