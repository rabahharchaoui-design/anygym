import { describe, expect, it } from 'vitest';
import { nextLabel, shouldShowTour, spotBox, tourReducer, tourSteps, TOUR_START, wordsTop, type TourTarget } from '../welcomeTour';
import { funnelReducer, HIDDEN_SCREENS, parseDraft, sanitizeAnswers, SCREENS, visibleScreens, type IntakeAnswers } from '../intake/funnel';
import { RECORD_CHECKS } from '../backupChecks';

// PLAN 3.5u: the first visit welcome as pure state, and the intake's hidden questions.
const set = (...t: TourTarget[]) => new Set<TourTarget>(t);

describe('the welcome tour state', () => {
  it('shows only with the pending flag, on a ready Today with no workout in progress', () => {
    const today = { ready: true, activeWorkout: false };
    expect(shouldShowTour('pending', today)).toBe(true);
    // Everyone from before 3.5u has no flag; done is done.
    expect(shouldShowTour(undefined, today)).toBe(false);
    expect(shouldShowTour('done', today)).toBe(false);
    expect(shouldShowTour('pending', { ready: false, activeWorkout: false })).toBe(false);
    expect(shouldShowTour('pending', { ready: true, activeWorkout: true })).toBe(false);
  });

  it('three steps in order: the day card, Got X min, the tab bar; one short line each', () => {
    const steps = tourSteps(set('day', 'quick', 'tabs'));
    expect(steps.map((s) => s.target)).toEqual(['day', 'quick', 'tabs']);
    for (const s of steps) {
      expect(s.line.length).toBeLessThanOrEqual(38);
      expect(s.line).not.toContain('\n');
    }
  });

  it('never points at something that is not there', () => {
    // No plan: the Pick a plan card stands in for the day card.
    expect(tourSteps(set('pick', 'quick', 'tabs')).map((s) => s.target)).toEqual(['pick', 'quick', 'tabs']);
    // A gym that cannot build a quick workout: that step is left out.
    expect(tourSteps(set('day', 'tabs')).map((s) => s.target)).toEqual(['day', 'tabs']);
    expect(tourSteps(set('day', 'pick', 'tabs')).map((s) => s.target)).toEqual(['day', 'tabs']);
    expect(tourSteps(set())).toEqual([]);
  });

  it('Next walks the steps and ends after the last; Skip ends at once; over stays over', () => {
    let s = TOUR_START;
    expect(nextLabel(s, 3)).toBe('Next');
    s = tourReducer(s, 'next', 3);
    expect(s).toEqual({ index: 1, over: false });
    s = tourReducer(s, 'next', 3);
    expect(s).toEqual({ index: 2, over: false });
    expect(nextLabel(s, 3)).toBe('Done');
    s = tourReducer(s, 'next', 3);
    expect(s.over).toBe(true);
    expect(tourReducer(s, 'next', 3)).toBe(s);
    expect(tourReducer(TOUR_START, 'skip', 3)).toEqual({ index: 0, over: true });
    expect(tourReducer({ index: 1, over: false }, 'skip', 3).over).toBe(true);
    // Nothing to show: the first Next ends it.
    expect(tourReducer(TOUR_START, 'next', 0).over).toBe(true);
  });

  it('the spotlight is the element grown by its padding; the words sit under, over, or at the bottom', () => {
    expect(spotBox({ x: 16, y: 100, width: 343, height: 200 }, 6)).toEqual({ x: 10, y: 94, width: 355, height: 212 });
    const view = { top: 16, bottom: 651 };
    // Room under the day card.
    expect(wordsTop({ x: 10, y: 94, width: 355, height: 212 }, 110, view, 12)).toBe(318);
    // The tab bar: no room under, so over it.
    expect(wordsTop({ x: 10, y: 580, width: 355, height: 70 }, 110, view, 12)).toBe(458);
    // A card that fills the screen: resting at the bottom.
    expect(wordsTop({ x: 10, y: 60, width: 355, height: 560 }, 110, view, 12)).toBe(541);
  });

  it('the flag passes the backup check, and nothing else does', () => {
    const p = { id: 'me', defaultUnit: 'kg', createdAt: 1 };
    expect(RECORD_CHECKS.profile(p)).toBe(true);
    expect(RECORD_CHECKS.profile({ ...p, welcomeTour: 'pending' })).toBe(true);
    expect(RECORD_CHECKS.profile({ ...p, welcomeTour: 'done' })).toBe(true);
    expect(RECORD_CHECKS.profile({ ...p, welcomeTour: 'again' })).toBe(false);
  });
});

describe('the intake asks only what the app uses', () => {
  it('win, when and bodyweight are hidden; the model keeps them', () => {
    expect([...HIDDEN_SCREENS].sort()).toEqual(['bodyweight', 'when', 'win']);
    for (const a of [{}, { experience: 'new' }, { cardio: 'none' }] as IntakeAnswers[]) for (const h of HIDDEN_SCREENS) expect(visibleScreens(a)).not.toContain(h);
    for (const h of HIDDEN_SCREENS) expect(SCREENS).toContain(h);
    // Older saved answers still load, whole.
    const old = sanitizeAnswers({ goal: 'muscle', win: ['lifts'], when: 'early', bodyweight: { value: 80, unit: 'kg' } });
    expect(old.when).toBe('early');
    expect(old.bodyweight).toEqual({ value: 80, unit: 'kg' });
    expect(old.win?.length).toBe(1);
  });

  it('a redo walks past the hidden questions and keeps their older answers, Skip the rest included', () => {
    const old: IntakeAnswers = { goal: 'muscle', goals: ['muscle'], when: 'early', bodyweight: { value: 80, unit: 'kg' }, focus: ['back'] };
    let s = funnelReducer({ step: 'focus', answers: old }, { type: 'next' });
    expect(s.step).toBe('experience');
    s = funnelReducer({ step: 'exercises', answers: old }, { type: 'skip' });
    expect(s.step).toBe('about');
    expect(funnelReducer(s, { type: 'back' }).step).toBe('exercises');
    const rest = funnelReducer({ step: 'easyOn', answers: old }, { type: 'skipRest' });
    expect(rest.step).toBe('reveal');
    expect(rest.answers.when).toBe('early');
    expect(rest.answers.bodyweight).toEqual({ value: 80, unit: 'kg' });
  });

  it('an older draft left on a hidden question picks up at the next one that shows', () => {
    expect(parseDraft(JSON.stringify({ step: 'win', answers: { goal: 'muscle' } }))!.step).toBe('experience');
    expect(parseDraft(JSON.stringify({ step: 'when', answers: { goal: 'muscle' } }))!.step).toBe('about');
    expect(parseDraft(JSON.stringify({ step: 'bodyweight', answers: { goal: 'muscle' } }))!.step).toBe('about');
  });
});
