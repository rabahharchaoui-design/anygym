import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { useNav } from '../../ui/nav';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { DumbbellIcon, UndoIcon } from '../../ui/icons';
import { useTapGuard } from '../../hooks/useTapGuard';
import { startDb } from '../../db/bootstrap';
import { getProfile } from '../../db/intake';
import { getPlanState, weekFor } from '../../db/planState';
import { useActiveGym } from '../../db/useActiveGym';
import { alwaysPicks, getDislikes, readRecentAt, readRecentMuscles, recordNever, recordSwapAway, startBuilt, undoNever } from '../../db/quick';
import { getActiveSession, startWorkout } from '../../db/workouts';
import { planById } from '../../data/plans';
import { SWAP_DATA, countsEachSide } from '../../data/patterns';
import { QUICK_DEPS, workoutMuscles } from '../../data/quick';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import { easyOnAvoids, type Muscle } from '../../lib/order';
import type { Plan } from '../../lib/plans';
import { hints } from '../../lib/hints';
import {
  buildConcepts,
  canBuild,
  chipFor,
  conceptMinutes,
  dropSlot,
  nextSwap,
  planConcept,
  QUICK_MINUTES,
  swapItem,
  whenWords,
  type Concept,
  type Dislikes,
  type PlanPart,
  type QuickItem,
  type QuickMinutes,
} from '../../lib/quick';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import { Deck, DeckButtons, itemLine, type Decision } from './Deck';
import { baseInput, equipmentPath, kitOf } from './quickInput';
import styles from './Quick.module.css';

// Quick workout builds it for you (PLAN 3.5a, SPEC 20.3, G Nov 5): "How long?" chips, "Pick one" of
// up to 3 concepts that fit the time, then "Curate it": a deck of the workout, one exercise per card.
// Start now on every card (Start workout once anything changed or after the last card).
// "Pick exercises myself" keeps the old picker flow.

type Loaded = {
  answers: IntakeAnswers | undefined;
  dislikes: Dislikes;
  recent: Muscle[];
  recentWhen?: string;
  plan: { plan: Plan; dayIndex: number; weekIndex: number; always: Record<string, string> } | null;
};

type Curating = { concept: Concept; items: QuickItem[]; plan?: PlanPart; index: number; tried: Record<string, string[]>; changed: boolean };

/** One line above the card (round 2, B2): never over the buttons, never swallowing a tap. */
type Notice = { id: number; text: string; undo?: () => void };

