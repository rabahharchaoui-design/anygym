// PLAN D1: the form demo of a 3 or 4 frame sequence, in the exercise sheet and the full screen
// viewer. It steps through the frames in order and loops, like the two frame demo: on its own
// every 1.5 s (Pause stops it), and with the Previous and Next buttons. Reduced motion never moves
// on its own: the frames change only on a tap. The position ("2 of 4") is plain text VoiceOver
// reads; it is announced when a person steps, not on every automatic step. Every frame is in the
// page from the start (preloaded, so a step never flashes), stacked in one fixed box (no layout shift).
import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, PauseIcon, PlayIcon } from '../../ui/icons';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import type { DemoImages } from '../../lib/exerciseInfo';
import { frameCount } from '../../lib/demoSequence';
import { useDemoPhotos, type Photos } from '../../hooks/usePhotos';
import { Picture } from './DemoPicture';
import { DemoStage } from './DemoStage';
import styles from './DemoSteps.module.css';

/** One frame's time on screen, the same slot as the two frame loop. */
export const STEP_MS = 1500;

export interface Steps {
  n: number;
  index: number;
  /** The frame the current one crossfades in over. */
  under: number | null;
  playing: boolean;
  reduce: boolean;
  /** False offline when a frame is not kept: the start photo only, no stepping (never a hole). */
  whole: boolean;
  go: (delta: 1 | -1) => void;
  toggle: () => void;
}

/** The stepper's state for `n` frames (nothing runs when n is 2: the CSS loop shows those). */
export function useDemoSteps(n: number, photos: Photos): Steps {
  const reduce = useReducedMotionLive();
  const [at, setAt] = useState<{ index: number; under: number | null }>({ index: 0, under: null });
  const [playing, setPlaying] = useState(true);
  const whole = photos.kind === 'net' || (photos.kind === 'cache' && photos.urls.slice(0, n).every(Boolean));
  const auto = n > 2 && whole && playing && !reduce;
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => setAt((a) => ({ index: (a.index + 1) % n, under: a.index })), STEP_MS);
    return () => window.clearInterval(t);
  }, [auto, n]);
  const go = (delta: 1 | -1) => {
    // A person stepping takes over from the loop.
    setPlaying(false);
    setAt((a) => ({ index: (a.index + delta + n) % n, under: a.index }));
  };
  return { n, index: whole ? at.index : 0, under: whole ? at.under : null, playing: playing && !reduce, reduce, whole, go, toggle: () => setPlaying((p) => !p) };
}

/** The frames, stacked in the box the caller gives them. */
export function StepFrames({ demo, photos, name, steps, cover = false }: { demo: DemoImages; photos: Photos; name: string; steps: Steps; cover?: boolean }) {
  const shown = steps.whole ? steps.n : 1;
  return (
    <>
      {Array.from({ length: shown }, (_, i) => {
        const on = i === steps.index;
        const cls = [styles.frame, on ? styles.on : i === steps.under ? styles.under : '', cover ? styles.cover : ''].filter(Boolean).join(' ');
        return <Picture key={i} demo={demo} i={i} photos={photos} alt={on ? `${name}, frame ${i + 1} of ${steps.n}` : ''} lazy={false} className={cls} />;
      })}
    </>
  );
}

const stop = (e: MouseEvent) => e.stopPropagation();

/** Previous, the position, Next, and Pause (not with reduced motion: nothing moves on its own). */
export function StepBar({ steps, name }: { steps: Steps; name: string }) {
  return (
    // Its room is kept even when it cannot step (offline, a frame not kept), so nothing shifts.
    <div className={styles.bar} role="group" aria-label={`${name} demo frames`} data-testid="demo-steps" data-hidden={!steps.whole || undefined} onClick={stop}>
      <button type="button" className={`${styles.btn} pressable`} onClick={() => steps.go(-1)} aria-label="Previous frame" disabled={!steps.whole}>
        <ChevronLeft width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <p className={styles.pos} aria-live={steps.playing ? 'off' : 'polite'} aria-atomic="true" data-testid="demo-position">
        {steps.index + 1} of {steps.n}
      </p>
      <button type="button" className={`${styles.btn} pressable`} onClick={() => steps.go(1)} aria-label="Next frame" disabled={!steps.whole} data-testid="demo-next">
        <ChevronRight width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
      </button>
      {!steps.reduce && (
        <button type="button" className={`${styles.btn} pressable`} onClick={steps.toggle} aria-pressed={!steps.playing} aria-label={steps.playing ? 'Pause demo' : 'Play demo'} disabled={!steps.whole}>
          {steps.playing ? <PauseIcon width={16} height={16} strokeWidth={2.6} fill="currentColor" aria-hidden="true" /> : <PlayIcon width={16} height={16} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

type Props = { demo: DemoImages; name: string; onOpen?: () => void; fit?: boolean };

/** The sheet's sequence demo: the same box as the two frame demo, the step bar under it. */
export function DemoSteps({ demo, name, onOpen, fit = false }: Props) {
  const photos = useDemoPhotos(demo);
  const steps = useDemoSteps(frameCount(demo), photos);
  const frames = <StepFrames demo={demo} photos={photos} name={name} steps={steps} />;
  return (
    <div className={styles.wrap} data-testid="form-demo" data-frames={steps.n} data-index={steps.index} data-fit={fit || undefined}>
      <DemoStage className={styles.stage ?? ''} name={name} onOpen={onOpen}>
        {frames}
      </DemoStage>
      <StepBar steps={steps} name={name} />
    </div>
  );
}

/**
 * The full screen viewer's sequence (DemoViewer.tsx): the frames fill the viewer's 3:2 stage, the
 * step bar hangs under it (the stage keeps room for it), so the viewer loads this file only for a sequence.
 */
export function ViewerSteps({ demo, name }: { demo: DemoImages; name: string }) {
  const photos = useDemoPhotos(demo);
  const steps = useDemoSteps(frameCount(demo), photos);
  return (
    <>
      <span className={styles.viewerFrames} data-testid="demo-hero" data-frames={steps.n} data-index={steps.index}>
        <StepFrames demo={demo} photos={photos} name={name} steps={steps} />
      </span>
      <div className={styles.viewerBar}>
        <StepBar steps={steps} name={name} />
      </div>
    </>
  );
}
