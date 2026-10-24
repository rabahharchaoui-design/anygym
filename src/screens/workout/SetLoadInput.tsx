import { useState } from 'react';
import { BodyweightInput } from '../../components/load/BodyweightInput';
import { DumbbellWheel } from '../../components/load/DumbbellWheel';
import { EquipmentWeightSheet } from '../../components/load/EquipmentWeightSheet';
import { PlateDiagram } from '../../components/load/PlateDiagram';
import { PlateMachineInput } from '../../components/load/PlateMachineInput';
import { StackSelector } from '../../components/load/StackSelector';
import { TimedInput } from '../../components/load/TimedInput';
import { InfoButton } from '../../components/info/InfoButton';
import base from '../../components/load/LoadInput.module.css';
import type { Gym, Load } from '../../db/types';
import { barbellLoad, enabledPlates } from '../../lib/load';
import type { Stopwatch } from '../../lib/timer';
import { BAR_PROMPTS, barIdFor, machineIdFor } from './exerciseLoad';

type Props = {
  loadType: Load['kind'];
  gym: Gym;
  exerciseId: string;
  exerciseName: string;
  value: Load | null;
  /** `plates`: the plates per side on a bar or machine horn, also while the base weight is unknown. */
  onChange: (load: Load | null, plates?: number[]) => void;
  /** Bar and machine: the plates to start from (a saved draft); defaults to value's plates. */
  plates?: readonly number[];
  /** Timed: the stopwatch, owned by the card. */
  watch?: Stopwatch;
  onWatch?: (watch: Stopwatch) => void;
  /** Workout size (SPEC 13.5): the plate diagram shrinks and pads open in sheets to fit one screen. */
  compact?: boolean;
  /** Timed only: the plan's hold, drawn as a ring. */
  targetSeconds?: number;
};

/** The SPEC 5.2 load input for an exercise's load type, on this gym's equipment. */
export function SetLoadInput({ loadType, gym, exerciseId, exerciseName, value, onChange, plates, watch, onWatch, compact = false, targetSeconds }: Props) {
  switch (loadType) {
    case 'barbell':
      return <BarbellField gym={gym} exerciseName={exerciseName} plates={plates ?? value?.perSide ?? []} onChange={onChange} compact={compact} />;
    case 'dumbbell_each':
    case 'single':
      return (
        <DumbbellWheel unit={gym.unit} range={gym.dumbbellRange} mode={loadType} value={value} onChange={onChange} exerciseName={exerciseName} />
      );
    case 'stack':
      return <StackSelector gym={gym} machineId={machineIdFor(exerciseId, exerciseName)} value={value} onChange={onChange} />;
    case 'plate_machine':
      return (
        <PlateMachineField
          gym={gym}
          machineId={machineIdFor(exerciseId, exerciseName)}
          plates={plates ?? value?.perSide ?? []}
          onChange={onChange}
          compact={compact}
        />
      );
    case 'bodyweight':
      return <BodyweightInput unit={gym.unit} value={value} onChange={onChange} padInSheet={compact} />;
    case 'timed':
      return <TimedInput unit={gym.unit} targetSeconds={targetSeconds} watch={watch} onWatch={onWatch} />;
  }
}

function BarbellField({
  gym,
  exerciseName,
  plates,
  onChange,
  compact,
}: {
  gym: Gym;
  exerciseName: string;
  plates: readonly number[];
  onChange: (l: Load | null, plates: number[]) => void;
  compact: boolean;
}) {
  const [perSide, setPerSide] = useState<number[]>([...plates]);
  const [asking, setAsking] = useState(false);
  const barId = barIdFor(exerciseName);
  const bar = gym.bars[barId];
  // EZ, trap and Smith bars vary by brand: their weight comes from the first use prompt (SPEC 5.3).
  const prompt = BAR_PROMPTS[barId];
  const change = (next: number[], b: number | null = bar) => {
    setPerSide(next);
    onChange(barbellLoad(b, next, gym.collars, gym.unit), next);
  };
  return (
    <>
      <PlateDiagram
        unit={gym.unit}
        bar={bar}
        inventory={enabledPlates(gym.plateInventory)}
        collars={gym.collars}
        colorMode={gym.plateColors}
        value={perSide}
        onChange={(next) => change(next)}
        compact={compact}
        extraLink={
          prompt ? (
            <span className={base.linkWithInfo}>
              <button type="button" className={`${base.link} pressable`} onClick={() => setAsking(true)}>
                {bar === null ? 'Set bar weight' : 'Bar · Change'}
              </button>
              <InfoButton id={prompt.info} />
            </span>
          ) : undefined
        }
      />
      {prompt && (
        <EquipmentWeightSheet
          open={asking}
          onClose={() => setAsking(false)}
          gymId={gym.id}
          unit={gym.unit}
          machineId={prompt.machineId}
          kind={prompt.kind}
          onSaved={(g) => change(perSide, g.bars[barId])}
        />
      )}
    </>
  );
}

function PlateMachineField({
  gym,
  machineId,
  plates,
  onChange,
  compact,
}: {
  gym: Gym;
  machineId: string;
  plates: readonly number[];
  onChange: (l: Load | null, plates: number[]) => void;
  compact: boolean;
}) {
  const [perSide, setPerSide] = useState<number[]>([...plates]);
  return (
    <PlateMachineInput
      gym={gym}
      machineId={machineId}
      perSide={perSide}
      compact={compact}
      onChange={(next, load) => {
        setPerSide(next);
        onChange(load, next);
      }}
    />
  );
}
