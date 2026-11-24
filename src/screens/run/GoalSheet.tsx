import { useState } from 'react';
import { IntervalEditor } from './IntervalEditor';
import { Button } from '../../ui/Button';
import { WordToggle } from '../../ui/WordToggle';
import { ChoiceCard } from '../../ui/ChoiceCard';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { WheelColumn } from '../../ui/WheelColumn';
import type { DistanceUnit } from '../../lib/intake/answers';
import {
  DISTANCE_PRESETS, INTERVAL_PRESETS, TIME_PRESETS_MIN, customDistanceValues, customTimeValues, distanceLabel, isDistancePreset, isTimePreset,
  planWords, sameDistance, timeLabel, type DistanceGoal, type RunSetup,
} from '../../lib/run';
import styles from './Run.module.css';

export type GoalKind = 'distance' | 'time' | 'intervals';

type Props = {
  /** Which picker is open; null closes the sheet. */
  kind: GoalKind | null;
  setup: RunSetup;
  unit: DistanceUnit;
  onChange: (patch: Partial<RunSetup>) => void;
  onUnit: (unit: DistanceUnit) => void;
  onClose: () => void;
};

const TITLES: Record<GoalKind, string> = { distance: 'How far?', time: 'How long?', intervals: 'Pick your intervals' };
const UNITS: ReadonlyArray<{ value: DistanceUnit; label: string }> = [
  { value: 'mi', label: 'Miles' },
  { value: 'km', label: 'Kilometers' },
];
const DISTANCE_ITEMS = customDistanceValues().map((v) => ({ value: v, label: String(v) }));
const TIME_ITEMS = customTimeValues().map((v) => ({ value: v, label: timeLabel(v) }));

/**
 * The goal pickers of the run start screen (SPEC 12.1, 12.7). A preset is one tap: it is chosen
 * and the sheet closes. Custom opens a wheel, kept with Done. Intervals: the three presets, or a
 * custom set of blocks built with taps (IntervalEditor).
 */
export function GoalSheet({ kind, setup, unit, onChange, onUnit, onClose }: Props) {
  // The last kind stays drawn while the sheet slides away.
  const [shown, setShown] = useState<GoalKind>('distance');
  if (kind && kind !== shown) setShown(kind);
  return (
    <Sheet open={kind !== null} onClose={onClose} label={TITLES[shown]} scroll={shown === 'intervals'}>
      <div className={styles.sheet} data-testid={`goal-sheet-${shown}`}>
        <h2 className={styles.sheetTitle}>{TITLES[shown]}</h2>
        {shown === 'distance' && <DistancePicker goal={setup.distance} unit={unit} onUnit={onUnit} onPick={(distance) => (onChange({ distance }), onClose())} />}
        {shown === 'time' && <TimePicker min={setup.timeMin} onPick={(timeMin) => (onChange({ timeMin }), onClose())} />}
        {shown === 'intervals' && (
          <div className={styles.choices}>
            {INTERVAL_PRESETS.map((p) => (
              <ChoiceCard key={p.id} label={p.label} hint={p.detail} picked={setup.interval === p.id} onPress={() => (onChange({ interval: p.id }), onClose())} testId={`interval-${p.id}`} flat />
            ))}
            <ChoiceCard label="Custom" hint={planWords(setup.custom)} picked={setup.interval === 'custom'} onPress={() => onChange({ interval: 'custom' })} testId="interval-custom" flat />
            {setup.interval === 'custom' && (
              <>
                <IntervalEditor plan={setup.custom} onChange={(custom) => onChange({ custom })} />
                <Button onClick={onClose} data-testid="goal-done">
                  Done
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DistancePicker({ goal, unit, onUnit, onPick }: { goal: DistanceGoal; unit: DistanceUnit; onUnit: (u: DistanceUnit) => void; onPick: (g: DistanceGoal) => void }) {
  const [custom, setCustom] = useState(!isDistancePreset(goal));
  // The wheel starts on the current number, in the goal's own unit when it is a custom one.
  const [value, setValue] = useState(goal.value);
  const [wheelUnit, setWheelUnit] = useState<DistanceUnit>(isDistancePreset(goal) ? unit : goal.unit);
  return (
    <>
      <div className={styles.presets} role="group" aria-label="Distance">
        {DISTANCE_PRESETS.map((p) => (
          <WordToggle key={distanceLabel(p)} picked={!custom && sameDistance(p, goal)} onPress={() => onPick(p)} testId={`distance-${p.value}-${p.unit}`}>
            {distanceLabel(p)}
          </WordToggle>
        ))}
        <WordToggle picked={custom} onPress={() => setCustom(true)} testId="distance-custom">
          Custom
        </WordToggle>
      </div>
      {custom && (
        <div className={styles.custom} data-testid="distance-wheel">
          <div className={styles.wheel}>
            <WheelColumn items={DISTANCE_ITEMS} value={value} picked onChange={setValue} label={`Distance in ${wheelUnit === 'mi' ? 'miles' : 'kilometers'}`} rows={3} testId="distance-wheel-column" />
          </div>
          <Segmented
            options={UNITS}
            value={wheelUnit}
            onChange={(u) => {
              setWheelUnit(u);
              onUnit(u);
            }}
            label="Miles or kilometers"
            testId="run-unit"
            block
          />
          <Button onClick={() => onPick({ value, unit: wheelUnit })} data-testid="goal-done">
            {`Set ${distanceLabel({ value, unit: wheelUnit })}`}
          </Button>
        </div>
      )}
    </>
  );
}

function TimePicker({ min, onPick }: { min: number; onPick: (min: number) => void }) {
  const [custom, setCustom] = useState(!isTimePreset(min));
  const [value, setValue] = useState(min);
  return (
    <>
      <div className={styles.presets} role="group" aria-label="Time">
        {TIME_PRESETS_MIN.map((m) => (
          <WordToggle key={m} picked={!custom && m === min} onPress={() => onPick(m)} testId={`time-${m}`}>
            {timeLabel(m)}
          </WordToggle>
        ))}
        <WordToggle picked={custom} onPress={() => setCustom(true)} testId="time-custom">
          Custom
        </WordToggle>
      </div>
      {custom && (
        <div className={styles.custom} data-testid="time-wheel">
          <div className={styles.wheel}>
            <WheelColumn items={TIME_ITEMS} value={value} picked onChange={setValue} label="Time" rows={3} testId="time-wheel-column" />
          </div>
          <Button onClick={() => onPick(value)} data-testid="goal-done">
            {`Set ${timeLabel(value)}`}
          </Button>
        </div>
      )}
    </>
  );
}
