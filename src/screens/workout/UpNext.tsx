import { useMemo } from 'react';
import { useTraining } from '../../hooks/useTraining';
import { focusMuscles } from '../../lib/plan/focus';
import { getProfile } from '../../db/intake';
import { useLive } from '../../hooks/useLive';
import { profileFor, upNextPool } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import { restFor, upNextIdeas, type Goal, type Idea } from '../../lib/order';
import { quickEntry } from '../../lib/planWorkout';
import { goalsOf } from '../../lib/intake/funnel';
import { PlusIcon } from '../../ui/icons';
import { Thumb } from './Thumb';
import type { Workout } from './useWorkout';
import styles from './UpNext.module.css';

/**
 * The Up next ideas once every set of a quick workout is done (SPEC 20.3, 22): what was done, in
 * the order it was finished, against everything this gym can surely do. Null while a read runs.
 */
/** An idea with the rest it brings (SPEC 22 rule 6, by the user's goal). */
export type UpNextIdea = Idea & { restSec: number };

export function useUpNext(w: Workout, sessionId: string): UpNextIdea[] | null {
  const show = w.ready && w.isQuick && w.nextId === null && w.sets.length > 0;
  const profile = useLive(() => (show ? getProfile() : Promise.resolve(undefined)), [show]);
  const recent = useTraining(show, sessionId);
  const doneKey = show ? [...new Map(w.sets.map((s, i) => [s.exerciseId, i])).entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id).join('|') : '';
  const inWorkout = (w.session?.exerciseIds ?? []).join('|');
  const gym = w.gym;
  return useMemo(() => {
    if (!show || !gym || !profile.ready || !recent.ready) return null;
    const intake = profile.data?.intake;
    const done = doneKey.split('|').filter(Boolean).map((id) => profileFor(id, w.nameOf(id)));
    const taken = new Set(inWorkout.split('|').map(SWAP_DATA.sameAs));
    const pool = upNextPool(gym).filter((p) => !taken.has(SWAP_DATA.sameAs(p.id)));
    const goal = (intake ? goalsOf(intake)[0] : undefined) as Goal | undefined;
    return upNextIdeas(done, pool, {
      goal,
      experience: intake?.experience,
      focus: focusMuscles(intake?.focusPicks ?? intake?.focus),
      recent: recent.data ?? [],
      easyOn: (intake?.easyOn ?? []).filter((e) => e !== 'none'),
      sameAs: SWAP_DATA.sameAs,
    }).map((idea) => ({ ...idea, restSec: restFor(idea.profile, goal), profile: { ...idea.profile, name: w.nameOf(idea.profile.id) } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, gym, profile.ready, profile.data, recent.ready, recent.data, doneKey, inWorkout]);
}

type Props = { w: Workout; ideas: UpNextIdea[]; onAdd: (exerciseId: string, restSec: number) => void };

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
  const line = (i: UpNextIdea) => `${quickEntry(i.profile.id, i.profile.name, w.loadTypeOf(i.profile.id), 0).setsText} · ${i.restSec} s rest`;
  return (
    <section className={styles.card} aria-label="Up next" data-testid="up-next">
      <button
        type="button"
        className={`${styles.pick} pressable`}
        onClick={() => onAdd(pick.profile.id, pick.restSec)}
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
            <span className={`${styles.sets} num`}>{line(pick)}</span>
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
                  onClick={() => onAdd(o.profile.id, o.restSec)}
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
      {/* Honest when fewer than 3 fit (SPEC 20.3): says how many, never pads the list. */}
      {ideas.length < 3 && (
        <p className={styles.fewer} data-testid="up-next-fewer">
          Only {ideas.length} other {ideas.length === 1 ? 'move fits' : 'moves fit'} here
        </p>
      )}
    </section>
  );
}
