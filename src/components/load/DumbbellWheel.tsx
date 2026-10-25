import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { DumbbellRange, Load, Unit } from '../../db/types';
import { dumbbellLoad, dumbbellsInRange, formatAmount, formatWeight, heldWeightOf, singleLoad } from '../../lib/load';
import { SPRING } from '../../ui/motion';
import { tick } from '../../ui/haptics';
import { DumbbellPicture, KettlebellPicture, PlatePicture, UprightDumbbellPicture } from './PickerArt';
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
  /**
   * The exact weights to offer instead of the range (PLAN 1.7j): a held plate offers the gym's
   * enabled plates. Never a made up range around them.
   */
  weights?: readonly number[];
  /** The one weight is a plate held in both hands (plate twists, plate raises). */
  plate?: boolean;
};

/** Item pitch in px. The wheel pads half the track on each side so every item can sit centered. */
const ITEM = 68;
const SETTLE_MS = 110;

/** Dumbbell wheel (SPEC 5.2): a horizontal snapping wheel over the gym's dumbbell range. */
/** SPEC 13.6 labels: plain words, one helper line. */
export const WHEEL_COPY = {
  dumbbell_each: { title: 'Dumbbells · weight of one', helper: 'You hold one in each hand' },
  single: { title: 'One weight · both hands', helper: 'Goblet squat, kettlebell swing' },
  plate: { title: 'One plate · both hands', helper: 'The plates turned on for this gym' },
} as const;

export function DumbbellWheel({ unit, range, mode, value, onChange, exerciseName, weights, plate }: Props) {
  if (weights) {
    if (!weights.length) {
      return (
        <div className={base.empty}>
          <p>{plate ? 'No plates turned on for this gym' : 'No weights set for this gym'}</p>
          <Link to="/settings" className={`${base.emptyLink} pressable`}>
            Set them in Settings
          </Link>
        </div>
      );
    }
    return <Wheel unit={unit} list={weights} mode={mode} value={value} onChange={onChange} exerciseName={exerciseName} plate={plate} />;
  }
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

function Wheel({ unit, range, list, mode, value, onChange, exerciseName = '', plate = false }: Omit<Props, 'range' | 'weights'> & { range?: DumbbellRange; list?: readonly number[] }) {
  const reduce = useReducedMotion();
  const listKey = list?.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weights = useMemo(() => (list ? [...list] : range ? dumbbellsInRange(range) : []), [range, listKey]);
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

  /** The weight this wheel itself just published while the finger scrolls (never scrolled back to). */
  const published = useRef<number | null>(null);

  // Keep the wheel on the selected weight when it changes from outside (and on mount).
  useLayoutEffect(() => {
    if (selectedIndex < 0 || programmatic.current) return;
    setCentered(selectedIndex);
    // Our own publish during a scroll: the wheel is already there (or still gliding to it).
    if (published.current !== null && weights[selectedIndex] === published.current) return;
    scrollToIndex(selectedIndex, false);
  }, [selectedIndex, weights]);

  useLayoutEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const pick = (i: number, fromScroll = false) => {
    const w = weights[i];
    if (w === undefined) return;
    setCentered(i);
    published.current = fromScroll ? w : null;
    if (w !== selected) {
      onChange(mode === 'dumbbell_each' ? dumbbellLoad(w, unit) : singleLoad(w, unit));
    }
  };
  const detent = useRef(-1);

  const onScroll = () => {
    if (drag.current) return; // picked on release
    const el = trackRef.current!;
    const i = Math.min(weights.length - 1, Math.max(0, Math.round(el.scrollLeft / ITEM)));
    if (!programmatic.current) {
      // A tiny tick for each detent the wheel passes (SPEC 23.2).
      if (detent.current !== -1 && detent.current !== i) tick();
      detent.current = i;
      // The weight in the notch is published at once (PLAN 1.7i): what the readout shows is
      // always what Done or Save stores, never a value still waiting for the wheel to settle.
      pick(i, true);
    }
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
    // A finger or mouse on the wheel: whatever scrolls from now on is the user's, never ours.
    programmatic.current = false;
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
  const copy = plate && mode === 'single' ? WHEEL_COPY.plate : WHEEL_COPY[mode];
  const picture = mode === 'dumbbell_each' ? 'dumbbell' : plate ? 'plate' : /kettlebell/i.test(exerciseName) ? 'kettlebell' : 'upright';

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
function Picture({ kind, bump, reduce }: { kind: 'dumbbell' | 'kettlebell' | 'upright' | 'plate'; bump: number; reduce: boolean }) {
  return (
    <motion.span
      key={bump}
      className={styles.glyph}
      initial={reduce ? false : { scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={SPRING}
    >
      {kind === 'dumbbell' ? <DumbbellPicture /> : kind === 'kettlebell' ? <KettlebellPicture /> : kind === 'plate' ? <PlatePicture /> : <UprightDumbbellPicture />}
    </motion.span>
  );
}
