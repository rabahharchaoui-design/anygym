import { useEffect, useRef, useState } from 'react';
import { BodyweightInput } from '../../components/load/BodyweightInput';
import { DumbbellWheel } from '../../components/load/DumbbellWheel';
import { ExactWeightInput } from '../../components/load/ExactWeightInput';
import { EquipmentWeightSheet } from '../../components/load/EquipmentWeightSheet';
import { PlateDiagram } from '../../components/load/PlateDiagram';
import { PlateMachineInput } from '../../components/load/PlateMachineInput';
import { StackSelector } from '../../components/load/StackSelector';
import { TimedInput } from '../../components/load/TimedInput';
import { InfoButton } from '../../components/info/InfoButton';
import { BarQuestion } from '../../components/load/BarQuestion';
import base from '../../components/load/LoadInput.module.css';
import type { BarId, Collars, Gym, Load } from '../../db/types';
import { saveBarChoice } from '../../db/exerciseSettings';
import { barForName } from '../../lib/loadTypeRule';
import { barbellLoad, enabledPlates, formatWeight } from '../../lib/load';
import type { Stopwatch } from '../../lib/timer';
import { BarChoiceSheet } from './BarChoiceSheet';
import { BAR_NAMES, BAR_PROMPTS, barIdFor, isExactHeld, isHeldPlate, machineIdFor, wheelWeights } from './exerciseLoad';

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
  /** Edit set: the collars the set was logged with (PLAN 1.7f), never today's gym setting. */
  ownCollars?: Collars;
  /** Edit set: an older record's gap (load.ts otherOf), shown until the plates are changed. */
  ownOther?: number;
  /** Tells the screen something went wrong (a toast), with an optional Try again. */
  onNotice?: (text: string, retry?: () => void) => void;
  /** Added weight pads (bodyweight, stack) open in their own sheet (SPEC 13.5, PLAN 1.10e). Default: compact. */
  padInSheet?: boolean;
  /**
   * PLAN 2.0c: true while a bar choice is being saved, false once it settled (landed or failed).
   * The sheet holds Done/Save until then, so the load it confirms is the one the choice ends with.
   */
  onPending?: (pending: boolean) => void;
  /** Exact held weight only: the number typed, so a sheet can say why it cannot be saved. */
  onTyped?: (value: number | null) => void;
  /** Exact held weight only: the short screen layout (import editor). */
  dense?: boolean;
  /** First time hints on the plate picture (off in the import editor: it would cover the chips there). */
  hints?: boolean;
  /** Share of the screen's height the plate drawing may take (the import editor's is smaller). */
  drawingShare?: number;
};

