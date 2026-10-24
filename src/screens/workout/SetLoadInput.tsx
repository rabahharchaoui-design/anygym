import { useEffect, useState } from 'react';
import { BodyweightInput } from '../../components/load/BodyweightInput';
import { DumbbellWheel } from '../../components/load/DumbbellWheel';
import { EquipmentWeightSheet } from '../../components/load/EquipmentWeightSheet';
import { PlateDiagram } from '../../components/load/PlateDiagram';
import { PlateMachineInput } from '../../components/load/PlateMachineInput';
import { StackSelector } from '../../components/load/StackSelector';
import { TimedInput } from '../../components/load/TimedInput';
import { InfoButton } from '../../components/info/InfoButton';
import base from '../../components/load/LoadInput.module.css';
import type { BarId, Gym, Load } from '../../db/types';
import { saveBarChoice } from '../../db/exerciseSettings';
import { barbellLoad, enabledPlates, formatWeight } from '../../lib/load';
import type { Stopwatch } from '../../lib/timer';
import { BarChoiceSheet } from './BarChoiceSheet';
import { BAR_NAMES, BAR_PROMPTS, barIdFor, machineIdFor } from './exerciseLoad';

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
  /** Barbell: the bar picked for this exercise at this gym (PLAN 1.10d); undefined = the name rule. */
  bar?: BarId;
  /**
   * Barbell, Edit set: the bar weight the set was logged with. The diagram starts from it and a
   * bar picked here applies to this edit only (the exercise's bar choice is not changed).
   */
  ownBar?: number;
  /** Edit set: the bar the set was logged on (PLAN 1.7c), kept unless another bar is picked. */
  ownBarId?: BarId;
  /** Tells the screen something went wrong (a toast), with an optional Try again. */
  onNotice?: (text: string, retry?: () => void) => void;
  /** Added weight pads (bodyweight, stack) open in their own sheet (SPEC 13.5, PLAN 1.10e). Default: compact. */
  padInSheet?: boolean;
};

/** The SPEC 5.2 load input for an exercise's load type, on this gym's equipment. */
export function SetLoadInput({ loadType, gym, exerciseId, exerciseName, value, onChange, plates, watch, onWatch, compact = false, targetSeconds, bar, ownBar, ownBarId, onNotice, padInSheet = compact }: Props) {
  switch (loadType) {
    case 'barbell':
      return (
        <BarbellField
          gym={gym}
          exerciseId={exerciseId}
          exerciseName={exerciseName}
          chosen={bar}
          ownBar={ownBar}
          ownBarId={ownBarId}
          onNotice={onNotice}
          plates={plates ?? value?.perSide ?? []}
          onChange={onChange}
          compact={compact}
        />
      );
    case 'dumbbell_each':
    case 'single':
      return (
        <DumbbellWheel unit={gym.unit} range={gym.dumbbellRange} mode={loadType} value={value} onChange={onChange} exerciseName={exerciseName} />
      );
    case 'stack':
      return <StackSelector gym={gym} machineId={machineIdFor(exerciseId, exerciseName)} value={value} onChange={onChange} padInSheet={padInSheet} />;
    case 'plate_machine':
      return (
        <PlateMachineField
          gym={gym}
          ownStart={ownBar}
          machineId={machineIdFor(exerciseId, exerciseName)}
          plates={plates ?? value?.perSide ?? []}
          onChange={onChange}
          compact={compact}
        />
      );
    case 'bodyweight':
      return <BodyweightInput unit={gym.unit} value={value} onChange={onChange} padInSheet={padInSheet} />;
    case 'timed':
      return <TimedInput unit={gym.unit} targetSeconds={targetSeconds} watch={watch} onWatch={onWatch} />;
  }
}

/** Which of the gym's bars has this weight (the exercise's own bar first), or undefined. */
function matchBar(gym: Gym, weight: number, preferred: BarId): BarId | undefined {
  if (gym.bars[preferred] === weight) return preferred;
  return (Object.keys(BAR_NAMES) as BarId[]).find((id) => gym.bars[id] === weight);
}

