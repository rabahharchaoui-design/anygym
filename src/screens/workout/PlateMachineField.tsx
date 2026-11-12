// A plate loaded machine in the weight sheet (split out of SetLoadInput.tsx, PLAN 3.6v): the plates
// per side it keeps while the picture is edited, and the load they make.
import { useState } from 'react';
import { PlateMachineInput } from '../../components/load/PlateMachineInput';
import type { Gym, Load } from '../../db/types';

export function PlateMachineField({
  gym,
  ownStart,
  machineId,
  plates,
  onChange,
  compact,
  hints,
  drawingShare,
}: {
  gym: Gym;
  /** Edit set: the starting resistance the set was logged with (PLAN 1.7c), used for this edit. */
  ownStart?: number;
  machineId: string;
  plates: readonly number[];
  onChange: (l: Load | null, plates: number[]) => void;
  compact: boolean;
  hints: boolean;
  drawingShare?: number;
}) {
  const [perSide, setPerSide] = useState<number[]>([...plates]);
  return (
    <PlateMachineInput
      hints={hints}
      drawingShare={drawingShare}
      gym={gym}
      ownStart={ownStart}
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
