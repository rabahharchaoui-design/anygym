import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { useNav } from '../../ui/nav';
import { basePlanOf, planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import { parseTunedId, planTips, tunedId, TIP_IDS, TUNED_MARK, type TipId } from '../../lib/coachTips';
import { UNDO_MS } from '../../lib/undoQueue';
import { Toast, undoToast, type ToastMessage } from '../../ui/Toast';
import { CoachTips } from './CoachTips';
import { hideTips, tipsHidden } from './coachTipsHidden';
import tipStyles from './CoachTips.module.css';
import { placeById } from '../../lib/places';
import { choosePlanUndoable, getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { LoadError } from '../../components/LoadError';
import { useTapGuard } from '../../hooks/useTapGuard';
import { estimateDayMinutes, finisherText } from '../../lib/plans';
import { PlanDayList } from './PlanDayList';
import { dayTitle, planMeta } from './planWords';
import styles from './Plans.module.css';

/** Plan viewer: every day in plain words, a week picker for week table plans, and "Use this plan". */
export function PlanViewer() {
  const { planId, placeId } = useParams();
  // PLAN 3.4a: a coach tuned copy is its curated plan plus the tips applied, kept in ?coach= so a
  // change never reloads the screen (the page is keyed by its path) and a reload shows the same copy.
  const [search, setSearch] = useSearchParams();
  const base = basePlanOf(planId);
  const coach = search.get('coach');
  const applied = useMemo(() => (coach !== null ? parseTunedId(`x${TUNED_MARK}${coach}`).tips : parseTunedId(planId ?? '').tips), [coach, planId]);
  const plan = base ? planById(tunedId(base.id, applied)) : undefined;
  const tips = useMemo(() => (base ? planTips(base, (id) => profileFor(id)) : []), [base]);
  // Opened from a place's list (PLAN 3.1): back goes to that list.
  const place = placeById(placeId);
  const backTo = place ? `/plans/place/${place.id}` : '/plans';
  const go = useNav();
  const [hidden, setHidden] = useState(() => (base ? tipsHidden(base.id) : false));
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), toast.action ? UNDO_MS : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  // Each change replaces the entry, so Back still leaves the plan in one step.
  const showTips = (ids: readonly TipId[]) => {
    const words = TIP_IDS.filter((t) => ids.includes(t)).join('.');
    setSearch(words ? { coach: words } : {}, { replace: true });
  };
  const change = (ids: readonly TipId[], text: string) => {
    const before = applied;
    showTips(ids);
    const shown = undoToast(Date.now(), text, () => {
      setToast((now) => (now?.id === shown.id ? null : now));
      showTips(before);
    });
    setToast(shown);
  };
  const state = useLive(() => getPlanState(), []);
  // Nothing is chosen until the active plan read worked (PLAN 1.7j): a pending or failed read
  // must never make the plan in use look inactive and reset its progress.
  const known = state.ready && !state.error;
  const active = known && state.data?.planId === plan?.id;
  const [week, setWeek] = useState<number | null>(null);
  const [error, setError] = useState(false);
  // The label pressed stays through the exit (gate P8): saving makes the plan active, which would
  // flip "Use this plan" to "Go to Today" for a frame before the screen leaves.
  const [leaving, setLeaving] = useState<string | null>(null);

  const use = useTapGuard(async () => {
    if (!plan || !known) return;
    setError(false);
    try {
      if (active) return go('/', { kind: 'tab' });
      setLeaving('Use this plan');
      // Saved, with Undo on Today (PLAN 2.2d, Hevy research item 5: a save always says so).
      const chosen = await choosePlanUndoable(plan.id);
      go('/', { kind: 'tab', state: chosen.changed ? { toast: 'Plan saved', planUndo: { chosen: chosen.state, previous: chosen.previous ?? null } } : undefined });
    } catch {
      setLeaving(null);
      setError(true);
    }
  });

  if (!plan || !base) return <Navigate to={backTo} replace />;
  const tuned = plan.id !== base.id;
  const weekIndex = week ?? (active ? (state.data?.weekIndex ?? 0) : 0);

  return (
    <div className={styles.viewer}>
      <TopBar title={plan.name} leading={<BackButton to={backTo} label={`Back to ${place?.label ?? 'Plans'}`} />}>
        <p className={styles.viewerMeta}>{planMeta(plan)}</p>
        <p className={styles.viewerSummary}>{plan.summary}</p>
      </TopBar>

      {plan.weeks && (
        <div className={styles.weeks} role="group" aria-label="Week">
          {Array.from({ length: plan.weeks }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.week} pressable`}
              aria-pressed={i === weekIndex}
              aria-label={`Week ${i + 1}`}
              onClick={() => setWeek(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {tuned && (
        <p className={tipStyles.tuned} data-testid="tuned-copy">
          <span className={tipStyles.tunedText}>Coach tuned copy of {base.name}</span>
          <button type="button" className={`${tipStyles.textButton} pressable`} onClick={() => showTips([])}>
            See original
          </button>
        </p>
      )}

      {!hidden && (
        <CoachTips
          tips={tips}
          applied={applied}
          onApply={(id) => change([...applied, id], 'Coach tip applied')}
          onUndo={(id) => change(applied.filter((x) => x !== id), 'Coach tip undone')}
          onApplyAll={() => change(TIP_IDS.filter((t) => tips.some((x) => x.id === t)), 'Coach tips applied')}
          onHide={() => {
            hideTips(base.id, true);
            setHidden(true);
            const shown = undoToast(Date.now(), 'Tips hidden for this plan', () => {
              hideTips(base.id, false);
              setHidden(false);
              setToast((now) => (now?.id === shown.id ? null : now));
            });
            setToast(shown);
          }}
        />
      )}

      {plan.days.map((d) => (
        <section key={d.n} className={styles.day} aria-label={dayTitle(d.n, d.name)}>
          <header className={styles.dayHead}>
            <h2 className={styles.dayTitle}>{dayTitle(d.n, d.name)}</h2>
            <span className={`${styles.dayTime} num`}>~{estimateDayMinutes(d, weekIndex)} min</span>
          </header>
          {d.addOn && <p className={styles.addOn}>Plus {d.addOn.toLowerCase()}</p>}
          <PlanDayList day={d} weekIndex={weekIndex} />
          {d.finisher && (
            <p className={styles.finisher} data-testid={`finisher-day-${d.n}`}>
              <span className={styles.finisherTag}>Finisher</span> {finisherText(d.finisher)}
            </p>
          )}
        </section>
      ))}

      <BottomCTA
        floating
        testId="action-bar"
        onPress={() => void use()}
        disabled={!known}
        above={
          state.error ? (
            <LoadError text="Could not check your current plan" onRetry={state.retry} />
          ) : (
            <p className={styles.error} role="status">
              {error ? 'Could not save that. Try again.' : ''}
            </p>
          )
        }
      >
        {leaving ?? (active ? 'Go to Today' : 'Use this plan')}
      </BottomCTA>
      <Toast toast={toast} bottom="76px" />
    </div>
  );
}
