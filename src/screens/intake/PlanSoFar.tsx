// PLAN 3.3a: the slim "Your plan so far" strip. Round 2 (B7): it leads with the goals, then the level,
// and grows by one pill per answer the plan really uses (goals, level, days, minutes, place). It
// shows only on the screens that add to it, wraps instead of cutting a word, and when the question
// leaves no room for it whole it waits out of sight (useStripFit), never clipped. PLAN 3.5w: then a
// one line version takes its place under the progress bar (the latest pill and "+N"), so a short
// phone still sees the plan build.
import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { goalsOf, type IntakeAnswers, type ScreenId } from '../../lib/intake/funnel';
import type { ExperienceId, GoalId, PlaceAnswer } from '../../lib/intake/options';
import soFarStyles from './IntakeSoFar.module.css';

/** The screens whose answer becomes a pill: elsewhere the strip has nothing to add. */
export const STRIP_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['goal', 'experience', 'days', 'minutes', 'place']);

const GOAL_SHORT: Record<GoalId, string> = {
  muscle: 'Muscle',
  strength: 'Strength',
  fat_loss: 'Fat loss',
  tone: 'Tone up',
  health: 'Health',
  athletic: 'Athletic',
  race: 'Race',
  comeback: 'Comeback',
};
const LEVEL_SHORT: Record<ExperienceId, string> = { new: 'Brand new', months: 'A few months', '1_2y': '1 to 2 years', '3y': '3+ years', break: 'Coming back' };
/** The place in a word or two. */
const PLACE_SHORT: Record<PlaceAnswer, string> = { full: 'Full gym', hotel: 'Hotel gyms', home: 'Home', outdoors: 'Outdoors', mix: 'Mix' };

export type Pill = { id: 'goals' | 'level' | 'days' | 'minutes' | 'place'; text: string };

/** Only what was answered, goals first ("Muscle + fat loss"). */
export function planSoFarPills(a: IntakeAnswers): Pill[] {
  const goals = goalsOf(a).map((g, i) => (i === 0 ? GOAL_SHORT[g] : GOAL_SHORT[g].toLowerCase()));
  const out: Array<Pill | null> = [
    goals.length ? { id: 'goals', text: goals.join(' + ') } : null,
    a.experience ? { id: 'level', text: LEVEL_SHORT[a.experience] } : null,
    a.days ? { id: 'days', text: `${a.days} days` } : null,
    a.minutes ? { id: 'minutes', text: a.minutes === 75 ? '75+ min' : `${a.minutes} min` } : null,
    a.place ? { id: 'place', text: PLACE_SHORT[a.place] } : null,
  ];
  return out.filter((p): p is Pill => !!p);
}

export function PlanSoFar({ answers }: { answers: IntakeAnswers }) {
  const pills = planSoFarPills(answers);
  return (
    <section className={soFarStyles.soFar} aria-label="Your plan so far" data-testid="plan-so-far">
      <span className={soFarStyles.soFarLabel}>Your plan so far</span>
      {pills.length === 0 ? (
        <span className={soFarStyles.soFarEmpty}>Builds as you answer</span>
      ) : (
        <ul className={soFarStyles.soFarSlots}>
          {pills.map((p) => (
            <li key={p.id} className={soFarStyles.soFarSlot} data-filled="" data-testid={`so-far-${p.id}`}>
              {p.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The one line version, pinned under the progress bar (PLAN 3.5w). In the page on every strip
 * screen, shown only while the strip itself has no room (useStripFit sets data-show before paint).
 */
export function PlanSoFarLine({ answers }: { answers: IntakeAnswers }) {
  const pills = planSoFarPills(answers);
  const latest = pills[pills.length - 1];
  return (
    <section className={soFarStyles.soFarLine} aria-label="Your plan so far" data-testid="plan-so-far-line">
      <span className={soFarStyles.soFarLabel}>Your plan so far</span>
      {latest ? (
        <span className={soFarStyles.soFarLineEnd}>
          <span key={latest.id} className={soFarStyles.soFarSlot} data-testid="so-far-latest">
            {latest.text}
          </span>
          {pills.length > 1 && (
            <span className={`${soFarStyles.soFarMore} num`} data-testid="so-far-more" aria-label={`and ${pills.length - 1} more`}>
              +{pills.length - 1}
            </span>
          )}
        </span>
      ) : (
        <span className={soFarStyles.soFarEmpty}>Builds as you answer</span>
      )}
    </section>
  );
}

/**
 * Whole or not at all: the strip shows only while the question and the strip both fit the
 * scroller; with no room (a small phone, large text) it waits out of sight until there is.
 */
export function useStripFit(ref: RefObject<HTMLElement | null>): void {
  const update = () => {
    const el = ref.current;
    const strip = el?.querySelector<HTMLElement>('[data-testid="plan-so-far"]');
    if (!el || !strip) return;
    // PLAN 3.5w: while a tapped card pulses the screen holds still (IntakeScreen's data-hold); the next screen measures afresh.
    if (el.dataset.hold !== undefined) return;
    // The one line version shows exactly while the strip is away; the room it takes comes back with the strip.
    const line = el.parentElement?.querySelector<HTMLElement>('[data-testid="plan-so-far-line"]') ?? null;
    const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
    if (strip.dataset.away !== undefined) {
      if (el.scrollHeight + strip.offsetHeight + gap <= el.clientHeight + (line?.offsetHeight ?? 0)) delete strip.dataset.away;
    } else if (el.scrollHeight > el.clientHeight + 1) strip.dataset.away = '';
    if (!line) return;
    if (strip.dataset.away !== undefined) line.dataset.show = '';
    else delete line.dataset.show;
  };
  useLayoutEffect(update);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    // No strip on this screen (equipment, cardio...): nothing to watch, nothing set up.
    if (!el.querySelector('[data-testid="plan-so-far"]')) return;
    // PLAN 3.5w: moving the strip resizes its neighbours, and the one line version that takes its
    // place resizes the scroller, so neither is ever moved inside a resize callback (WebKit:
    // "ResizeObserver loop completed with undelivered notifications", and a second layout in the
    // same frame). Every resize is read on the next frame, one read per frame.
    let frame = 0;
    const later = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    const parts = new ResizeObserver(later);
    parts.observe(el);
    for (const child of Array.from(el.children)) if (!(child as HTMLElement).matches('[data-testid="plan-so-far"]')) parts.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      parts.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
}
