import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { Toast, undoToast, type ToastMessage } from '../../ui/Toast';
import { useNav } from '../../ui/nav';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { DumbbellIcon } from '../../ui/icons';
import { useTapGuard } from '../../hooks/useTapGuard';
import { startDb } from '../../db/bootstrap';
import { getProfile } from '../../db/intake';
import { getPlanState, weekFor } from '../../db/planState';
import { useActiveGym } from '../../db/useActiveGym';
import { alwaysPicks, getDislikes, readRecentMuscles, recordNever, recordSwapAway, startBuilt, undoNever } from '../../db/quick';
import { getActiveSession, startWorkout } from '../../db/workouts';
import { planById } from '../../data/plans';
import { SWAP_DATA, countsEachSide } from '../../data/patterns';
import { QUICK_DEPS, workoutMuscles } from '../../data/quick';
import { generatorInputOf } from '../../lib/intake/yourPlan';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import type { GeneratorInput } from '../../lib/generator';
import { easyOnAvoids, type Muscle } from '../../lib/order';
import type { Plan } from '../../lib/plans';
import { hints } from '../../lib/hints';
import {
  buildConcepts,
  chipFor,
  conceptMinutes,
  dropSlot,
  nextSwap,
  planConcept,
  QUICK_MINUTES,
  swapItem,
  withDislikes,
  type Concept,
  type Dislikes,
  type PlanPart,
  type QuickItem,
  type QuickMinutes,
} from '../../lib/quick';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import { Deck, DeckButtons, itemLine, type Decision } from './Deck';
import styles from './Quick.module.css';

// Quick workout builds it for you (PLAN 3.5a, SPEC 20.3, G Nov 5): "How long?" chips, "Pick one" of
// up to 3 concepts, then "Curate it": a deck of the workout, one exercise per card. Start as is on
// every card; Start workout after the last. "Pick exercises myself" keeps the old picker flow.

type Loaded = {
  answers: IntakeAnswers | undefined;
  dislikes: Dislikes;
  recent: Muscle[];
  plan: { plan: Plan; dayIndex: number; weekIndex: number; always: Record<string, string> } | null;
};

type Curating = { concept: Concept; items: QuickItem[]; plan?: PlanPart; index: number; tried: Record<string, string[]> };

/** The intake answers as the generator reads them, at the active gym, with what was learned. */
function baseInput(answers: IntakeAnswers | undefined, gym: GeneratorInput['gym'], dislikes: Dislikes): GeneratorInput {
  const raw = answers ? generatorInputOf(answers) : { goals: [], gym };
  const input: GeneratorInput = { ...raw, gym };
  delete input.place;
  return withDislikes(input, dislikes);
}

