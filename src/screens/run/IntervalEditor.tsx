import { useState } from 'react';
import { BLOCK_NAMES, blockEffort, blockLabel, blockTime, CUSTOM_BOUNDS as B, planSeconds, type IntervalBlock, type IntervalPlan } from '../../lib/run';
import { tick } from '../../ui/haptics';
import { Chip } from '../../ui/Chip';
import { ChevronDown, PassIcon, PlusIcon, XIcon } from '../../ui/icons';
import styles from './Intervals.module.css';

type Props = { plan: IntervalPlan; onChange: (plan: IntervalPlan) => void };

type StepProps = { value: string; label: string; onLess: () => void; onMore: () => void; canLess: boolean; canMore: boolean; testId: string };

/** − value +, every button 48 pt. */
function Stepper({ value, label, onLess, onMore, canLess, canMore, testId }: StepProps) {
  const press = (go: () => void) => () => {
    tick();
    go();
  };
  return (
    <span className={styles.stepper} role="group" aria-label={label}>
      <button type="button" className={styles.stepBtn} aria-label={`${label}: less`} disabled={!canLess} onClick={press(onLess)} data-testid={`${testId}-less`}>
        <span>
          <PassIcon width={18} height={18} strokeWidth={2.6} aria-hidden="true" />
        </span>
      </button>
      <span className={`${styles.stepValue} num`} data-testid={`${testId}-value`} aria-live="polite">
        {value}
      </span>
      <button type="button" className={styles.stepBtn} aria-label={`${label}: more`} disabled={!canMore} onClick={press(onMore)} data-testid={`${testId}-more`}>
        <span>
          <PlusIcon width={18} height={18} strokeWidth={2.6} aria-hidden="true" />
        </span>
      </button>
    </span>
  );
}

/**
 * Custom intervals (SPEC 12.7): up to four blocks, each a name and a length, done a number of
 * times. All taps. A block's name is picked from the words the voice coach has recorded, so every
 * block is said in the same voice.
 */
export function IntervalEditor({ plan, onChange }: Props) {
  const [naming, setNaming] = useState<number | null>(null);
  const setBlock = (i: number, patch: Partial<IntervalBlock>) => onChange({ ...plan, blocks: plan.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const add = () => {
    const last = plan.blocks[plan.blocks.length - 1]!;
    // The new block is the other kind of the one before it: a push after an easy one, and the other way round.
    onChange({ ...plan, blocks: [...plan.blocks, { name: blockEffort(last.name) === 'push' ? 'walk' : 'run', sec: 60 }] });
  };
  const remove = (i: number) => {
    setNaming(null);
    onChange({ ...plan, blocks: plan.blocks.filter((_, j) => j !== i) });
  };
  return (
    <div className={styles.editor} data-testid="interval-editor">
      {plan.blocks.map((b, i) => (
        <div key={i}>
          <div className={styles.block} data-testid={`block-${i}`}>
            <button type="button" className={styles.blockName} data-effort={blockEffort(b.name)} aria-expanded={naming === i} aria-label={`Block ${i + 1}: ${blockLabel(b.name)}. Change the name`} onClick={() => setNaming(naming === i ? null : i)} data-testid={`block-${i}-name`}>
              {blockLabel(b.name)}
              <ChevronDown width={16} height={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <Stepper
              value={blockTime(b.sec)}
              label={`${blockLabel(b.name)} time`}
              onLess={() => setBlock(i, { sec: b.sec - B.stepSec })}
              onMore={() => setBlock(i, { sec: b.sec + B.stepSec })}
              canLess={b.sec > B.minSec}
              canMore={b.sec < B.maxSec}
              testId={`block-${i}-time`}
            />
            {plan.blocks.length > B.minBlocks && (
              <button type="button" className={styles.stepBtn} aria-label={`Remove block ${i + 1}`} onClick={() => remove(i)} data-testid={`block-${i}-remove`}>
                <XIcon width={18} height={18} strokeWidth={2.4} aria-hidden="true" />
              </button>
            )}
          </div>
          {naming === i && (
            <div className={styles.names} role="group" aria-label="Block name" data-testid="block-names">
              {BLOCK_NAMES.map((n) => (
                <Chip key={n.id} label={n.label} picked={b.name === n.id} onPress={() => (setBlock(i, { name: n.id }), setNaming(null))} block small testId={`block-name-${n.id}`} />
              ))}
            </div>
          )}
        </div>
      ))}
      <div className={styles.block}>
        <span className={styles.rowLabel}>Repeat</span>
        <Stepper
          value={plan.rounds === 1 ? 'once' : `${plan.rounds} times`}
          label="Repeat"
          onLess={() => onChange({ ...plan, rounds: plan.rounds - 1 })}
          onMore={() => onChange({ ...plan, rounds: plan.rounds + 1 })}
          canLess={plan.rounds > B.minRounds}
          canMore={plan.rounds < B.maxRounds}
          testId="rounds"
        />
      </div>
      <div className={styles.editorFoot}>
        {plan.blocks.length < B.maxBlocks ? (
          <button type="button" className={styles.link} onClick={add} data-testid="block-add">
            <PlusIcon width={18} height={18} strokeWidth={2.4} aria-hidden="true" />
            Add a block
          </button>
        ) : (
          <span />
        )}
        <span className={`${styles.total} num`} data-testid="interval-total">
          {blockTime(planSeconds(plan))} in all
        </span>
      </div>
    </div>
  );
}
