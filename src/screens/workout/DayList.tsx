import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { GymPill } from '../../components/GymPill';
import type { WorkoutEntry } from '../../lib/planWorkout';
import { dayTitle } from '../plans/planWords';
import { Thumb } from './Thumb';
import { Ring } from '../../ui/Ring';
import { Button } from '../../ui/Button';
import { CheckIcon } from '../../ui/icons';
import type { Workout } from './useWorkout';
import styles from './DayList.module.css';

type Props = {
  w: Workout;
  /** The exercise last opened: its tile is where the hero shrinks back to (view transition). */
  heroId: string | null;
  onOpen: (exerciseId: string) => void;
  onAdd: () => void;
};

/** Empty, a ring filling per set done, then a check (SPEC 20.1). */
function Progress({ done, total }: { done: number; total: number }) {
  const full = total > 0 && done >= total;
  return (
    <span className={styles.progress} data-full={full || undefined}>
      <Ring fraction={total > 0 ? done / total : 0} size={32} stroke={3} glideMs={240} full={full}>
        {full ? <CheckIcon width={16} height={16} strokeWidth={3} /> : null}
      </Ring>
    </span>
  );
}

/** Names the tapped row's tile so it grows into the exercise hero; only one tile has the name. */
function nameHero(row: HTMLElement) {
  const main = row.closest('main');
  main?.querySelectorAll<HTMLElement>('[data-testid="thumb"]').forEach((t) => (t.style.viewTransitionName = ''));
  const tile = row.querySelector<HTMLElement>('[data-testid="thumb"]');
  if (tile) tile.style.viewTransitionName = 'ex-hero';
}

/**
 * The day list (SPEC 20.1): the day's name, gym and time, then one row per exercise in order with
 * its demo tile, name, sets × reps and the plan's rest. Pairs share a colored rail. Done rows dim,
 * the next one is highlighted. Tap a row to open it; that is the only navigation needed.
 */
export function DayList({ w, heroId, onOpen, onAdd }: Props) {
  const mainRef = useRef<HTMLElement>(null);
  const title = w.day ? dayTitle(w.day.n, w.day.name) : 'Quick workout';

  // The next row comes into view when the list opens (and when it comes back after an exercise).
  useLayoutEffect(() => {
    const main = mainRef.current;
    const row = w.nextId ? main?.querySelector<HTMLElement>(`[data-row="${CSS.escape(w.nextId)}"]`) : null;
    if (!main || !row) return;
    const top = row.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    if (top + row.offsetHeight > main.clientHeight - 24) main.scrollTop = Math.max(0, top - 96);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.ready]);

  const row = (e: WorkoutEntry) => {
    const done = w.done[e.exerciseId] ?? 0;
    const full = done >= e.sets;
    const state = full ? 'done' : e.exerciseId === w.nextId ? 'next' : 'todo';
    const rest = w.userRestOf(e.exerciseId) ?? e.statedRest;
    const name = w.nameOf(e.exerciseId);
    return (
      <li key={e.exerciseId}>
        <button
          type="button"
          className={`${styles.row} pressable`}
          data-state={state}
          data-row={e.exerciseId}
          data-testid={e.finisher ? 'finisher' : `row-${e.exerciseId}`}
          aria-current={state === 'next' ? 'step' : undefined}
          aria-label={`${name}, ${e.setsText || 'finisher'}${done ? `, ${Math.min(done, e.sets)} of ${e.sets} done` : ''}${state === 'next' ? ', up next' : ''}`}
          onClick={(ev) => {
            nameHero(ev.currentTarget);
            onOpen(e.exerciseId);
          }}
        >
          <Thumb name={name} loadType={w.loadTypeOf(e.exerciseId)} vtName={e.exerciseId === heroId ? 'ex-hero' : undefined} />
          <span className={styles.text}>
            <span className={styles.name}>{name}</span>
            {e.setsText && <span className={`${styles.sets} num`}>{e.setsText}</span>}
            {rest !== undefined && rest > 0 && <span className={`${styles.rest} num`}>{rest} s rest</span>}
          </span>
          <Progress done={done} total={e.sets} />
        </button>
      </li>
    );
  };

  // Rows in order; a pair's rows share one rail with "Pair: back to back" (SPEC 13.1, 20.1).
  const blocks: ReactNode[] = [];
  const entries = w.entries;
  for (let i = 0; i < entries.length; ) {
    const e = entries[i]!;
    if (e.kind === 'pair') {
      const group: WorkoutEntry[] = [];
      while (i < entries.length && entries[i]!.kind === 'pair' && entries[i]!.block === e.block) group.push(entries[i++]!);
      blocks.push(
        <li key={`pair-${e.block}`} className={styles.pair} data-warmup={e.warmup || undefined} data-testid="pair-group">
          <p className={styles.pairLabel}>{e.warmup ? 'Warm up · Pair: back to back' : 'Pair: back to back'}</p>
          <ol className={styles.pairRows}>{group.map(row)}</ol>
        </li>,
      );
      continue;
    }
    if (e.finisher || e.warmup) {
      blocks.push(
        <li key={`label-${e.exerciseId}`} className={e.finisher ? styles.finisherLabel : styles.warmLabel} aria-hidden="true">
          {e.finisher ? 'Finisher' : 'Warm up'}
        </li>,
      );
    }
    blocks.push(row(e));
    i++;
  }

  return (
    <main className={styles.main} ref={mainRef} aria-label={title}>
      <header className={styles.titleBlock}>
        <h1 className={styles.title} data-testid="workout-title">
          {title}
        </h1>
        <p className={styles.meta}>
          <GymPill align="start" />
          {w.minutes !== undefined && <span className={`${styles.minutes} num`}>~{w.minutes} min</span>}
          <span className={styles.music}>
            <a className={`${styles.musicLink} pressable`} href="https://open.spotify.com/" target="_blank" rel="noopener" aria-label="Open Spotify">
              Spotify
            </a>
            <a className={`${styles.musicLink} pressable`} href="https://music.apple.com/" target="_blank" rel="noopener" aria-label="Open Apple Music">
              Music
            </a>
          </span>
        </p>
      </header>
      {entries.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Empty workout</h2>
          <p className={styles.emptySub}>Add your first exercise to start.</p>
        </div>
      ) : (
        <ol className={styles.list} aria-label="Exercises">
          {blocks}
        </ol>
      )}
      {w.isQuick && (
        <div className={styles.addRow}>
          <Button variant="secondary" onClick={onAdd}>
            + Add exercise
          </Button>
        </div>
      )}
    </main>
  );
}