/** The SPEC 5.2 load input for an exercise's load type, on this gym's equipment. */
export function SetLoadInput({ loadType, gym, exerciseId, exerciseName, value, onChange, plates, watch, onWatch, compact = false, targetSeconds, bar, ownBar, ownBarId, ownCollars, ownOther, onNotice, padInSheet = compact, onPending, onTyped, dense, hints = true, drawingShare }: Props) {
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
          ownCollars={ownCollars}
          ownOther={ownOther}
          onNotice={onNotice}
          plates={plates ?? value?.perSide ?? []}
          onChange={onChange}
          compact={compact}
          onPending={onPending}
          hints={hints}
          drawingShare={drawingShare}
        />
      );
    case 'dumbbell_each':
    case 'single':
      // A kettlebell (or an implement the name does not tell) is typed exactly, never the dumbbell range (PLAN 1.7k).
      if (isExactHeld(loadType, exerciseName)) return <ExactWeightInput unit={gym.unit} exerciseName={exerciseName} value={value} onChange={onChange} onTyped={onTyped} dense={dense} />;
      return (
        <DumbbellWheel
          unit={gym.unit}
          range={gym.dumbbellRange}
          mode={loadType}
          value={value}
          onChange={onChange}
          exerciseName={exerciseName}
          // A held plate picks from the enabled plates, never the dumbbell range (PLAN 1.7j).
          {...(isHeldPlate(loadType, exerciseName) ? { weights: wheelWeights(gym, loadType, exerciseName), plate: true } : {})}
        />
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
          hints={hints}
          drawingShare={drawingShare}
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
  ownCollars,
  ownOther,
  onNotice,
  plates,
  onChange,
  compact,
  onPending,
  hints,
  drawingShare,
}: {
  gym: Gym;
  exerciseId: string;
  exerciseName: string;
  chosen?: BarId;
  ownBar?: number;
  ownBarId?: BarId;
  ownCollars?: Collars;
  ownOther?: number;
  onNotice?: (text: string, retry?: () => void) => void;
  plates: readonly number[];
  onChange: (l: Load | null, plates: number[]) => void;
  compact: boolean;
  onPending?: (pending: boolean) => void;
  hints: boolean;
  drawingShare?: number;
}) {
  const [perSide, setPerSide] = useState<number[]>([...plates]);
  // The plates as the user has them right now, updated in the same step as every change (PLAN
  // 2.0c): a bar choice or bar answer that completes later reads these, never the plates captured
  // when it started, so plates added meanwhile are kept.
  const platesNow = useRef<number[]>([...plates]);
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
    // The set's own bar, even when that bar's weight here changed since (PLAN 1.7h); a record
    // from before bar ids is matched by its weight.
    id: ownBar === undefined ? undefined : (ownBarId ?? matchBar(gym, ownBar, barIdFor(exerciseName, chosen))),
    weight: ownBar ?? null,
  }));
  const barId = local ? (localBar.id ?? barIdFor(exerciseName, chosen)) : barIdFor(exerciseName, picked);
  const bar = local ? localBar.weight : gym.bars[barId];
  // Edit set: the set's own collars, so a set lifted with collars keeps its total (PLAN 1.7f).
  const collars = (local && ownCollars) || gym.collars;
  // Edit set: the stored total stays as it is until the plates or bar change (PLAN 1.7f).
  const [untouched, setUntouched] = useState(true);
  const other = local && untouched ? (ownOther ?? 0) : 0;
  const prompt = BAR_PROMPTS[barId];
  const askPrompt = BAR_PROMPTS[askBar];
  // The bar it is lifted on goes with the load (PLAN 1.7c), so Smith sets keep their own history.
  // A bar just picked is passed in with its weight (PLAN 1.7h): state set in the same tap is not read yet.
  const change = (next: number[], b: number | null = bar, id: BarId = local ? (localBar.id ?? ownBarId ?? barIdFor(exerciseName, chosen)) : barIdFor(exerciseName, picked)) => {
    platesNow.current = next;
    setPerSide(next);
    setUntouched(false);
    onChange(barbellLoad(b, next, collars, gym.unit, id), next);
  };
  // Bar choices are saved one after another and only the latest one is applied (PLAN 2.0c): an
  // older choice that completes late never overwrites a newer one, in the picker or in Dexie.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);
  const alive = useRef(true);
  const gymNow = useRef(gym);
  gymNow.current = gym;
  // The latest render's change (its collars and unit), for completions that land later.
  const changeNow = useRef(change);
  changeNow.current = change;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Gone while a choice was saving (closed, or started over): the sheet is not held for it.
      if (pendingCount.current > 0) {
        pendingCount.current = 0;
        onPendingNow.current?.(false);
      }
    };
  }, []);
  const onPendingNow = useRef(onPending);
  onPendingNow.current = onPending;
  const pendingCount = useRef(0);
  const setPending = (delta: number) => {
    const was = pendingCount.current > 0;
    pendingCount.current += delta;
    const is = pendingCount.current > 0;
    if (was !== is && alive.current) onPending?.(is);
  };
  /**
   * Workout: saved per exercise and gym first; only once that landed do the picker and the load
   * change, so a failed save leaves both as they were and says so. Edit set: this edit only.
   */
  const choose = async (id: BarId, weight: number | null) => {
    if (local) {
      setLocalBar({ id, weight });
      change(platesNow.current, weight, id);
      return;
    }
    const mine = ++latest.current;
    setPending(1);
    const unit = gym.unit;
    const save = chain.current.then(() => (mine === latest.current ? saveBarChoice(exerciseId, gym.id, id, undefined, barForName(exerciseName)) : undefined));
    chain.current = save.catch(() => undefined);
    try {
      await save;
    } catch {
      if (alive.current && mine === latest.current) onNotice?.('Could not save the bar choice', () => void choose(id, weight));
      return;
    } finally {
      setPending(-1);
    }
    // Closed, a newer choice, or the gym's unit changed meanwhile: this completion changes nothing.
    if (!alive.current || mine !== latest.current || unit !== gymNow.current.unit) return;
    setPicked(id);
    changeNow.current(platesNow.current, weight, id);
  };
  // EZ, trap and Smith weights are asked once (first use prompt); until then: "Set bar weight".
  const unknown = bar === null && !!prompt;
  // Read as "Change bar, Olympic 45 lb": the action first, then which bar it is now (2.0d critic r3).
  const what = [local && !localBar.id ? null : BAR_NAMES[barId], bar === null ? null : formatWeight(bar, gym.unit)].filter(Boolean).join(' ');
  const label = what ? `Change bar, ${what}` : 'Change bar';
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
  // In a sheet, an unknown EZ, trap or Smith bar is asked right on top (BarQuestion); the link below
  // then only changes which bar it is.
  const question = unknown && !compact && !local;
  const link = compact ? (
    prompt && (
      <span className={base.linkWithInfo}>
        <button type="button" className={`${base.link} pressable`} onClick={() => ask(barId)}>
          {unknown ? 'Set bar weight' : 'Bar weight · Change'}
        </button>
        {info}
      </span>
    )
  ) : null;
  // In a sheet the bar control sits under the total, above the drawing, never behind Done (1.7e).
  // While the bar question is up it is the one thing to answer; Change bar follows once it is.
  const mathAction = !compact && !question && (
    <span className={base.mathAction}>
      <button
        type="button"
        className={`${base.mathLink} pressable`}
        onClick={() => (unknown && !question ? ask(barId) : setPicking(true))}
        aria-label={unknown && !question ? 'Set bar weight' : label}
        data-testid="bar-link"
      >
        {unknown && !question ? 'Set bar weight' : 'Change bar'}
      </button>
      {!question && info}
    </span>
  );
  return (
    <>
      {question && prompt && (
        <BarQuestion
          gymId={gym.id}
          unit={gym.unit}
          machineId={prompt.machineId}
          kind={prompt.kind}
          info={prompt.info}
          onSaved={(g) => alive.current && g.unit === gymNow.current.unit && changeNow.current(platesNow.current, g.bars[barId])}
          onOther={() => ask(barId)}
          dense={drawingShare !== undefined}
        />
      )}
      <PlateDiagram
        unit={gym.unit}
        bar={bar}
        inventory={enabledPlates(gym.plateInventory)}
        collars={collars}
        other={other}
        colorMode={gym.plateColors}
        value={perSide}
        onChange={(next) => change(next)}
        compact={compact}
        extraLink={link || undefined}
        mathAction={mathAction || undefined}
        hint={!question && hints}
        tight={question}
        drawingShare={drawingShare}
        corner={chip || undefined}
        barId={barId}
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
          onSaved={(g) => {
            // The latest plates; an answer for a gym whose unit changed since is not applied here (PLAN 2.0c).
            if (!alive.current || g.unit !== gymNow.current.unit) return;
            if (askBar === barId && !local) changeNow.current(platesNow.current, g.bars[askBar]);
            else void choose(askBar, g.bars[askBar]);
          }}
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
