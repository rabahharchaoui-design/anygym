import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { COLLAPSE_PX, TopBar } from '../ui/TopBar';
import { IconButton } from '../ui/IconButton';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { ChevronRight, CoachIcon, SettingsIcon } from '../ui/icons';
import { useNav } from '../ui/nav';
import { GymPill } from '../components/GymPill';
import { LoadError } from '../components/LoadError';
import { Toast, undoToast, type ToastMessage } from '../ui/Toast';
import { planById } from '../data/plans';
import { dayIndexOf } from '../lib/plans';
import { workSetCount } from '../lib/workSets';
import { db } from '../db/schema';
import { startDb } from '../db/bootstrap';
import { getPlanState, setNextDay } from '../db/planState';
import { getActiveSession, startPlanDay, startWorkout } from '../db/workouts';
import { discardEmptyWorkout, undoDiscard } from '../db/discard';
import { clearSessionDrafts } from '../lib/drafts';
import { useLive } from '../hooks/useLive';
import { useTapGuard } from '../hooks/useTapGuard';
import { applyUpdate, isUpdateReady, onUpdateReady } from '../lib/pwaUpdate';
import { registerTap } from '../lib/secretTaps';
import { DayCard } from './today/DayCard';
import { ChangeDaySheet } from './today/ChangeDaySheet';
import { BackupReminder } from './today/BackupReminder';
import { useBackup } from './settings/useBackup';
import { snoozeBackupReminder } from '../db/backup';
import { onlyOnPhone, reminderReason, shouldRemind, SNOOZE_MS } from '../lib/backup';
import { TimeBudgetSheet } from './workout/TimeBudgetSheet';
import { applyNextStart, localDay, pickFor, readNextStart, trimFor, writeNextStart } from './today/startBudget';
import { useActiveGym } from '../db/useActiveGym';
import { getProfile } from '../db/intake';
import { rememberBudget } from '../db/timeBudget';
import { AS_PLANNED, fitWords } from '../lib/timeBudget';
import { canBuild, chipFor } from '../lib/quick';
import { QUICK_DEPS } from '../data/quick';
import { baseInput, equipmentPath, kitOf } from './quick/quickInput';
import { useCoach } from './today/useCoach';
import { CoachCard, CoachLine } from './today/CoachCard';
import { FreshMuscles } from './today/FreshMuscles';
import { LeveledUpSheet } from './today/LeveledUpSheet';
import { applyLighterWeek } from './today/coachStart';
import { ResumeCard } from './today/ResumeCard';
import { useArrivalToast } from './today/useArrivalToast';
import { WelcomeTour } from './today/WelcomeTour';
import { shouldShowTour } from '../lib/welcomeTour';
import styles from './TodayScreen.module.css';

const NO_LOGGED: Readonly<Record<string, number>> = {};

