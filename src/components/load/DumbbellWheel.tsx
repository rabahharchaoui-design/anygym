import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { DumbbellRange, Load, Unit } from '../../db/types';
import { dumbbellLoad, dumbbellsInRange, formatAmount, formatWeight, heldWeightOf, singleLoad } from '../../lib/load';
import { SPRING } from '../motion';
import base from './LoadInput.module.css';
import styles from './DumbbellWheel.module.css';

type Props = {
  unit: Unit;
  /** The gym's dumbbell range; null = the gym has no dumbbells. */
  range: DumbbellRange | null;
  /** 'dumbbell_each': a pair, label "each hand". 'single': one held weight, label "held". */
  mode: 'dumbbell_each' | 'single';
  value: Load | null;
  onChange: (load: Load) => void;
};

/** Item pitch in px. The wheel pads half the track on each side so every item can sit centered. */
const ITEM = 68;
const SETTLE_MS = 110;

/** Dumbbell wheel (SPEC 5.2): a horizontal snapping wheel over the gym's dumbbell range. */
export function DumbbellWheel({ unit, range, mode, value, onChange }: Props) {
  if (!range) {
    return (
      <div className={base.empty}>
        <p>No dumbbells set for this gym</p>
        <Link to="/settings" className={`${base.emptyLink} pressable`}>
          Set them in Settings
        </Link>
      </div>
    );
  }
  return <Wheel unit={unit} range={range} mode={mode} value={value} onChange={onChange} />;
}

function Wheel({ unit, range, mode, value, onChange }: Props & { range: DumbbellRange }) {
  const reduce = useReducedMotion();
  const weights = useMemo(() => dumbbellsInRange(range), [range]);
  const selected = value?.kind === mode ? heldWeightOf(value) : null;
  const selectedIndex = selected === null ? -1 : weights.indexOf(selected);
  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number>(undefined);
  /** Set while we scroll on purpose (mount, tap) so the settle handler does not pick for the user. */
  const programmatic = useRef(false);
  const [centered, setCentered] = useState(Math.max(0, selectedIndex));

  const scrollToIndex = (i: number, smooth: boolean) => {
    const el = trackRef.current;
    if (!el) return;
    const left = i * ITEM;
    if (Math.abs(el.scrollLeft - left) < 1) return;
    programmatic.current = true;
    el.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  };

  // Keep the wheel on the selected weight when it changes from outside (and on mount).
  useLayoutEffect(() => {
    if (selectedIndex < 0 || programmatic.current) return;
    setCentered(selectedIndex);
    scrollToIndex(selectedIndex, false);
  }, [selectedIndex, weights]);

  useLayoutEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const pick = (i: number) => {
    const w = weights[i];
    if (w === undefined) return;
    setCentered(i);
    if (w !== selected) {
      onChange(mode === 'dumbbell_each' ? dumbbellLoad(w, unit) : singleLoad(w, unit));
      navigator.vibrate?.(6);
    }
  };

  const onScroll = () => {
    const el = trackRef.current!;
    const i = Math.min(weights.length - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)));
    if (!programmatic.current) setCentered(i);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (programmatic.current) {
        programmatic.current = false;
        return;
      }
      pick(i);
    }, SETTLE_MS);
  };

  const tap = (i: number) => {
    pick(i);
    scrollToIndex(i, true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const from = selectedIndex < 0 ? centered : selectedIndex;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    tap(Math.min(weights.length - 1, Math.max(0, from + step)));
  };

  const shown = selectedIndex >= 0 ? weights[centered] : null;
  const label = mode === 'dumbbell_each' ? 'each hand' : 'held';

  return (
    <div className={base.root}>
      <div className={base.readout}>
        <DumbbellGlyph pair={mode === 'dumbbell_each'} bump={shown ?? -1} reduce={!!reduce} />
        <p className={`${base.total} num`} aria-live="polite" data-testid="wheel-total">
          {shown == null ? <span className={base.placeholder}>–</span> : formatAmount(shown)}
          <span className={base.unit}>{unit}</span>
        </p>
        <p className={base.label}>{label}</p>
      </div>

      <div className={styles.wheelWrap}>
        <div className={styles.notch} aria-hidden="true" />
        <div
          ref={trackRef}
          className={styles.track}
          role="listbox"
          aria-label={mode === 'dumbbell_each' ? 'Dumbbell weight, each hand' : 'Weight held'}
          aria-orientation="horizontal"
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          style={{ ['--item' as string]: `${ITEM}px` }}
        >
          {weights.map((w, i) => (
            <button
              key={w}
              type="button"
              role="option"
              aria-selected={i === selectedIndex}
              aria-label={formatWeight(w, unit)}
              tabIndex={-1}
              className={styles.item}
              data-centered={i === centered}
              data-selected={i === selectedIndex}
              onClick={() => tap(i)}
            >
              <span className="num">{formatAmount(w)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A drawn dumbbell (or a pair). Pops slightly each time the weight changes. */
function DumbbellGlyph({ pair, bump, reduce }: { pair: boolean; bump: number; reduce: boolean }) {
  const one = (
    <g>
      <rect x="6" y="11" width="5" height="18" rx="1.5" />
      <rect x="11" y="7" width="6" height="26" rx="2" />
      <rect x="17" y="18" width="30" height="4" rx="2" opacity="0.75" />
      <rect x="47" y="7" width="6" height="26" rx="2" />
      <rect x="53" y="11" width="5" height="18" rx="1.5" />
    </g>
  );
  return (
    <motion.svg
      key={bump}
      className={styles.glyph}
      viewBox="0 0 64 56"
      width="56"
      height="40"
      aria-hidden="true"
      initial={reduce ? false : { scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={SPRING}
    >
      {pair ? (
        <>
          <g transform="translate(0 -4)">{one}</g>
          <g transform="translate(0 18)" opacity="0.55">
            {one}
          </g>
        </>
      ) : (
        <g transform="translate(0 8)">{one}</g>
      )}
    </motion.svg>
  );
}