function BarbellField({
  gym,
  exerciseId,
  exerciseName,
  chosen,
  ownBar,
  ownBarId,
  onNotice,
  plates,
  onChange,
  compact,
}: {
  gym: Gym;
  exerciseId: string;
  exerciseName: string;
  chosen?: BarId;
  ownBar?: number;
  ownBarId?: BarId;
  onNotice?: (text: string, retry?: () => void) => void;
  plates: readonly number[];
  onChange: (l: Load | null, plates: number[]) => void;
  compact: boolean;
}) {
  const [perSide, setPerSide] = useState<number[]>([...plates]);
  const [picking, setPicking] = useState(false);
  // The brand dependent bar whose weight is asked (SPEC 5.3); stays set while the sheet slides away.
  const [asking, setAsking] = useState(false);
  const [askBar, setAskBar] = useState<BarId>(() => barIdFor(exerciseName, chosen));
  const ask = (id: BarId) => {
    setAskBar(id);
    setAsking(true);
  };
  const [picked, setPicked] = useState<BarId | undefined>(chosen);
  useEffect(() => setPicked(chosen), [chosen]);
  // Edit set: this edit's own bar, starting from the weight the set was logged with.
  const local = ownBar !== undefined;
  const [localBar, setLocalBar] = useState<{ id?: BarId; weight: number | null }>(() => ({
    id: ownBar === undefined ? undefined : ownBarId && gym.bars[ownBarId] === ownBar ? ownBarId : matchBar(gym, ownBar, barIdFor(exerciseName, chosen)),
    weight: ownBar ?? null,
  }));
  const barId = local ? (localBar.id ?? barIdFor(exerciseName, chosen)) : barIdFor(exerciseName, picked);
  const bar = local ? localBar.weight : gym.bars[barId];
  const prompt = BAR_PROMPTS[barId];
  const askPrompt = BAR_PROMPTS[askBar];
  const change = (next: number[], b: number | null = bar) => {
    setPerSide(next);
    // The bar it is lifted on goes with the load (PLAN 1.7c), so Smith sets keep their own history.
    const id = local ? (localBar.id ?? ownBarId ?? barIdFor(exerciseName, chosen)) : barIdFor(exerciseName, picked);
    onChange(barbellLoad(b, next, gym.collars, gym.unit, id), next);
  };
  /**
   * Workout: saved per exercise and gym first; only once that landed do the picker and the load
   * change, so a failed save leaves both as they were and says so. Edit set: this edit only.
   */
  const choose = async (id: BarId, weight: number | null) => {
    if (local) {
      setLocalBar({ id, weight });
      change(perSide, weight);
      return;
    }
    try {
      await saveBarChoice(exerciseId, gym.id, id);
    } catch {
      onNotice?.('Could not save the bar choice', () => void choose(id, weight));
      return;
    }
    setPicked(id);
    change(perSide, weight);
  };
  // EZ, trap and Smith weights are asked once (first use prompt); until then: "Set bar weight".
  const unknown = bar === null && !!prompt;
  const name = local && !localBar.id ? 'Bar' : `Bar: ${BAR_NAMES[barId]}`;
  const label = `${name}${bar === null ? '' : ` ${formatWeight(bar, gym.unit)}`} · Change`;
  const info = prompt && <InfoButton id={prompt.info} />;
  // Workout size: the bar picker sits in the drawing's free corner (the card still fits one
  // screen); EZ, trap and Smith keep their weight link and ⓘ under the tray.
  const chip = compact && (
    <button type="button" className={`${base.barChip} pressable`} onClick={() => setPicking(true)} aria-label={label} data-testid="bar-link">
      <span className={base.barChipCaption}>Bar</span>
      <span className={base.barChipName}>{BAR_NAMES[barId]}</span>
      <span className={base.barChipAction}>Change</span>
    </button>
  );
  const link = compact ? (
    prompt && (
      <span className={base.linkWithInfo}>
        <button type="button" className={`${base.link} pressable`} onClick={() => ask(barId)}>
          {unknown ? 'Set bar weight' : 'Bar weight · Change'}
        </button>
        {info}
      </span>
    )
  ) : (
    <span className={base.linkWithInfo}>
      <button type="button" className={`${base.link} pressable`} onClick={() => (unknown ? ask(barId) : setPicking(true))} data-testid="bar-link">
        {unknown ? 'Set bar weight' : label}
      </button>
      {info}
    </span>
  );
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
        extraLink={link || undefined}
        corner={chip || undefined}
      />
      <BarChoiceSheet
        open={picking}
        onClose={() => setPicking(false)}
        gym={gym}
        exerciseName={exerciseName}
        current={barId}
        onPick={(id) => {
          setPicking(false);
          void choose(id, gym.bars[id]);
        }}
        onAsk={(id) => {
          setPicking(false);
          ask(id);
        }}
      />
      {askPrompt && (
        <EquipmentWeightSheet
          open={asking}
          onClose={() => setAsking(false)}
          gymId={gym.id}
          unit={gym.unit}
          machineId={askPrompt.machineId}
          kind={askPrompt.kind}
          onSaved={(g) => (askBar === barId && !local ? change(perSide, g.bars[askBar]) : void choose(askBar, g.bars[askBar]))}
        />
      )}
    </>
  );
}

function PlateMachineField({
  gym,
  ownStart,
  machineId,
  plates,
  onChange,
  compact,
}: {
  gym: Gym;
  /** Edit set: the starting resistance the set was logged with (PLAN 1.7c), used for this edit. */
  ownStart?: number;
  machineId: string;
  plates: readonly number[];
  onChange: (l: Load | null, plates: number[]) => void;
  compact: boolean;
}) {
  const [perSide, setPerSide] = useState<number[]>([...plates]);
  return (
    <PlateMachineInput
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
