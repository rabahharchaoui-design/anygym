import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { DumbbellRange, Load, Unit } from '../../db/types';
import { dumbbellLoad, dumbbellsInRange, formatAmount, formatWeight, heldWeightOf, singleLoad } from '../../lib/load';
import { SPRING } from '../motion';
import { DumbbellPicture, KettlebellPicture, UprightDumbbellPicture } from './PickerArt';
import { Hint } from '../hint/Hint';
import base from './LoadInput.module.css';
import styles from './DumbbellWheel.module.css';

type Props = {
  unit: Unit;
  /** The gym's dumbbell range; null = the gym has no dumbbells. */
  range: DumbbellRange | null;
  /** 'dumbbell_each': a pair, you pick the weight of one. 'single': one weight in both hands. */
  mode: 'dumbbell_each' | 'single';
  /** Picks the picture for one weight: a kettlebell for kettlebell moves, else an upright dumbbell. */
  exerciseName?: string;
  value: Load | null;
  onChange: (load: Load) => void;
};

/** Item pitch in px. The wheel pads half the track on each side so every item can sit centered. */
const ITEM = 68;
const SETTLE_MS = 110;

/** Dumbbell wheel (SPEC 5.2): a horizontal snapping wheel over the gym's dumbbell range. */
/** SPEC 13.6 labels: plain words, one helper line. */
export const WHEEL_COPY = {
  dumbbell_each: { title: 'Dumbbells · weight of one', helper: 'You hold one in each hand' },
  single: { title: 'One weight · both hands', helper: 'Goblet squat, kettlebell swing' },
} as const;

export function DumbbellWheel({ unit, range, mode, value, onChange, exerciseName }: Props) {
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
  return <Wheel unit={unit} range={range} mode={mode} value={value} onChange={onChange} exerciseName={exerciseName} />;
}

function Wheel({ unit, range, mode, value, onChange, exerciseName = '' }: Props & { range: DumbbellRange }) {
  const reduce = useReducedMotion();
  const weights = useMemo(() => dumbbellsInRange(range), [range]);
  const selected = value?.kind === mode ? heldWeightOf(value) : null;
  const selectedIndex = selected === null ? -1 : weights.indexOf(selected);
  const trackRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number>(undefined);
  /** Set while we scroll on purpose (mount, tap) so the settle handler does not pick for the user. */
  const programmatic = useRef(false);
  /** Mouse drag (desktop, tests): touch scrolls natively, a mouse grabs and drags the wheel. */
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
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
    if (drag.current) return; // picked on release
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

  const nearest = () => Math.min(weights.length - 1, Math.max(0, Math.round(trackRef.current!.scrollLeft / ITEM)));

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, left: trackRef.current!.scrollLeft, moved: false };
    dragged.current = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      trackRef.current!.setPointerCapture?.(e.pointerId);
      trackRef.current!.dataset.dragging = 'true';
    }
    trackRef.current!.scrollLeft = d.left - dx;
    setCentered(nearest());
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    delete trackRef.current!.dataset.dragging;
    if (d.moved) {
      dragged.current = true; // swallow the click that follows the drag
      tap(nearest());
    }
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
  const copy = WHEEL_COPY[mode];
  const picture = mode === 'dumbbell_each' ? 'dumbbell' : /kettlebell/i.test(exerciseName) ? 'kettlebell' : 'upright';

  return (
    <div className={base.root}>
      <div className={base.readout}>
        <p className={`${base.total} num`} aria-live="polite" data-testid="wheel-total">
          {shown == null ? <span className={base.placeholder}>–</span> : formatAmount(shown)}
          <span className={base.unit}>{unit}</span>
        </p>
        <div className={styles.titleRow}>
          <Picture kind={picture} bump={shown ?? -1} reduce={!!reduce} />
          <p className={base.label} data-testid="picker-title">
            {copy.title}
          </p>
        </div>
        <p className={base.helper}>{copy.helper}</p>
      </div>

      <div className={styles.wheelOuter}>
        {mode === 'dumbbell_each' && <Hint id="wheel" className={styles.hint} point="down" />}
        <div className={styles.wheelWrap}>
          <div className={styles.notch} aria-hidden="true" />
          <div
            ref={trackRef}
            className={styles.track}
            role="listbox"
            aria-label={mode === 'dumbbell_each' ? 'Weight of one dumbbell' : 'Weight'}
            aria-orientation="horizontal"
            tabIndex={0}
            onScroll={onScroll}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            style={{ ['--item' as string]: `${ITEM}px` }}
          >
            {/* Spacers (not padding) let the first and last weight sit centred: iOS Safari drops
              end padding in flex scrollers. Content is plain flex boxes: visible on first paint, no JS. */}
            <span className={styles.spacer} aria-hidden="true" />
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
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  tap(i);
                }}
              >
                <span className="num">{formatAmount(w)}</span>
              </button>
            ))}
            <span className={styles.spacer} aria-hidden="true" />
          </div>
          <div className={styles.fade} data-end="start" aria-hidden="true" />
          <div className={styles.fade} data-end="end" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** The one picture for this picker. Pops slightly each time the weight changes. */
function Picture({ kind, bump, reduce }: { kind: 'dumbbell' | 'kettlebell' | 'upright'; bump: number; reduce: boolean }) {
  return (
    <motion.span
      key={bump}
      className={styles.glyph}
      initial={reduce ? false : { scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={SPRING}
    >
      {kind === 'dumbbell' ? <DumbbellPicture /> : kind === 'kettlebell' ? <KettlebellPicture /> : <UprightDumbbellPicture />}
    </motion.span>
  );
}
