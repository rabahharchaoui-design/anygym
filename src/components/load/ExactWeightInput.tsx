import { useState } from 'react';
import type { Load, Unit } from '../../db/types';
import { exactHeldLoad, formatAmount, heldWeightOf } from '../../lib/load';
import { parseTyped, pressKey } from '../../lib/numpad';
import { KettlebellPicture, UprightDumbbellPicture } from './PickerArt';
import { NumPad } from './NumPad';
import base from './LoadInput.module.css';
import styles from './DumbbellWheel.module.css';

type Props = {
  unit: Unit;
  /** Picks the picture: a kettlebell for kettlebell moves, else one weight held upright. */
  exerciseName: string;
  value: Load | null;
  /** The typed weight as a Load (load.ts exactHeldLoad), or null while it is not a weight yet. */
  onChange: (load: Load | null) => void;
  /** The number typed (null for nothing), so a sheet can say why it cannot be saved. */
  onTyped?: (value: number | null) => void;
  /** Short screens (import editor): a smaller readout, the picture beside one helper line. */
  dense?: boolean;
};

/** SPEC 13.6 words for one weight typed exactly. */
export const EXACT_COPY = {
  title: 'One weight · both hands',
  kettlebell: 'Type the weight on your kettlebell',
  other: 'Type the weight you hold',
} as const;

/**
 * One weight typed exactly (PLAN 1.7k): a kettlebell or an implement whose weights this gym does
 * not list. Never the dumbbell range, never rounded: what is typed is what is logged.
 */
export function ExactWeightInput({ unit, exerciseName, value, onChange, onTyped, dense = false }: Props) {
  const own = value?.kind === 'single' && value.unit === unit ? heldWeightOf(value) : null;
  const [text, setText] = useState(own !== null ? formatAmount(own) : '');
  const kettlebell = /kettlebell/i.test(exerciseName);
  const key = (k: Parameters<typeof pressKey>[1]) => {
    const next = pressKey(text, k);
    setText(next);
    const n = parseTyped(next);
    onTyped?.(n);
    onChange(n === null ? null : exactHeldLoad(n, unit));
  };
  return (
    <div className={base.root} data-dense={dense || undefined}>
      <div className={base.readout}>
        <p className={`${base.total} num`} aria-live="polite" data-testid="wheel-total">
          {text ? text : <span className={base.placeholder}>–</span>}
          <span className={base.unit}>{unit}</span>
        </p>
        {dense ? (
          <div className={styles.titleRow}>
            <span className={styles.glyph}>{kettlebell ? <KettlebellPicture /> : <UprightDumbbellPicture />}</span>
            <p className={base.helper} data-testid="picker-title">
              {kettlebell ? EXACT_COPY.kettlebell : EXACT_COPY.other}
            </p>
          </div>
        ) : (
          <>
            <div className={styles.titleRow}>
              <span className={styles.glyph}>{kettlebell ? <KettlebellPicture /> : <UprightDumbbellPicture />}</span>
              <p className={base.label} data-testid="picker-title">
                {EXACT_COPY.title}
              </p>
            </div>
            <p className={base.helper}>{kettlebell ? EXACT_COPY.kettlebell : EXACT_COPY.other}</p>
          </>
        )}
      </div>
      <div role="group" aria-label="Weight">
        <NumPad compact onKey={key} />
      </div>
    </div>
  );
}
