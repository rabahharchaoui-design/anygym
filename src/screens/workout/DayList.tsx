import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { GymPill } from '../../components/GymPill';
import type { WorkoutEntry } from '../../lib/planWorkout';
import { dayTitle } from '../plans/planWords';
import { quickTitleOf } from '../../lib/quick';
import { Thumb } from './Thumb';
import { demoFor } from '../../data/exerciseInfo';
import { swapLine } from '../../lib/swap';
import { Ring } from '../../ui/Ring';
import { Button } from '../../ui/Button';
import { AudioLinesIcon, CheckIcon, MusicIcon, PlayIcon, XIcon } from '../../ui/icons';
import type { Workout } from './useWorkout';
import type { ToastMessage } from '../../ui/Toast';
import { EffortChip } from './EffortChip';
import { effortOf } from '../../db/coach';
import { useLive } from '../../hooks/useLive';
import { UpNextCard, useUpNext } from './UpNext';
import styles from './DayList.module.css';

type Props = {
  w: Workout;
  /** The exercise last opened: its tile is where the hero shrinks back to (view transition). */
  heroId: string | null;
  onOpen: (exerciseId: string) => void;
  onAdd: () => void;
  /** PLAN 3.8c: the exercise just finished; its feel question shows right under its row until answered. */
  effortFor?: string | null;
  /** A still copy (drawn under the edge swipe): no hint, no Start pill. */
  still?: boolean;
  /** PLAN 3.4: a swapped row's Change and Restore. */
  onChangeSwap?: (exerciseId: string) => void;
  onRestoreSwap?: (exerciseId: string) => void;
  /** PLAN 3.9: the gym pill's "Now at … · Undo" goes to the workout's toast. */
  onToast?: (t: ToastMessage) => void;
  /** PLAN 3.4a: a quick workout's Up next adds one exercise and opens it. */
  onAddOne?: (exerciseId: string, restSec: number) => void;
  sessionId?: string;
  /** PLAN 3.6: the time estimate opens "How much time today?". */
  onTime?: () => void;
  /** PLAN 3.6: one quiet line under the title (the time offer, or what the trim did). */
  timeLine?: TimeLine | null;
};

/** A quiet line with one action ("Make it fit") and, for an offer, a close button. */
export type TimeLine = { text: string; action: string; onAction: () => void; onDismiss?: () => void };

