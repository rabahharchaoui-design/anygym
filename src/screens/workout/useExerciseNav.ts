import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supportsViewTransitions, type useNav } from '../../ui/nav';

/** Which way the last go() moved, as nav.ts records it when it has to fall back. */
const fallbackDir = (): number => {
  const k = document.documentElement.dataset.navFallback;
  return k === 'push' ? 1 : k === 'pop' ? -1 : 0;
};

/**
 * Moving between the day list and an exercise: iOS push and pop view transitions (src/ui/nav.ts),
 * the tile the hero shrinks back into, and the day card that expands into this screen.
 */
export function useExerciseNav(go: ReturnType<typeof useNav>, sessionId: string, exerciseId: string | null) {
  const location = useLocation();
  // Screen changes are iOS push and pop view transitions (src/ui/nav.ts): the header and the rest
  // bar have their own names so they stay put, and the tapped row's tile grows into the hero.
  const navState = location.state as {
    fromList?: boolean;
    instant?: boolean;
    expand?: boolean;
  } | null;
  const fromList = navState?.fromList === true;
  // The exercise the list was last left from: its tile is the one the hero shrinks back into.
  const [lastViewed, setLastViewed] = useState<string | null>(exerciseId);
  useEffect(() => {
    if (exerciseId) setLastViewed(exerciseId);
  }, [exerciseId]);
  // Arriving from Today's Start: the day card expands into this screen (named for that one transition).
  const [expanding, setExpanding] = useState(navState?.expand === true);
  useEffect(() => {
    if (!expanding) return;
    const t = window.setTimeout(() => setExpanding(false), 600);
    return () => window.clearTimeout(t);
  }, [expanding]);

  /** PLAN 3.8c: the exercise just finished, whose Easy/Good/Hard question also sits on the day list. */
  const [justDone, setJustDone] = useState<string | null>(null);
  const openExercise = (id: string, instant = false) => {
    setJustDone((cur) => (cur === id ? cur : null));
    go(`/workout/${sessionId}/${encodeURIComponent(id)}`, {
      kind: instant ? 'none' : 'push',
      state: { fromList: true, ...(instant ? { instant: true } : {}) },
    });
  };
  const switchExercise = (id: string) => {
    setJustDone((cur) => (cur === id ? cur : null));
    go(`/workout/${sessionId}/${encodeURIComponent(id)}`, {
      kind: 'push',
      replace: true,
      state: { fromList },
    });
  };
  const goList = (kind: 'pop' | 'none' = 'pop') => {
    if (fromList) go(-1, { kind });
    else go(`/workout/${sessionId}`, { kind, replace: true });
  };
  const viewRef = useRef<HTMLDivElement | null>(null);
  // No View Transitions here: the views move with Motion instead (read once; it never changes).
  const [fallback] = useState(() => !supportsViewTransitions());
  const dir = fallback ? fallbackDir() : 0;
  return { lastViewed, expanding, justDone, setJustDone, openExercise, switchExercise, goList, viewRef, fallback, dir };
}