export function TodayScreen() {
  const go = useNav();
  // Hidden: 7 taps on the title within 3 s opens the viewport diagnostics (PLAN 1.10b).
  const titleTaps = useRef<number[]>([]);
  const onTitleTap = () => {
    const r = registerTap(titleTaps.current, Date.now());
    titleTaps.current = r.taps;
    if (r.fired) go('/dev/viewport');
  };
  const location = useLocation();
  // Open the database first, outside the live query: awaiting a non Dexie promise inside it would
  // stop it from tracking, and Today would never see a later Change day or finish.
  const [dbOpen, setDbOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const done = () => alive && setDbOpen(true);
    startDb().then(done, done);
    return () => {
      alive = false;
    };
  }, []);
  const live = useLive(async () => {
    if (!dbOpen) return null;
    const active = await getActiveSession();
    const planState = await getPlanState();
    const activeRows = active ? await db.sets.where('sessionId').equals(active.id).toArray() : [];
    const activeSets = workSetCount(activeRows);
    // The backup reminder (SPEC 9.1): finished workouts and when the last backup was.
    const profile = await db.profile.toCollection().first();
    const done = await db.sessions.filter((s) => s.endedAt !== undefined || s.imported).toArray();
    const last = profile?.lastBackupAt;
    // Only on this phone: finished workouts the last successful backup did not hold, by id (never
    // guessed from dates or from being imported).
    const onlyHere = onlyOnPhone(done.map((s) => s.id), profile?.backedUpSessionIds);
    return { active: active ?? null, planState: planState ?? null, activeSets, activeEmpty: !!active && activeRows.length === 0, finished: done.length, onlyHere, lastBackupAt: last, snoozeUntil: profile?.backupSnoozeUntil };
  }, [dbOpen]);
  // A failed read shows "Could not load workouts · Try again", never a false "Pick a plan"; the last
  // good result stays on screen (PLAN 1.7f).
  // PLAN 3.8: the coach reads with Today, so its card never shifts the page in after the rest.
  const coach = useCoach(dbOpen);
  const [seeChanges, setSeeChanges] = useState(false);
  const data = { ready: dbOpen && live.ready && live.data != null && coach.ready, value: live.data ?? undefined };
  const failed = dbOpen && live.error !== null && !data.ready;
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [updateReady, setUpdateReady] = useState(isUpdateReady);
  const [error, setError] = useState(false);
  // false: closed; true: open; a number: open with that day picked (a tapped pip).
  const [changing, setChanging] = useState<boolean | number>(false);

  useEffect(() => onUpdateReady(setUpdateReady), []);

  // The toast sits just above the tab bar (gate 3), opaque, never over the cards' buttons.
  const quickRef = useRef<HTMLButtonElement>(null);
  const toastBottom = 'calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom) - 4px)';
  // When the cards reach down to it, the page makes room and scrolls them clear of the toast.
  useEffect(() => {
    if (!toast || !data.ready) return;
    const frame = requestAnimationFrame(() => {
      const card = quickRef.current;
      const anchor = document.querySelector<HTMLElement>('[data-toast-anchor]');
      const scroller = card?.closest<HTMLElement>('[data-scroller]');
      if (!card || !anchor || !scroller) return;
      const overlap = card.getBoundingClientRect().bottom + 8 - anchor.getBoundingClientRect().top;
      // Never to a spot inside the large title's collapse: it would rest half faded (round 4). From
      // the top, a scroll goes at least the whole collapse, so the compact title takes over cleanly.
      const by = scroller.scrollTop < COLLAPSE_PX ? Math.max(overlap, COLLAPSE_PX - scroller.scrollTop) : overlap;
      if (overlap > 0) scroller.scrollBy({ top: by, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [toast, data.ready]);

  // Back from Finish (a toast in the state): the whole page fades in together, once it has its data.
  const [arrived] = useState(() => !!(location.state as { toast?: string } | null)?.toast);
  useEffect(() => {
    if (!toast) return;
    // An Undo stays for 5 s (SPEC 13.1), a plain message 3 s.
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // A message from the workout screen ("Workout saved · 6 sets"), shown once, with its Undo.
  useArrivalToast(setToast, go);

  const backUp = useBackup(setToast);
  const active = data.value?.active ?? null;
  // PLAN 3.5g: one card at a time: never the backup reminder on a day the coach has a card.
  const remind =
    data.ready &&
    !coach.busy &&
    shouldRemind({ sessions: data.value?.finished ?? 0, lastBackupAt: data.value?.lastBackupAt, snoozeUntil: data.value?.snoozeUntil, activeWorkout: active !== null, now: Date.now() });
  const later = () => void snoozeBackupReminder(Date.now() + SNOOZE_MS).catch(() => setToast({ id: Date.now(), text: 'Could not save that. Try again.' }));
  const planState = data.value?.planState ?? null;
  const plan = planById(planState?.planId);

  const quick = useTapGuard(async () => {
    setError(false);
    try {
      const session = active ?? (await startWorkout((await startDb()).id));
      go(`/workout/${session.id}`, { kind: 'push' });
    } catch {
      setError(true);
    }
  });

  // PLAN 3.6 (SPEC 7.4): "How much time today?" before Start, from the day card's estimate.
  const gym = useActiveGym();
  const profile = useLive(() => getProfile(), []);
  const intakeAnswers = profile.data?.intake;
  const dislikes = profile.data?.dislikes;
  const buildMin = chipFor(intakeAnswers?.minutes);
  const buildable = useMemo(() => (gym ? canBuild(baseInput(intakeAnswers, kitOf(gym), dislikes), QUICK_DEPS) : null), [gym, intakeAnswers, dislikes]);
  const [timeOpen, setTimeOpen] = useState(false);
  const [pickTick, setPickTick] = useState(0);
  const nextIndex = plan && planState ? Math.max(0, Math.min(planState.nextDayIndex, plan.days.length - 1)) : 0;
  const nextDay = plan?.days[nextIndex];
  const nextWeek = plan && planState && plan.progressionMode === 'weekly_table' ? planState.weekIndex : 0;
  void pickTick;
  const pick = plan && nextDay ? pickFor(gym?.id, plan.id, nextIndex) : null;
  const picked = pick && nextDay && pick.minutes < AS_PLANNED ? trimFor(nextDay, pick.minutes, nextWeek) : null;
  const applyTime = (minutes: number, r: { trim: unknown; minutes: number; fits: boolean }) => {
    setTimeOpen(false);
    if (!gym || !plan) return;
    const before = readNextStart();
    const gymBefore = gym.timeBudgetMin;
    writeNextStart(r.trim ? { gymId: gym.id, planId: plan.id, dayIndex: nextIndex, minutes, date: localDay() } : null);
    setPickTick((n) => n + 1);
    rememberBudget(gym.id, minutes).catch(() => undefined);
    const shown: ToastMessage = {
      id: Date.now(),
      text: r.trim ? `${fitWords(r)} when you start` : 'The whole day, as planned',
      action: {
        label: 'Undo',
        onPress: () => {
          setToast((cur) => (cur?.id === shown.id ? null : cur));
          writeNextStart(before);
          setPickTick((n) => n + 1);
          if (gymBefore !== undefined) rememberBudget(gym.id, gymBefore).catch(() => undefined);
        },
      },
    };
    setToast(shown);
  };

  // PLAN 3.5g: an empty workout in progress goes with one tap, with Undo (SPEC 13.1).
  const discard = useTapGuard(async () => {
    if (!active) return;
    const failedText = 'Could not discard it. It has sets now.';
    try {
      const d = await discardEmptyWorkout(active.id);
      if (!d) return setToast({ id: Date.now(), text: failedText });
      clearSessionDrafts(active.id);
      setToast(
        undoToast(Date.now(), 'Empty workout discarded', () => {
          setToast(null);
          undoDiscard(d)
            .then((ok) => !ok && setToast({ id: Date.now(), text: 'Could not undo. Another workout is in progress.' }))
            .catch(() => setToast({ id: Date.now(), text: 'Could not undo that. Try again.' }));
        }),
      );
    } catch {
      setToast({ id: Date.now(), text: 'Could not discard it. Try again.' });
    }
  });

  const startDay = useTapGuard(async () => {
    if (!plan || !planState) return;
    setError(false);
    try {
      const session = await startPlanDay((await startDb()).id, plan.id, planState.nextDayIndex);
      // A lighter week (PLAN 3.8): one set fewer on its exercises, this workout only.
      await applyLighterWeek(session).catch(() => 0);
      // The time picked on Today for this day trims the workout now (never anything not picked).
      await applyNextStart(session, (await db.sets.where('sessionId').equals(session.id).count()) > 0).catch(() => undefined);
      // The day card expands into the workout and Start becomes its header (SPEC 13.2).
      go(`/workout/${session.id}`, { kind: 'expand', state: { expand: true } });
    } catch {
      setError(true);
    }
  });

  const pickDay = async (dayIndex: number) => {
    setChanging(false);
    try {
      await setNextDay(dayIndex);
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <TopBar
        title="Today"
        pinned
        onTitleTap={onTitleTap}
        trailing={
          <div className={styles.trailing}>
            {updateReady && (
              <button
                type="button"
                className={`${styles.update} pressable`}
                onClick={() =>
                  void applyUpdate().then((applied) => {
                    if (!applied) setToast({ id: Date.now(), text: 'Finish your workout first, then update.' });
                  })
                }
              >
                Update ready
              </button>
            )}
            <GymPill onToast={setToast} />
            <IconButton to="/settings" label="Settings">
              <SettingsIcon strokeWidth={2} />
            </IconButton>
          </div>
        }
      />
      <div className={styles.stack} data-arrive={arrived || undefined} data-ready={data.ready || failed || undefined}>
        {live.error && dbOpen ? (
          <LoadError text={failed ? "We couldn't read your saved workouts. Try again, or start a quick workout." : 'Could not load workouts'} onRetry={live.retry} />
        ) : null}
        {failed ? null : !data.ready ? (
          <Skeleton height={248} radius={28} />
        ) : active && plan && planState && active.planId === plan.id && dayIndexOf(plan, active.dayId) >= 0 ? (
          // The plan day in progress: the day card stays, as the one card, with Resume (1.7e).
          <DayCard
            plan={plan}
            state={planState}
            active={{ dayIndex: dayIndexOf(plan, active.dayId), sets: data.value?.activeSets ?? 0 }}
            onStart={() => void quick()}
            onChangeDay={() => undefined}
          />
        ) : active ? (
          <ResumeCard active={active} sets={data.value?.activeSets ?? 0} empty={!!data.value?.activeEmpty} onResume={() => void quick()} onDiscard={() => void discard()} />
        ) : plan && planState ? (
          <DayCard
            plan={plan}
            state={planState}
            onStart={() => void startDay()}
            onChangeDay={(i) => setChanging(i ?? true)}
            onTime={gym ? () => setTimeOpen(true) : undefined}
            onPreview={gym ? () => go('/quick?preview=1', { kind: 'push' }) : undefined}
            {...(picked?.trim ? { minutes: picked.minutes, fitsIn: pick!.minutes } : {})}
          />
        ) : (
          <section className={styles.pick} aria-label="Pick a plan" data-tour="pick">
            <h2 className={styles.pickTitle}>Pick a plan</h2>
            <p className={styles.pickSub}>Follow a plan and every day is lined up for you: exercises, sets and rest.</p>
            <Button onClick={() => go('/plans', { kind: 'tab' })}>See plans</Button>
          </section>
        )}
        {/* PLAN 3.8 (SPEC 15): the coach's one card, or its one line, never both. */}
        {data.ready && !failed && (
          <>
            <CoachCard card={coach.today?.card ?? null} data={coach.data} onToast={setToast} onSeeChanges={() => setSeeChanges(true)} onStartDay={() => void startDay()} />
            {!coach.today?.card && <CoachLine line={coach.today?.line ?? null} />}
          </>
        )}
        {/* PLAN 3.5a (SPEC 20.3): past the intake, Quick workout builds it for you, 30 min preselected.
            Round 2 (B5): only when this gym can build one; else the way to make it able to. */}
        {data.ready && !active && !!profile.data?.intakeDoneAt && buildable !== null &&
          (buildable ? (
            <button type="button" className={`${styles.build} pressable`} onClick={() => go(`/quick?min=${buildMin}`, { kind: 'push' })} data-testid="build-card" data-tour="quick">
              <span className={styles.buildIcon} aria-hidden="true">
                <CoachIcon width={20} height={20} strokeWidth={2.2} />
              </span>
              <span className={styles.buildText}>
                {/* 3.5b round 4 (P15): the intake's own minutes ("Got 45 min?"), the chip Quick opens on. */}
                <span className={`${styles.buildLabel} num`}>Got {buildMin} min? I'll build it</span>
                <span className={styles.buildSub}>Pick a workout, tweak it, start</span>
              </span>
              <ChevronRight className={styles.buildChevron} width={20} height={20} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className={`${styles.quick} pressable`} onClick={() => gym && go(equipmentPath(gym.id), { kind: 'push' })} data-testid="build-equipment">
              <span className={styles.quickLabel}>Add your equipment to get built workouts</span>
              <span className={styles.quickSub}>Too little here that we can show you yet</span>
            </button>
          ))}
        {/* Also when the saved workouts could not be read: a quick workout still works (no dead end).
            Round 2 (B7): the picker first flow, as SPEC 20.3 names it, a quieter row. */}
        {((data.ready && !active) || failed) && (
          // 3.5b round 4 (P15): the picker has one label on Today and on Quick workout.
          <button type="button" ref={quickRef} className={`${styles.quick} pressable`} data-small="" onClick={() => void quick()} data-testid="quick-card" aria-label="Quick workout: pick exercises myself">
            <span className={styles.quickLabel}>Pick exercises myself</span>
          </button>
        )}
        {/* Competitor gap 4: from logged sets only; nothing logged lately, no card. */}
        {data.ready && !failed && !active && <FreshMuscles bands={coach.fresh} unmapped={coach.unmapped} />}
        <BackupReminder
          show={remind}
          reason={reminderReason({ onlyHere: data.value?.onlyHere ?? 0, lastBackupAt: data.value?.lastBackupAt, now: Date.now() })}
          onBackUp={() => void backUp()}
          onLater={later}
        />
        <p className={styles.error} role="status">
          {error ? 'Could not start a workout. Try again.' : ''}
        </p>
      </div>
      {plan && planState && (
        <ChangeDaySheet
          open={changing !== false}
          picked={typeof changing === 'number' ? changing : undefined}
          onClose={() => setChanging(false)}
          plan={plan}
          state={planState}
          onPick={(i) => void pickDay(i)}
        />
      )}
      {plan && nextDay && (
        <TimeBudgetSheet
          open={timeOpen}
          onClose={() => setTimeOpen(false)}
          day={nextDay}
          weekIndex={nextWeek}
          initial={pick?.minutes ?? gym?.timeBudgetMin ?? profile.data?.intake?.minutes}
          current={picked?.trim ?? undefined}
          logged={NO_LOGGED}
          onApply={applyTime}
        />
      )}
      <LeveledUpSheet
        open={seeChanges && coach.today?.card?.kind === 'leveled_up'}
        onClose={() => setSeeChanges(false)}
        changes={coach.today?.card?.kind === 'leveled_up' ? coach.today.card.changes : []}
      />
      <Toast toast={toast} bottom={toastBottom} />
      {/* PLAN 3.5u: once, right after a first intake; never over a toast and its Undo. */}
      <WelcomeTour show={shouldShowTour(profile.data?.welcomeTour, { ready: data.ready && !failed && buildable !== null && !toast, activeWorkout: active !== null })} />
    </>
  );
}