/** The compact Easy/Good/Hard row under the exercise just finished; gone once it has an answer. */
function ListEffort({ sessionId, exerciseId }: { sessionId: string; exerciseId: string }) {
  const live = useLive(() => effortOf(sessionId, exerciseId), [sessionId, exerciseId]);
  if (!live.ready || live.data?.effort) return null;
  return <EffortChip compact sessionId={sessionId} exerciseId={exerciseId} />;
}

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
export function DayList({ w, heroId, onOpen, onAdd, effortFor = null, still = false, onChangeSwap, onRestoreSwap, onToast, onAddOne, sessionId = '', onTime, timeLine }: Props) {
  const mainRef = useRef<HTMLElement>(null);
  const ideas = useUpNext(w, sessionId);
  /** A row's photo is being decoded before its screen opens: a second tap does nothing. */
  const opening = useRef(false);
  // The Start pill belongs to the live list, never the copy drawn under an edge swipe.
  const nextEntry = w.nextId ? w.entries.find((e) => e.exerciseId === w.nextId) : undefined;
  // "Start · Squat" before its first set, then "Continue · Squat set 2 of 4" (gate 3). On a narrow
  // phone the name shortens ("Continue · Barbell Ba… set 2 of 4"), never the set (gate P7).
  const nextDone = nextEntry ? (w.done[nextEntry.exerciseId] ?? 0) : 0;
  const pillVerb = nextDone > 0 ? 'Continue' : 'Start';
  const pillName = nextEntry ? w.nameOf(nextEntry.exerciseId) : '';
  const pillSet = nextEntry && nextDone > 0 ? `set ${Math.min(nextDone + 1, nextEntry.sets)} of ${nextEntry.sets}` : '';
  const pillLabel = !nextEntry ? '' : `${pillVerb} ${pillName}${pillSet ? `, ${pillSet}` : ''}`;
  const title = w.day ? dayTitle(w.day.n, w.day.name) : quickTitleOf(w.session?.quickStyle);
  // "Continue · Squat · set 3 of 4" when it fits; on a narrow phone the second "·" goes before the
  // name shortens (gate round 2 P5). Measured, so the pill never guesses.
  const nameRef = useRef<HTMLSpanElement>(null);
  const sepRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const name = nameRef.current;
    const label = name?.parentElement;
    if (!name || !label || !pillSet) return;
    const fit = () => {
      label.removeAttribute('data-tight');
      if (name.scrollWidth > name.clientWidth + 0.5) label.setAttribute('data-tight', '');
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(label.parentElement ?? label);
    return () => ro?.disconnect();
  }, [pillName, pillSet]);

  // The next row comes into view when the list opens (and when it comes back after an exercise or
  // an Undo), above the Start pill and the rest bar, never under them.
  useLayoutEffect(() => {
    const main = mainRef.current;
    const row = w.nextId ? main?.querySelector<HTMLElement>(`[data-row="${CSS.escape(w.nextId)}"]`) : null;
    if (!main || !row) return;
    const box = main.getBoundingClientRect();
    const pill = main.querySelector<HTMLElement>('[data-testid="start-next"]');
    const bottomCover = Math.max(parseFloat(getComputedStyle(main).paddingBottom) || 0, pill ? pill.offsetHeight + 24 : 0);
    const top = row.getBoundingClientRect().top - box.top + main.scrollTop;
    if (top + row.offsetHeight > main.scrollTop + main.clientHeight - bottomCover) main.scrollTop = Math.max(0, top - 96);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.ready]);

  const row = (e: WorkoutEntry) => {
    const done = w.done[e.exerciseId] ?? 0;
    const full = done >= e.sets;
    const state = full ? 'done' : e.exerciseId === w.nextId ? 'next' : 'todo';
    const rest = w.userRestOf(e.exerciseId) ?? e.statedRest;
    const name = w.nameOf(e.exerciseId);
    const swap = w.swapOf(e.exerciseId);
    const line = swapLine(swap);
    return (
      <li key={e.exerciseId} className={styles.rowItem}>
        <button
          type="button"
          className={`${styles.row} pressable`}
          data-state={state}
          data-skip={(e.noFit && done === 0) || undefined}
          data-row={e.exerciseId}
          data-testid={e.finisher ? 'finisher' : `row-${e.exerciseId}`}
          aria-current={state === 'next' ? 'step' : undefined}
          aria-label={`${name}, ${e.setsText || 'finisher'}${done ? `, ${Math.min(done, e.sets)} of ${e.sets} done` : ''}${state === 'next' ? ', up next' : ''}${line ? `. ${line}` : ''}`}
          onClick={(ev) => {
            if (opening.current) return;
            nameHero(ev.currentTarget);
            // The tile's photo is decoded before the screen change starts (round 3, critic B1), so
            // the flying photo is never blank; it is already on screen, so this costs a frame at most.
            const img = ev.currentTarget.querySelector<HTMLImageElement>('[data-photo] img');
            if (!img?.decode) return onOpen(e.exerciseId);
            opening.current = true;
            const open = () => {
              opening.current = false;
              onOpen(e.exerciseId);
            };
            void Promise.race([img.decode(), new Promise((r) => window.setTimeout(r, 60))]).then(open, open);
          }}
        >
          <Thumb name={name} loadType={w.loadTypeOf(e.exerciseId)} photo={demoFor(e.exerciseId)} vtName={e.exerciseId === heroId ? 'ex-hero' : undefined} />
          <span className={styles.text}>
            <span className={styles.name}>{name}</span>
            {e.setsText && <span className={`${styles.sets} num`}>{e.setsText}</span>}
            {/* 3.5b round 4 (M8): inside a Quick pair or circuit the rest is said once, on the group. */}
            {rest !== undefined && rest > 0 && !e.roundRest && <span className={`${styles.rest} num`}>{rest} s rest</span>}
          </span>
          <Progress done={done} total={e.sets} />
        </button>
        {line && (
          <div className={styles.swapLine} data-testid={`swap-line-${e.exerciseId}`}>
            <p className={styles.swapWhy}>{line}</p>
            {!swap?.noFit && !full && (
              <span className={styles.swapActions}>
                <button type="button" className={`${styles.swapButton} pressable`} disabled={still} aria-label={`Change ${name}`} onClick={() => onChangeSwap?.(e.exerciseId)}>
                  Change
                </button>
                <button type="button" className={`${styles.swapButton} pressable`} disabled={still} aria-label={`Restore ${swap ? w.nameOf(swap.slot) : ''}`} onClick={() => onRestoreSwap?.(e.exerciseId)}>
                  Restore
                </button>
              </span>
            )}
          </div>
        )}
        {!still && sessionId && effortFor === e.exerciseId && <ListEffort sessionId={sessionId} exerciseId={e.exerciseId} />}
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
        <li key={`pair-${e.block}`} className={styles.pair} data-warmup={e.warmup || undefined} data-mobility={e.mobility || undefined} data-testid={e.mobility ? 'mobility-group' : 'pair-group'}>
          <p className={styles.pairLabel}>{e.mobility ? 'Stretches: back to back' : e.warmup ? 'Warm up · Pair: back to back' : group.length > 2 ? `Circuit: ${e.sets} ${e.sets === 1 ? 'round' : 'rounds'}, one after another` : 'Pair: back to back'}</p>
          {/* PLAN 3.5g: only a rest the plan (or the person) states, like every other row. */}
          {e.roundRest && (w.userRestOf(e.exerciseId) ?? e.statedRest ?? 0) > 0 && (
            <p className={`${styles.pairRest} num`} data-testid="group-rest">
              Rest {w.userRestOf(e.exerciseId) ?? e.statedRest} s after each round
            </p>
          )}
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
    <main className={styles.main} ref={mainRef} aria-label={title} data-pill={(!still && !w.isQuick && !!nextEntry) || undefined}>
      <header className={styles.titleBlock}>
        <h1 className={styles.title} data-testid="workout-title">
          {title}
        </h1>
        <div className={styles.metaRow}>
          {/* One quiet metadata line: "My Gym · ~90 min". */}
          <p className={`${styles.meta} num`} data-testid="workout-meta">
            <GymPill align="start" still={still} onToast={onToast} inWorkout />
            {w.minutes !== undefined &&
              (onTime && !still ? (
                <>
                  <span className={styles.minutesSep}>{'\u00a0·\u00a0'}</span>
                  <button type="button" className={`${styles.minutesButton} pressable`} data-testid="time-estimate" data-trimmed={!!w.session?.trim || undefined} aria-label={`About ${w.minutes} min. How much time today?`} onClick={onTime}>
                    ~{w.minutes} min
                  </button>
                </>
              ) : (
                <span className={styles.minutes}>{'\u00a0· '}~{w.minutes} min</span>
              ))}
          </p>
          <span className={styles.music}>
            <a className={`${styles.musicLink} pressable`} href="https://open.spotify.com/" target="_blank" rel="noopener" aria-label="Open Spotify">
              <span className={styles.musicPill}>
                <AudioLinesIcon width={15} height={15} strokeWidth={2.2} aria-hidden="true" />
                Spotify
              </span>
            </a>
            <a className={`${styles.musicLink} pressable`} href="https://music.apple.com/" target="_blank" rel="noopener" aria-label="Open Apple Music">
              <span className={styles.musicPill}>
                <MusicIcon width={15} height={15} strokeWidth={2.2} aria-hidden="true" />
                Music
              </span>
            </a>
          </span>
        </div>
        {timeLine && !still && (
          <div className={styles.timeLine} data-testid="time-line">
            <p className={styles.timeText}>{timeLine.text}</p>
            <button type="button" className={`${styles.timeAction} pressable`} onClick={timeLine.onAction}>
              {timeLine.action}
            </button>
            {timeLine.onDismiss && (
              <button type="button" className={`${styles.timeClose} pressable`} aria-label="Not today" onClick={timeLine.onDismiss}>
                <XIcon width={16} height={16} strokeWidth={2.4} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
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
      {/* The one primary action, in the thumb zone: open the exercise up next (an extra path to the row). */}
      {!still && !w.isQuick && nextEntry && (
        <div className={styles.startDock}>
          <button
            type="button"
            className={`${styles.startPill} pressable`}
            aria-label={pillLabel}
            data-testid="start-next"
            onClick={() => {
              const rowEl = mainRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(nextEntry.exerciseId)}"]`);
              if (rowEl) nameHero(rowEl);
              onOpen(nextEntry.exerciseId);
            }}
          >
            <PlayIcon width={16} height={16} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
            {/* One line; a long name ends in "…" on purpose (the full name is the button's label). */}
            <span className={styles.startLabel}>
              <span className={styles.startVerb}>{pillVerb} · </span>
              <span className={styles.startName} data-truncate-ok ref={nameRef}>
                {pillName}
              </span>
              {pillSet && (
                <span className={styles.startSet}>
                  <span className={styles.startSep} ref={sepRef}>
                    {' · '}
                  </span>
                  {pillSet}
                </span>
              )}
            </span>
          </button>
        </div>
      )}
      {w.isQuick && !still && ideas && onAddOne && <UpNextCard w={w} ideas={ideas} onAdd={onAddOne} />}
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
