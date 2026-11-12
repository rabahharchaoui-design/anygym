// The first visit welcome on Today (PLAN 3.5u): three calm steps, a spotlight on the day card and
// Start, then on "Got X min?", then on the tab bar. One line of words, Next and Skip; a tap outside
// moves on too. The lit element stays live (Start starts, a tab opens) and using it ends the
// welcome; focus is never moved or held. Shown once: finishing or skipping is saved on the profile.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../ui/Button';
import { FADE, GLIDE } from '../../ui/motion';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { finishWelcomeTour } from '../../db/welcomeTour';
import { nextLabel, spotBox, tourReducer, tourSteps, TOUR_START, wordsTop, type Box, type TourAction, type TourStep, type TourTarget } from '../../lib/welcomeTour';
import styles from './WelcomeTour.module.css';

/** Today is seen for a moment first, then the welcome comes in. */
const SETTLE_MS = 400;
/** PLAN 3.5w: the words come in this long after the dim, whole (never as see through text over the page). */
const WORDS_AFTER_MS = 150;
/** How far the words rise as they land. */
const WORDS_RISE = 8;
/** The light reaches a little past the element. */
const PAD = 6;
const GAP = 12;
const EDGE = 16;
const TARGETS: readonly TourTarget[] = ['day', 'pick', 'quick', 'tabs'];
const INSTANT = { duration: 0 } as const;

const find = (t: TourTarget) => document.querySelector<HTMLElement>(`[data-tour="${t}"]`);

/** Where the tab bar starts (the bottom of the screen when it is not there). */
const tabsTop = () => find('tabs')?.getBoundingClientRect().top ?? window.innerHeight;

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
  /** The words card has landed (it waits for the dim and its own measured place first). */
  const [wordsIn, setWordsIn] = useState(false);

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
    // PLAN 3.5w: Escape moves on like a tap outside (the last step ends it); Skip is the way to end it early.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actRef.current('next');
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

  // Only as far as it takes: the element clears the tab bar, and (PLAN 3.5w) when the words fit
  // neither over it nor between it and the tab bar, far enough for them to fit under it.
  useEffect(() => {
    if (!target || target === 'tabs') return;
    const el = find(target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tabs = tabsTop();
    const fitsOver = r.top - PAD - GAP - wordsHeight >= EDGE;
    const under = r.bottom + PAD + GAP + (wordsHeight && !fitsOver ? wordsHeight + GAP : 0) - tabs;
    if (under > 0) el.closest('[data-scroller]')?.scrollBy({ top: under, behavior: reduce ? 'auto' : 'smooth' });
  }, [target, wordsHeight, reduce]);

  useEffect(() => {
    if (!open) return setWordsIn(false);
    if (!wordsHeight || wordsIn) return;
    const t = window.setTimeout(() => setWordsIn(true), WORDS_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [open, wordsHeight, wordsIn]);

  const count = steps?.length ?? 0;
  // PLAN 3.5w: the words never sit on the tab bar while another element is lit.
  const view = { top: EDGE, bottom: target && target !== 'tabs' ? Math.min(window.innerHeight - EDGE, tabsTop() - GAP) : window.innerHeight - EDGE };
  const top = lit ? wordsTop(lit, wordsHeight, view, GAP) : 0;
  const glide = reduce ? INSTANT : GLIDE;

  return createPortal(
    <AnimatePresence>
      {open && lit && (
        // Only the dim fades in (the light's own shadow); the layer itself fades only on the way out.
        <motion.div className={styles.tour} data-testid="welcome-tour" data-step={step.target} initial={false} exit={{ opacity: 0 }} transition={FADE}>
          {/* The light: it glides from one element to the next, so the eye is led, never jumped. */}
          <motion.div
            className={styles.spot}
            data-testid="tour-spot"
            initial={{ opacity: 0, x: lit.x, y: lit.y, width: lit.width, height: lit.height, borderRadius: lit.radius }}
            animate={{ opacity: 1, x: lit.x, y: lit.y, width: lit.width, height: lit.height, borderRadius: lit.radius }}
            transition={{ ...glide, opacity: FADE }}
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
            data-in={wordsIn || undefined}
            initial={false}
            // Out of sight it simply tracks its place; then it shows whole and rises the last few points.
            animate={{ y: top + (wordsIn || reduce ? 0 : WORDS_RISE), opacity: wordsIn ? 1 : 0 }}
            transition={wordsIn ? { ...glide, opacity: INSTANT } : INSTANT}
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
