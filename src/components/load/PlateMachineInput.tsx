import { useState } from 'react';
import { machineStartFor } from '../../db/gyms';
import type { Gym, Load } from '../../db/types';
import { enabledPlates, formatWeight, machineBase, plateMachineLoad } from '../../lib/load';
import { EquipmentWeightSheet } from './EquipmentWeightSheet';
import { PlateDiagram } from './PlateDiagram';
import base from './LoadInput.module.css';

type Props = {
  gym: Gym;
  /** Machine id, e.g. 'leg_press'. Its starting resistance comes from the first use prompt. */
  machineId: string;
  /** One horn's plates, heaviest first. */
  perSide: readonly number[];
  /** load is null while the starting resistance is unknown (the UI shows "+ start"). */
  onChange: (perSide: number[], load: Load | null) => void;
  /** Workout size plate diagram (SPEC 13.5). */
  compact?: boolean;
};

/** Plate loaded machine (SPEC 5.2): the plate diagram on one horn, "per side", plus the starting resistance. */
export function PlateMachineInput({ gym, machineId, perSide, onChange, compact = false }: Props) {
  const [asking, setAsking] = useState(false);
  const unit = gym.unit;
  const start = machineBase(machineStartFor(gym, machineId));

  const change = (next: number[], s: number | null = start) => onChange(next, plateMachineLoad(s, next, unit));

  const linkText = start === null ? 'Set starting weight' : start === 0 ? 'Plates only · Change' : `Start ${formatWeight(start, unit)} · Change`;

  return (
    <>
      <PlateDiagram
        variant="horn"
        compact={compact}
        unit={unit}
        bar={start}
        inventory={enabledPlates(gym.plateInventory)}
        collars="none"
        colorMode={gym.plateColors}
        value={perSide}
        onChange={(next) => change(next)}
        extraLink={
          <button type="button" className={`${base.link} pressable`} onClick={() => setAsking(true)}>
            {linkText}
          </button>
        }
      />
      <EquipmentWeightSheet
        open={asking}
        onClose={() => setAsking(false)}
        gymId={gym.id}
        unit={unit}
        machineId={machineId}
        kind="plate_machine"
        onSaved={(g) => change([...perSide], machineBase(machineStartFor(g, machineId)))}
      />
    </>
  );
}