export function QuickScreen() {
  const go = useNav();
  const [params] = useSearchParams();
  const gym = useActiveGym();
  const reduced = useReducedMotionLive();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [minutes, setMinutes] = useState<QuickMinutes | null>(() => (params.get('min') ? chipFor(Number(params.get('min'))) : null));
  const [stage, setStage] = useState<Curating | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
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
      const [profile, state, recent, dislikes, recentAt] = await Promise.all([getProfile(), getPlanState(), readRecentMuscles(), getDislikes(), readRecentAt()]);
      const plan = planById(state?.planId);
      let planPart: Loaded['plan'] = null;
      if (plan && state) {
        const dayIndex = Math.max(0, Math.min(state.nextDayIndex, plan.days.length - 1));
        planPart = { plan, dayIndex, weekIndex: weekFor(state, plan.id), always: await alwaysPicks(plan.id) };
      }
      if (alive) setLoaded({ answers: profile?.intake, dislikes, recent, ...(recentAt !== null ? { recentWhen: whenWords(recentAt, Date.now()) } : {}), plan: planPart });
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const chip: QuickMinutes = minutes ?? chipFor(loaded?.answers?.minutes);
  const kit = useMemo(() => (gym ? kitOf(gym) : null), [gym]);
  const base = useMemo(() => (loaded && kit ? baseInput(loaded.answers, kit, { ...loaded.dislikes, never: [...(loaded.dislikes.never ?? []), ...neverNow] }) : null), [loaded, kit, neverNow]);
  const buildable = useMemo(() => (base ? canBuild(base, QUICK_DEPS) : null), [loaded, kit]); // eslint-disable-line react-hooks/exhaustive-deps
  const concepts = useMemo(() => {
    if (!loaded || !kit || !base) return null;
    const p = loaded.plan;
    const plan = p ? planConcept({ plan: p.plan, dayIndex: p.dayIndex, weekIndex: p.weekIndex, minutes: chip, gym: kit, always: p.always, ...(base.never ? { never: base.never } : {}), ...(base.soft ? { soft: base.soft } : {}) }, QUICK_DEPS) : null;
    return buildConcepts({ base, minutes: chip, recent: loaded.recent, ...(loaded.recentWhen ? { recentWhen: loaded.recentWhen } : {}), plan }, QUICK_DEPS);
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
    return nextSwap(item, c.items, [...(c.tried[item.slot] ?? []), item.id], { data: SWAP_DATA, gym: kit, ok: okFor, profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name, ...(base?.soft ? { soft: base.soft } : {}) });
  };
  const canSwap = stage ? swapFor(stage) !== null : false;

  const seenHint = () => {
    if (!hint) return;
    hints.dismiss('deckSwipe');
    setHint(false);
  };

  const slotNames = useRef(new Map<string, string>());
  const replaceTop = (c: Curating, to: string): Curating => {
    const item = c.items[c.index]!;
    if (!slotNames.current.has(item.slot)) slotNames.current.set(item.slot, item.name);
    const items = c.items.map((it, i) => (i === c.index ? swapItem(item, to, QUICK_DEPS.name(to), countsEachSide(to), slotNames.current.get(item.slot)) : it));
    return { ...c, items, changed: true, tried: { ...c.tried, [item.slot]: [...(c.tried[item.slot] ?? []), item.id] } };
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

  // The last card kept: the buttons fade out while Ready to go comes in (round 2, P8).
  const flyStart = (d: Decision) => {
    if (d === 'keep' && stage && stage.index === stage.items.length - 1) setLeaving(true);
  };
  useEffect(() => {
    if (stage && stage.index < stage.items.length) setLeaving(false);
    // Round 3 (P3): the deck is done: its notice (and its Undo) goes with it.
    if (stage && stage.index >= stage.items.length) setNotice(null);
  }, [stage]);

  const nothingToSwap = () => {
    setSwapNote('No other option here');
  };
  useEffect(() => {
    if (!swapNote) return;
    const t = window.setTimeout(() => setSwapNote(null), 1800);
    return () => window.clearTimeout(t);
  }, [swapNote]);

  const never = () => {
    if (!stage) return;
    seenHint();
    const before = stage;
    const item = stage.items[stage.index];
    if (!item) return;
    void recordNever(item.id).catch(() => undefined);
    setNeverNow((n) => [...n, item.id]);
    // Something else of the same movement takes its place; nothing fits: it leaves the workout, and
    // the line says so with the new time (round 2, B6), never a silent gap.
    const to = swapFor(stage);
    const next: Curating = to
      ? replaceTop(stage, to)
      : { ...stage, changed: true, items: stage.items.filter((_, i) => i !== stage.index), ...(stage.plan ? { plan: dropSlot(stage.plan, item.slot) } : {}) };
    setStage(next);
    const after = conceptMinutes({ items: next.items, ...(next.plan ? { plan: next.plan } : {}) });
    const id = Date.now();
    setNotice({
      id,
      // PLAN 3.8a (Codex ui-3.5a #5): the line always names the exercise that was hidden.
      text: to ? `${item.name} hidden` : `${item.name} hidden. No replacement available. Workout now ~${after} min.`,
      undo: () => {
        setNotice((n) => (n?.id === id ? null : n));
        void undoNever(item.id).catch(() => undefined);
        setNeverNow((n) => n.filter((x) => x !== item.id));
        setStage(before);
      },
    });
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice((cur) => (cur?.id === notice.id ? null : cur)), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const curate = (c: Concept) => {
    setError('');
    setNotice(null);
    setLeaving(false);
    slotNames.current = new Map();
    setStage({ concept: c, items: c.items.map((it) => ({ ...it })), ...(c.plan ? { plan: c.plan } : {}), index: 0, tried: {}, changed: false });
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

  const addEquipment = () => gym && go(equipmentPath(gym.id), { kind: 'push' });

  // ------------------------------------------------------------ screens

  if (stage) {
    const done = stage.index >= stage.items.length;
    const total = conceptMinutes({ items: stage.items, ...(stage.plan ? { plan: stage.plan } : {}) });
    const label = done || stage.changed ? 'Start workout' : 'Start now';
    const noticeRow = (
      <div className={styles.notice} data-testid="deck-hint" aria-live="polite">
        {notice ? (
          <>
            <span className={styles.noticeText}>{notice.text}</span>
            {notice.undo && (
              <button type="button" className={`${styles.undo} pressable`} onClick={notice.undo}>
                <UndoIcon width={16} height={16} strokeWidth={2.2} aria-hidden="true" />
                Undo
              </button>
            )}
          </>
        ) : hint ? (
          'Right keeps it, left swaps it.'
        ) : (
          'Hold a card: never show it again.'
        )}
      </div>
    );
    return (
      <div className={styles.screen} data-stage={done ? 'ready' : 'deck'} data-scroller>
        {/* One compact bar (round 2, B1, P14): the title never takes the card's room. */}
        <header className={styles.deckHead}>
          <BackButton label="Back to the workouts" onPress={() => setStage(null)} />
          <div className={styles.deckHeadText}>
            <h1 className={styles.deckTitle}>{done ? 'Ready to go' : stage.concept.title}</h1>
            <p className={`${styles.deckMeta} num`} data-testid="curate-meta">
              {stage.items.length} {stage.items.length === 1 ? 'exercise' : 'exercises'} · ~{total} min
            </p>
          </div>
        </header>
        {done && notice ? noticeRow : null}
        {done ? (
          <ol className={styles.ready} data-testid="ready-list" data-reduced={reduced || undefined}>
            {stage.items.map((it, i) => (
              <li key={it.slot + it.id} className={styles.readyRow} style={{ ['--i' as string]: i }}>
                <span className={styles.readyName}>{it.name}</span>
                <span className={`${styles.readySets} num`}>{itemLine(it)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {noticeRow}
            <Deck
              items={stage.items}
              index={stage.index}
              canSwap={canSwap}
              reduced={reduced}
              fling={fling}
              onDecide={decide}
              onFlyStart={flyStart}
              onNever={never}
              onNothingToSwap={nothingToSwap}
            />
            <DeckButtons
              leaving={leaving}
              swapNote={swapNote}
              onSwap={() => setFling((f) => ({ kind: 'swap', n: (f?.n ?? 0) + 1 }))}
              onKeep={() => setFling((f) => ({ kind: 'keep', n: (f?.n ?? 0) + 1 }))}
            />
          </>
        )}
        <BottomCTA
          className={styles.cta}
          onPress={() => void start()}
          disabled={!stage.items.length}
          {...(!stage.items.length ? { disabledReason: 'Nothing left. Go back and pick another.' } : {})}
          testId="quick-start"
          above={error ? <p className={styles.error} role="status">{error}</p> : null}
        >
          {label}
        </BottomCTA>
      </div>
    );
  }

  const nothing = buildable === false;
  return (
    <div className={styles.screen} data-stage="choose">
      <TopBar title="Quick workout" leading={<BackButton to="/" label="Back to Today" />} />
      {failed ? (
        <section className={styles.emptyBox} data-testid="quick-empty">
          <h2 className={styles.emptyTitle}>Could not read your workouts</h2>
          <p className={styles.emptyText}>You can still pick exercises yourself.</p>
          <Button onClick={() => void pickMyself()}>Pick exercises myself</Button>
        </section>
      ) : nothing ? (
        // Round 2 (B5): nothing at all can be built here: no chips, the honest reason, the fix first.
        <section className={styles.emptyBox} data-testid="quick-empty">
          <span className={styles.emptyIcon} aria-hidden="true">
            <DumbbellIcon width={36} height={36} strokeWidth={1.6} />
          </span>
          <h2 className={styles.emptyTitle}>Not enough here to build one yet</h2>
          <p className={styles.emptyText}>We only build with moves we can show you, and fewer than 3 fit this gym's equipment. Bodyweight moves don't have demos we're sure of yet, so a gym with no equipment can't get one for now.</p>
          <Button onClick={addEquipment}>Add equipment</Button>
          <Button variant="secondary" onClick={() => void pickMyself()}>
            Pick exercises myself
          </Button>
        </section>
      ) : (
        <>
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
            {!concepts ? (
              <div className={styles.concepts}>
                <Skeleton height={132} radius={24} />
                <Skeleton height={132} radius={24} />
                <Skeleton height={132} radius={24} />
              </div>
            ) : concepts.length === 0 ? (
              // Something can be built here, just not in this little time (round 2, B3).
              <p className={styles.noFit} data-testid="quick-nofit">
                Nothing we can build fits {chip} min here. Try a longer time.
              </p>
            ) : (
              <div className={styles.concepts}>
                {concepts.map((c) => (
                  <ConceptCard key={c.id} concept={c} onPick={() => curate(c)} />
                ))}
              </div>
            )}
          </section>
          <button type="button" className={`${styles.myself} pressable`} onClick={() => void pickMyself()} data-testid="pick-myself">
            Pick exercises myself
          </button>
        </>
      )}
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
