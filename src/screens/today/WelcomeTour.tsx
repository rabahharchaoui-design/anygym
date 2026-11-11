// The first visit welcome on Today (PLAN 3.5u): three calm steps, a spotlight on the day card and
// Start, then on "Got X min?", then on the tab bar. One line of words, Next and Skip; a tap outside
// moves on too. The lit element stays live (Start starts, a tab opens) and using it ends the
// welcome; focus is never moved or held. Shown once: finishing or skipping is saved on the profile.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../ui/Button';
import { FADE, GENTLE } from '../../ui/motion';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { finishWelcomeTour } from '../../db/welcomeTour';
import { nextLabel, spotBox, tourReducer, tourSteps, TOUR_START, wordsTop, type Box, type TourAction, type TourStep, type TourTarget } from '../../lib/welcomeTour';
import styles from './WelcomeTour.module.css';

/** Today is seen for a moment first, then the welcome comes in. */
const SETTLE_MS = 400;
/** The light reaches a little past the element. */
const PAD = 6;
const GAP = 12;
const EDGE = 16;
const TARGETS: readonly TourTarget[] = ['day', 'pick', 'quick', 'tabs'];
const INSTANT = { duration: 0 } as const;

const find = (t: TourTarget) => document.querySelector<HTMLElement>(`[data-tour="${t}"]`);

type Lit = Box & { radius: number };

function measure(el: HTMLElement): Lit {
  const r = el.getBoundingClientRect();
  const box = spotBox({ x: r.left, y: r.top, width: r.width, height: r.height }, PAD);
  const own = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { ...box, radius: Math.min(own + PAD, box.height / 2) };
}

const moved = (a: Lit | null, b: Lit) => !a || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5 || a.radius !== b.radius;

export function WelcomeTour({ show }: { show: boolean }) {
  const reduce = useReducedMotionLive();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [state, setState] = useState(TOUR_START);
  const [lit, setLit] = useState<Lit | null>(null);
  const [wordsHeight, setWordsHeight] = useState(0);
  const words = useRef<HTMLDivElement>(null);

  // Opens once Today has rested, with the steps for what is really on it.
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setSteps(tourSteps(new Set(TARGETS.filter((x) => find(x))))), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [show]);

  const step = steps?.[state.index];
  const open = show && !!step && !state.over;
  const target = open ? step.target : null;

  const act = (action: TourAction) => {
    const next = tourReducer(state, action, steps?.length ?? 0);
    setState(next);
    if (next.over) void finishWelcomeTour().catch(() => undefined);
  };
  const actRef = useRef(act);
  actRef.current = act;

  // The light follows its element (a scroll, a late card, a rotation), read once a frame.
  useEffect(() => {
    if (!target) return;
    const el = find(target);
    if (!el) return actRef.current('next');
    if (target !== 'tabs') {
      // Only as far as it takes to clear the tab bar: the page stays where the user knows it.
      const r = el.getBoundingClientRect();
      const tabs = find('tabs')?.getBoundingClientRect().top ?? window.innerHeight;
      const under = r.bottom + PAD + GAP - tabs;
      if (under > 0) el.closest('[data-scroller]')?.scrollBy({ top: under, behavior: reduce ? 'auto' : 'smooth' });
    }
    let frame = 0;
    const read = () => {
      if (el.isConnected) setLit((now) => (moved(now, measure(el)) ? measure(el) : now));
      frame = requestAnimationFrame(read);
    };
    read();
    // Using the lit element (Start, a tab) is the user moving on: the welcome is over, the tap goes through.
    const used = (e: MouseEvent) => {
      if (e.target instanceof Node && el.contains(e.target)) actRef.current('skip');
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actRef.current('skip');
    };
    document.addEventListener('click', used, true);
    document.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('click', used, true);
      document.removeEventListener('keydown', key);
    };
  }, [target, reduce]);

  useLayoutEffect(() => {
    if (words.current) setWordsHeight(words.current.offsetHeight);
  }, [state.index, lit, open]);

  const count = steps?.length ?? 0;
  const view = { top: EDGE, bottom: window.innerHeight - EDGE };
  const top = lit ? wordsTop(lit, wordsHeight, view, GAP) : 0;
  const glide = reduce ? INSTANT : GENTLE;

  return createPortal(
    <AnimatePresence>
      {open && lit && (
        <motion.div className={styles.tour} data-testid="welcome-tour" data-step={step.target} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
          {/* The light: it glides from one element to the next, so the eye is led, never jumped. */}
          <motion.div
            className={styles.spot}
            data-testid="tour-spot"
            initial={false}
            animate={{ x: lit.x, y: lit.y, width: lit.width, height: lit.height, borderRadius: lit.radius }}
            transition={glide}
          />
          {/* Everything around the light moves on with a tap; the lit element itself stays live. */}
          <div className={styles.around} aria-hidden="true" onClick={() => act('next')} data-testid="tour-outside">
            <span style={{ top: 0, left: 0, right: 0, height: Math.max(0, lit.y) }} />
            <span style={{ top: lit.y + lit.height, left: 0, right: 0, bottom: 0 }} />
            <span style={{ top: lit.y, left: 0, width: Math.max(0, lit.x), height: lit.height }} />
            <span style={{ top: lit.y, left: lit.x + lit.width, right: 0, height: lit.height }} />
          </div>
          <motion.div
            ref={words}
            className={styles.words}
            role="dialog"
            aria-label={`Welcome, step ${state.index + 1} of ${count}`}
            data-testid="tour-words"
            initial={false}
            animate={{ y: top }}
            transition={glide}
          >
            <motion.p key={step.target} className={styles.line} aria-live="polite" data-testid="tour-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE}>
              {step.line}
            </motion.p>
            <div className={styles.row}>
              <span className={styles.dots} aria-hidden="true">
                {steps!.map((s, i) => (
                  <span key={s.target} className={styles.dot} data-on={i === state.index || undefined} />
                ))}
              </span>
              <Button variant="tertiary" block={false} onClick={() => act('skip')} data-testid="tour-skip">
                Skip
              </Button>
              <Button size="md" block={false} onClick={() => act('next')} data-testid="tour-next">
                {nextLabel(state, count)}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
