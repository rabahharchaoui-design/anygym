import { useMemo } from 'react';
import { db } from '../../db/schema';
import { getProfile } from '../../db/intake';
import { useLive } from '../../hooks/useLive';
import { profileFor, upNextPool } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import { upNextIdeas, type Goal, type Idea, type Muscle } from '../../lib/order';
import { quickEntry } from '../../lib/planWorkout';
import { goalsOf } from '../../lib/intake/funnel';
import type { FocusId } from '../../lib/intake/options';
import { PlusIcon } from '../../ui/icons';
import { Thumb } from './Thumb';
import type { Workout } from './useWorkout';
import styles from './UpNext.module.css';

/** Intake focus areas (SPEC 14) as the muscles Up next favors. */
const FOCUS_MUSCLES: Record<FocusId, Muscle[]> = {
  chest: ['chest'],
  back: ['back'],
  shoulders: ['front delts', 'side delts', 'rear delts'],
  arms: ['biceps', 'triceps'],
  core: ['abs'],
  glutes: ['glutes'],
  legs: ['quads', 'hamstrings'],
  balance: [],
};

const HOURS_48 = 48 * 60 * 60 * 1000;

/** Muscles other workouts trained in the last 48 hours (SPEC 22: not two days in a row). */
async function recentMuscles(sessionId: string, now: number): Promise<Muscle[]> {
  const sessions = await db.sessions.where('startedAt').aboveOrEqual(now - HOURS_48).toArray();
  const ids = sessions.filter((s) => s.id !== sessionId && !s.imported && s.endedAt !== undefined).map((s) => s.id);
  if (!ids.length) return [];
  const sets = await db.sets.where('sessionId').anyOf(ids).toArray();
  return [...new Set(sets.flatMap((s) => profileFor(s.exerciseId).targets))];
}

/**
 * The Up next ideas once every set of a quick workout is done (SPEC 20.3, 22): what was done, in
 * the order it was finished, against everything this gym can surely do. Null while a read runs.
 */
export function useUpNext(w: Workout, sessionId: string): Idea[] | null {
  const show = w.ready && w.isQuick && w.nextId === null && w.sets.length > 0;
  const profile = useLive(() => (show ? getProfile() : Promise.resolve(undefined)), [show]);
  const recent = useLive(() => (show ? recentMuscles(sessionId, Date.now()) : Promise.resolve([] as Muscle[])), [show, sessionId]);
  const doneKey = show ? [...new Map(w.sets.map((s, i) => [s.exerciseId, i])).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id).join('|') : '';
  const inWorkout = (w.session?.exerciseIds ?? []).join('|');
  const gym = w.gym;
  return useMemo(() => {
    if (!show || !gym || !profile.ready || !recent.ready) return null;
    const intake = profile.data?.intake;
    const done = doneKey.split('|').filter(Boolean).map((id) => profileFor(id, w.nameOf(id)));
    const taken = new Set(inWorkout.split('|').map(SWAP_DATA.sameAs));
    const pool = upNextPool(gym).filter((p) => !taken.has(SWAP_DATA.sameAs(p.id)));
    return upNextIdeas(done, pool, {
      goal: (intake ? goalsOf(intake)[0] : undefined) as Goal | undefined,
      focus: (intake?.focus ?? []).flatMap((f) => FOCUS_MUSCLES[f] ?? []),
      recent: recent.data ?? [],
      easyOn: (intake?.easyOn ?? []).filter((e) => e !== 'none'),
      sameAs: SWAP_DATA.sameAs,
    }).map((idea) => ({ ...idea, profile: { ...idea.profile, name: w.nameOf(idea.profile.id) } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, gym, profile.ready, profile.data, recent.ready, recent.data, doneKey, inWorkout]);
}

type Props = { w: Workout; ideas: Idea[]; onAdd: (exerciseId: string) => void };

/**
 * "Up next" (SPEC 20.3, 22): one big suggestion with why, one tap adds it (quick workout sets, reps
 * and rest filled in), and "Other ideas" below. Only exercises this gym can do; a demo tile only for
 * a sure match. Honest when fewer fit.
 */
export function UpNextCard({ w, ideas, onAdd }: Props) {
  const [pick, ...others] = ideas;
  if (!pick) {
    return (
      <section className={styles.card} aria-label="Up next" data-testid="up-next">
        <p className={styles.eyebrow}>Up next</p>
        <p className={styles.empty} data-testid="up-next-empty">
          Nothing else here fits this gym. Finish when you are ready, or add one from the list.
        </p>
      </section>
    );
  }
  const line = (id: string) => quickEntry(id, w.nameOf(id), w.loadTypeOf(id), 0).setsText;
  return (
    <section className={styles.card} aria-label="Up next" data-testid="up-next">
      <button
        type="button"
        className={`${styles.pick} pressable`}
        onClick={() => onAdd(pick.profile.id)}
        aria-label={`Up next: ${pick.profile.name}. ${pick.reason}. Add it`}
        data-testid="up-next-pick"
        data-id={pick.profile.id}
      >
        <span className={styles.eyebrow}>Up next</span>
        <span className={styles.pickRow}>
          <Thumb name={pick.profile.name} loadType={w.loadTypeOf(pick.profile.id)} photo={demoFor(pick.profile.id)} />
          <span className={styles.pickText}>
            <span className={styles.pickName}>{pick.profile.name}</span>
            <span className={styles.reason} data-testid="up-next-reason">
              {pick.reason}
            </span>
            <span className={`${styles.sets} num`}>{line(pick.profile.id)}</span>
          </span>
          <span className={styles.addDot} aria-hidden="true">
            <PlusIcon width={22} height={22} strokeWidth={2.6} />
          </span>
        </span>
      </button>
      {others.length > 0 && (
        <>
          <p className={styles.othersLabel}>Other ideas</p>
          <ul className={styles.others}>
            {others.map((o) => (
              <li key={o.profile.id}>
                <button
                  type="button"
                  className={`${styles.other} pressable`}
                  onClick={() => onAdd(o.profile.id)}
                  aria-label={`${o.profile.name}. ${o.reason}. Add it`}
                  data-testid="up-next-other"
                  data-id={o.profile.id}
                >
                  <span className={styles.otherText}>
                    <span className={styles.otherName}>{o.profile.name}</span>
                    <span className={styles.reason}>{o.reason}</span>
                  </span>
                  <PlusIcon className={styles.otherPlus} width={18} height={18} strokeWidth={2.6} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
