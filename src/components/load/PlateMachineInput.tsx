import { useRef, useState } from 'react';
import { machineHornsFor, machineStartFor } from '../../db/gyms';
import type { Gym, Load } from '../../db/types';
import { enabledPlates, formatWeight, machineBase, plateMachineLoad, type Horns } from '../../lib/load';
import { EquipmentWeightSheet } from './EquipmentWeightSheet';
import { PlateDiagram } from './PlateDiagram';
import { SidesQuestion, StartQuestion } from './BarQuestion';
import { InfoButton } from '../info/InfoButton';
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
  /**
   * Edit set (PLAN 1.7c): the starting resistance the set was logged with. The diagram and the
   * saved load both use it, so an old set never changes weight because the machine's answer did.
   */
  ownStart?: number;
  /** The machine's first time hint (off in the import editor). */
  hints?: boolean;
  /** Share of the screen's height the drawing may take (import editor). */
  drawingShare?: number;
  /** What the machine's data says for sure about its sides (a leg press sled: 2), else undefined (PLAN 3.6h2). */
  sureHorns?: Horns;
  /** Edit set: the sides the set was counted on (its own snapshot), never today's answer (PLAN 3.6h2). */
  ownHorns?: Horns;
};

/**
 * Plate loaded machine (SPEC 5.2): the plate diagram on one horn, "per side". The first time, the
 * machine's starting weight is asked right on top, like the Smith bar (2.0d critic); after that a
 * small "Change start" link sits under the total, where Change bar sits for a barbell.
 */
export function PlateMachineInput({ gym, machineId, perSide, onChange, compact = false, ownStart, hints = true, drawingShare, sureHorns, ownHorns }: Props) {
  const [asking, setAsking] = useState(false);
  // The sides answered here, ahead of the gym record catching up (PLAN 3.6h2).
  const [answered, setAnswered] = useState<Horns | null>(null);
  // The plates as they are right now: a start answer saves asynchronously, and plates added or
  // removed meanwhile must not be put back by the stale closure (Codex 2.0d review).
  const plates = useRef(perSide);
  plates.current = perSide;
  const unit = gym.unit;
  const start = ownStart !== undefined ? ownStart : machineBase(machineStartFor(gym, machineId));

  // Not known yet (PLAN 3.7a): no load and no total while the card asks; the plates are kept and
  // load.ts totals them the moment the answer is in. Never both sides by default.
  const known = ownHorns ?? answered ?? machineHornsFor(gym, machineId, sureHorns);
  const change = (next: number[], s: number | null = start, h: Horns | null = known) => onChange(next, h === null ? null : plateMachineLoad(s, next, unit, undefined, h));
  const sides = (g: Gym, h: Horns) => {
    setAnswered(h);
    if (g.unit === unit) change([...plates.current], machineBase(machineStartFor(g, machineId)), h);
  };

  const question = start === null && ownStart === undefined;
  // One calm flow (PLAN 3.6h2): the start first, then, in the same place, one side or both.
  const askSides = !question && known === null;
  // Read by screen readers and tests as before ("Start 110 lb · Change"); seen as "Change start".
  const linkLabel = start === 0 ? 'Plates only · Change' : start !== null ? `Start ${formatWeight(start, unit)} · Change` : 'Set starting weight';
  const action =
    ownStart !== undefined || question || askSides ? undefined : (
      <span className={base.mathAction}>
        <button type="button" className={`${base.mathLink} pressable`} onClick={() => setAsking(true)} aria-label={linkLabel}>
          Change start
        </button>
        <InfoButton id="plate-loaded-machine" />
      </span>
    );

  return (
    <>
      {question && (
        <StartQuestion
          gymId={gym.id}
          unit={unit}
          machineId={machineId}
          onSaved={(g) => g.unit === unit && change([...plates.current], machineBase(machineStartFor(g, machineId)))}
          onOther={() => setAsking(true)}
          dense={drawingShare !== undefined}
        />
      )}
      {askSides && <SidesQuestion gymId={gym.id} machineId={machineId} onSaved={sides} dense={drawingShare !== undefined} />}
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
        mathAction={action}
        hint={!question && !askSides && hints}
        tight={question || askSides}
        horns={known}
        drawingShare={drawingShare}
      />
      <EquipmentWeightSheet
        open={asking}
        onClose={() => setAsking(false)}
        gymId={gym.id}
        unit={unit}
        machineId={machineId}
        kind="plate_machine"
        onSaved={(g) => change([...plates.current], machineBase(machineStartFor(g, machineId)))}
        sides={ownStart === undefined ? { horns: known, onSaved: sides } : undefined}
      />
    </>
  );
}