export function QuickScreen() {
  const go = useNav();
  const [params] = useSearchParams();
  const gym = useActiveGym();
  const reduced = useReducedMotionLive();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [minutes, setMinutes] = useState<QuickMinutes | null>(() => (params.get('min') ? chipFor(Number(params.get('min'))) : null));
  const [stage, setStage] = useState<Curating | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const [error, setError] = useState('');
  // Learned this visit: never shown again here either (the profile has them for next time).
  const [neverNow, setNeverNow] = useState<string[]>([]);
  const [hint, setHint] = useState(() => !hints.seen('deckSwipe'));

  // One read when the screen opens: concepts never reshuffle while the person is choosing.
  useEffect(() => {
    let alive = true;
    (async () => {
      await startDb();
      const [profile, state, recent, dislikes] = await Promise.all([getProfile(), getPlanState(), readRecentMuscles(), getDislikes()]);
      const plan = planById(state?.planId);
      let planPart: Loaded['plan'] = null;
      if (plan && state) {
        const dayIndex = Math.max(0, Math.min(state.nextDayIndex, plan.days.length - 1));
        planPart = { plan, dayIndex, weekIndex: weekFor(state, plan.id), always: await alwaysPicks(plan.id) };
      }
      if (alive) setLoaded({ answers: profile?.intake, dislikes, recent, plan: planPart });
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const chip: QuickMinutes = minutes ?? chipFor(loaded?.answers?.minutes);
  const kit = useMemo(() => (gym ? { equipment: gym.equipment, dumbbellRange: gym.dumbbellRange } : null), [gym]);
  const base = useMemo(() => (loaded && kit ? baseInput(loaded.answers, kit, { ...loaded.dislikes, never: [...(loaded.dislikes.never ?? []), ...neverNow] }) : null), [loaded, kit, neverNow]);
  const concepts = useMemo(() => {
    if (!loaded || !kit || !base) return null;
    const p = loaded.plan;
    const plan = p ? planConcept({ plan: p.plan, dayIndex: p.dayIndex, weekIndex: p.weekIndex, minutes: chip, gym: kit, always: p.always, ...(base.never ? { never: base.never } : {}), ...(base.soft ? { soft: base.soft } : {}) }, QUICK_DEPS) : null;
    return buildConcepts({ base, minutes: chip, recent: loaded.recent, plan }, QUICK_DEPS);
    // Concepts are worked out for the chip picked; a "never" learned in the deck applies next time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, kit, chip]);

  // ------------------------------------------------------------ the deck

  const okFor = useMemo(() => {
    const never = new Set([...(base?.never ?? []), ...neverNow].map(SWAP_DATA.sameAs));
    return (id: string) => QUICK_DEPS.usable(id) && !never.has(SWAP_DATA.sameAs(id)) && !easyOnAvoids(base?.easyOn, QUICK_DEPS.profile(id));
  }, [base, neverNow]);
  const swapFor = (c: Curating): string | null => {
    const item = c.items[c.index];
    if (!item || !kit) return null;
    return nextSwap(item, c.items, [...(c.tried[item.slot] ?? []), item.id], { data: SWAP_DATA, gym: kit, ok: okFor, ...(base?.soft ? { soft: base.soft } : {}) });
  };
  const canSwap = stage ? swapFor(stage) !== null : false;

  const seenHint = () => {
    if (!hint) return;
    hints.dismiss('deckSwipe');
    setHint(false);
  };

  const replaceTop = (c: Curating, to: string): Curating => {
    const item = c.items[c.index]!;
    const items = c.items.map((it, i) => (i === c.index ? swapItem(item, to, QUICK_DEPS.name(to), countsEachSide(to)) : it));
    return { ...c, items, tried: { ...c.tried, [item.slot]: [...(c.tried[item.slot] ?? []), item.id] } };
  };

  const decide = (d: Decision) => {
    seenHint();
    setStage((c) => {
      if (!c) return c;
      if (d === 'keep') return { ...c, index: c.index + 1 };
      const to = swapFor(c);
      if (!to) return c;
      // A left swipe quietly ranks the one swapped away lower next time (never a ban).
      void recordSwapAway(c.items[c.index]!.id).catch(() => undefined);
      return replaceTop(c, to);
    });
  };

  const never = () => {
    if (!stage) return;
    seenHint();
    const before = stage;
    const item = stage.items[stage.index];
    if (!item) return;
    void recordNever(item.id).catch(() => undefined);
    setNeverNow((n) => [...n, item.id]);
    // Something else of the same movement takes its place; nothing fits: it just leaves the workout.
    const to = swapFor(stage);
    const next: Curating = to
      ? replaceTop(stage, to)
      : { ...stage, items: stage.items.filter((_, i) => i !== stage.index), ...(stage.plan ? { plan: dropSlot(stage.plan, item.slot) } : {}) };
    setStage(next);
    const id = Date.now();
    setToast(
      undoToast(
        id,
        "Won't show it again",
        () => {
          setToast((t) => (t?.id === id ? null : t));
          void undoNever(item.id).catch(() => undefined);
          setNeverNow((n) => n.filter((x) => x !== item.id));
          setStage(before);
        },
        item.name,
      ),
    );
  };

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const curate = (c: Concept) => {
    setError('');
    setStage({ concept: c, items: c.items.map((it) => ({ ...it })), ...(c.plan ? { plan: c.plan } : {}), index: 0, tried: {} });
  };

  // ------------------------------------------------------------ start

  const start = useTapGuard(async () => {
    if (!stage || !gym || !stage.items.length) return;
    setError('');
    try {
      const session = await startBuilt(gym.id, { items: stage.items, ...(stage.plan ? { plan: stage.plan } : {}) }, chip);
      const first = session.exerciseIds?.[0];
      // Straight to the first exercise: the first set is one tap away (SPEC 20.3: under 4 taps).
      go(first ? `/workout/${session.id}/${encodeURIComponent(first)}` : `/workout/${session.id}`, { kind: 'push', replace: true });
    } catch {
      setError('Could not start the workout. Try again.');
    }
  });

  const pickMyself = useTapGuard(async () => {
    setError('');
    try {
      const session = (await getActiveSession()) ?? (await startWorkout((await startDb()).id));
      go(`/workout/${session.id}`, { kind: 'push', replace: true });
    } catch {
      setError('Could not start the workout. Try again.');
    }
  });

  // ------------------------------------------------------------ screens

  const myself = (
    <button type="button" className={`${styles.myself} pressable`} onClick={() => void pickMyself()} data-testid="pick-myself">
      Pick exercises myself
    </button>
  );

  if (stage) {
    const done = stage.index >= stage.items.length;
    const total = conceptMinutes({ items: stage.items, ...(stage.plan ? { plan: stage.plan } : {}) });
    return (
      <div className={styles.screen} data-stage={done ? 'ready' : 'deck'} data-scroller>
        <TopBar title={done ? 'Ready to go' : stage.concept.title} leading={<BackButton label="Back to the workouts" onPress={() => setStage(null)} />}>
          <p className={`${styles.meta} num`} data-testid="curate-meta">
            {stage.items.length} {stage.items.length === 1 ? 'exercise' : 'exercises'} · ~{total} min
          </p>
        </TopBar>
        {done ? (
          <ol className={styles.ready} data-testid="ready-list">
            {stage.items.map((it) => (
              <li key={it.slot + it.id} className={styles.readyRow}>
                <span className={styles.readyName}>{it.name}</span>
                <span className={`${styles.readySets} num`}>{itemLine(it)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p className={styles.hint} data-testid="deck-hint" aria-live="polite">
              {hint ? 'Right keeps it, left swaps it.' : 'Hold a card: never show it again.'}
            </p>
            <Deck
              items={stage.items}
              index={stage.index}
              canSwap={canSwap}
              reduced={reduced}
              fling={fling}
              onDecide={decide}
              onNever={never}
              onNothingToSwap={() => setToast({ id: Date.now(), text: 'Nothing else of this movement fits here' })}
            />
            <DeckButtons onSwap={() => setFling((f) => ({ kind: 'swap', n: (f?.n ?? 0) + 1 }))} onKeep={() => setFling((f) => ({ kind: 'keep', n: (f?.n ?? 0) + 1 }))} />
          </>
        )}
        <BottomCTA
          className={styles.cta}
          onPress={() => void start()}
          disabled={!stage.items.length}
          disabledReason="Nothing left. Go back and pick another."
          testId="quick-start"
          above={error ? <p className={styles.error} role="status">{error}</p> : null}
        >
          {done ? 'Start workout' : 'Start as is'}
        </BottomCTA>
        <Toast toast={toast} bottom="104px" />
      </div>
    );
  }

  return (
    <div className={styles.screen} data-stage="choose">
      <TopBar title="Quick workout" leading={<BackButton to="/" label="Back to Today" />} />
      <section className={styles.section} aria-labelledby="quick-long">
        <h2 id="quick-long" className={styles.sectionTitle}>
          How long?
        </h2>
        <div className={styles.chips} role="group" aria-labelledby="quick-long">
          {QUICK_MINUTES.map((m) => (
            <button key={m} type="button" className={`${styles.chip} pressable num`} aria-pressed={chip === m} onClick={() => setMinutes(m)} data-testid={`min-${m}`}>
              {m} min
            </button>
          ))}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="quick-pick">
        <h2 id="quick-pick" className={styles.sectionTitle}>
          Pick one
        </h2>
        {failed ? (
          <EmptyState title="Could not read your workouts" next="You can still pick exercises yourself." action={{ label: 'Pick exercises myself', onPress: () => void pickMyself() }} />
        ) : !concepts ? (
          <div className={styles.concepts}>
            <Skeleton height={132} radius={24} />
            <Skeleton height={132} radius={24} />
            <Skeleton height={132} radius={24} />
          </div>
        ) : concepts.length === 0 ? (
          <div data-testid="quick-empty">
            <EmptyState
              icon={<DumbbellIcon width={40} height={40} strokeWidth={1.6} />}
              title="Not enough here to build one yet"
              next="We only build with moves we can show you, and fewer than 3 fit this gym's equipment."
              action={{ label: 'Pick exercises myself', onPress: () => void pickMyself() }}
            />
          </div>
        ) : (
          <div className={styles.concepts}>
            {concepts.map((c) => (
              <ConceptCard key={c.id} concept={c} onPick={() => curate(c)} />
            ))}
          </div>
        )}
      </section>
      {concepts && concepts.length > 0 && myself}
      <p className={styles.error} role="status">
        {error}
      </p>
    </div>
  );
}

function ConceptCard({ concept, onPick }: { concept: Concept; onPick: () => void }) {
  const muscles = useMemo(() => workoutMuscles(concept.items.map((it) => it.id)), [concept]);
  return (
    <button type="button" className={`${styles.concept} pressable`} onClick={onPick} data-testid={`concept-${concept.id}`} data-concept={concept.id}>
      <span className={styles.conceptText}>
        <span className={styles.conceptTitle}>{concept.title}</span>
        <span className={styles.conceptLine}>{concept.line}</span>
        <span className={`${styles.conceptMeta} num`} data-testid="concept-meta">
          {concept.items.length} exercises · ~{concept.minutes} min
        </span>
      </span>
      <MiniMusclePair data={muscles} className={styles.conceptMap} />
    </button>
  );
}

