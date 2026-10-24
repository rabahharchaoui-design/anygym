import { useState } from 'react';
import { BodyweightInput } from '../../components/load/BodyweightInput';
import { DumbbellWheel } from '../../components/load/DumbbellWheel';
import { EquipmentWeightSheet } from '../../components/load/EquipmentWeightSheet';
import { PlateDiagram } from '../../components/load/PlateDiagram';
import { PlateMachineInput } from '../../components/load/PlateMachineInput';
import { StackSelector } from '../../components/load/StackSelector';
import { TimedInput } from '../../components/load/TimedInput';
import base from '../../components/load/LoadInput.module.css';
import type { Gym, Load } from '../../db/types';
import { barbellLoad, enabledPlates } from '../../lib/load';
import { barIdFor, machineIdFor } from './exerciseLoad';

type Props = {
  loadType: Load['kind'];
  gym: Gym;
  exerciseId: string;
  exerciseName: string;
  value: Load | null;
  onChange: (load: Load | null) => void;
  /** Timed only: whole seconds held. */
  onSeconds?: (seconds: number) => void;
};

/** The SPEC 5.2 load input for an exercise's load type, on this gym's equipment. */
export function SetLoadInput({ loadType, gym, exerciseId, exerciseName, value, onChange, onSeconds }: Props) {
  switch (loadType) {
    case 'barbell':
      return <BarbellField gym={gym} exerciseName={exerciseName} value={value} onChange={onChange} />;
    case 'dumbbell_each':
    case 'single':
      return <DumbbellWheel unit={gym.unit} range={gym.dumbbellRange} mode={loadType} value={value} onChange={onChange} />;
    case 'stack':
      return <StackSelector gym={gym} machineId={machineIdFor(exerciseId, exerciseName)} value={value} onChange={onChange} />;
    case 'plate_machine':
      return <PlateMachineField gym={gym} machineId={machineIdFor(exerciseId, exerciseName)} value={value} onChange={onChange} />;
    case 'bodyweight':
      return <BodyweightInput unit={gym.unit} value={value} onChange={onChange} />;
    case 'timed':
      return <TimedInput unit={gym.unit} onChange={onChange} onSeconds={onSeconds ?? (() => {})} />;
  }
}

function BarbellField({ gym, exerciseName, value, onChange }: { gym: Gym; exerciseName: string; value: Load | null; onChange: (l: Load | null) => void }) {
  const [perSide, setPerSide] = useState<number[]>(value?.perSide ?? []);
  const [asking, setAsking] = useState(false);
  const barId = barIdFor(exerciseName);
  const bar = gym.bars[barId];
  const change = (next: number[], b: number | null = bar) => {
    setPerSide(next);
    onChange(barbellLoad(b, next, gym.collars, gym.unit));
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
        extraLink={
          barId === 'smith' ? (
            <button type="button" className={`${base.link} pressable`} onClick={() => setAsking(true)}>
              {bar === null ? 'Set bar weight' : 'Bar · Change'}
            </button>
          ) : undefined
        }
      />
      {barId === 'smith' && (
        <EquipmentWeightSheet
          open={asking}
          onClose={() => setAsking(false)}
          gymId={gym.id}
          unit={gym.unit}
          machineId="smith_machine"
          kind="smith"
          onSaved={(g) => change(perSide, g.bars.smith)}
        />
      )}
    </>
  );
}

function PlateMachineField({ gym, machineId, value, onChange }: { gym: Gym; machineId: string; value: Load | null; onChange: (l: Load | null) => void }) {
  const [perSide, setPerSide] = useState<number[]>(value?.perSide ?? []);
  return (
    <PlateMachineInput
      gym={gym}
      machineId={machineId}
      perSide={perSide}
      onChange={(next, load) => {
        setPerSide(next);
        onChange(load);
      }}
    />
  );
}
