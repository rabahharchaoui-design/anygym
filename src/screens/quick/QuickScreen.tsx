import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { BottomCTA } from '../../ui/BottomCTA';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { useNav } from '../../ui/nav';
import { DUR } from '../../ui/motion';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { DumbbellIcon, UndoIcon } from '../../ui/icons';
import { useTapGuard } from '../../hooks/useTapGuard';
import { startDb } from '../../db/bootstrap';
import { getProfile } from '../../db/intake';
import { getPlanState, weekFor } from '../../db/planState';
import { useActiveGym } from '../../db/useActiveGym';
import { alwaysPicks, getDislikes, readDoneStyles, readLastTrained, readRecentAt, readRecentMuscles, readShown, recordShown, startBuilt } from '../../db/quick';
import { getActiveSession, startWorkout } from '../../db/workouts';
import { planById } from '../../data/plans';
import { QUICK_DEPS } from '../../data/quick';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import type { Muscle } from '../../lib/order';
import type { Plan } from '../../lib/plans';
import { buildIdeas, cardKey, moreLabel, canBuild, chipFor, conceptMinutes, metaLine, planConcept, QUICK_MINUTES, whenWords, type Concept, type Dislikes, type QuickMinutes } from '../../lib/quick';
import { Deck, DeckButtons, itemLine } from './Deck';
import { ConceptCard } from './ConceptCard';
import { useDeck } from './useDeck';
import { baseInput, equipmentPath, kitOf } from './quickInput';
import styles from './Quick.module.css';

// Quick workout builds it for you (PLAN 3.5a, SPEC 20.3, G Nov 5): "How long?" chips, "Pick one" of
// up to 4 cards that differ by style (PLAN 3.5b: a style chip, the gear it uses, 3 effort dots, the
// mini map and a specific why line), a "More ideas" row that swaps card 4 for another style, then
// "Curate it": a deck of the workout, one exercise per card.
// Start now on every card (Start workout once anything changed or after the last card).
// "Pick exercises myself" keeps the old picker flow.

type Loaded = {
  answers: IntakeAnswers | undefined;
  dislikes: Dislikes;
  recent: Muscle[];
  recentWhen?: string;
  plan: { plan: Plan; dayIndex: number; weekIndex: number; always: Record<string, string> } | null;
  /** PLAN 3.5b: when each muscle last had logged sets, the styles of the last 2 quick workouts, the cards shown last time. */
  lastTrained: Partial<Record<Muscle, number>>;
  done: string[];
  shown: string[];
  now: number;
};


export function QuickScreen() {
  const go = useNav();
  const [params] = useSearchParams();
  const gym = useActiveGym();
  const reduced = useReducedMotionLive();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [minutes, setMinutes] = useState<QuickMinutes | null>(() => (params.get('min') ? chipFor(Number(params.get('min'))) : null));
  const [error, setError] = useState('');
  // Learned this visit: never shown again here either (the profile has them for next time).
  const [neverNow, setNeverNow] = useState<string[]>([]);

  // One read when the screen opens: concepts never reshuffle while the person is choosing.
  useEffect(() => {
    let alive = true;
    (async () => {
      await startDb();
      const now = Date.now();
      const [profile, state, recent, dislikes, recentAt, lastTrained, done, shown] = await Promise.all([getProfile(), getPlanState(), readRecentMuscles(now), getDislikes(), readRecentAt(now), readLastTrained(now), readDoneStyles(), readShown()]);
      const plan = planById(state?.planId);
      let planPart: Loaded['plan'] = null;
      if (plan && state) {
        const dayIndex = Math.max(0, Math.min(state.nextDayIndex, plan.days.length - 1));
        planPart = { plan, dayIndex, weekIndex: weekFor(state, plan.id), always: await alwaysPicks(plan.id) };
      }
      if (alive) setLoaded({ answers: profile?.intake, dislikes, recent, ...(recentAt !== null ? { recentWhen: whenWords(recentAt, now) } : {}), plan: planPart, lastTrained, done, shown, now });
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const chip: QuickMinutes = minutes ?? chipFor(loaded?.answers?.minutes);
  const kit = useMemo(() => (gym ? kitOf(gym) : null), [gym]);
  const base = useMemo(() => (loaded && kit ? baseInput(loaded.answers, kit, { ...loaded.dislikes, never: [...(loaded.dislikes.never ?? []), ...neverNow] }) : null), [loaded, kit, neverNow]);
  const buildable = useMemo(() => (base ? canBuild(base, QUICK_DEPS) : null), [loaded, kit]); // eslint-disable-line react-hooks/exhaustive-deps
  const ideas = useMemo(() => {
    if (!loaded || !kit || !base) return null;
    const p = loaded.plan;
    const plan = p
      ? planConcept({ plan: p.plan, dayIndex: p.dayIndex, weekIndex: p.weekIndex, minutes: chip, gym: kit, always: p.always, ...(base.never ? { never: base.never } : {}), ...(base.soft ? { soft: base.soft } : {}), ...(base.easyOn ? { easyOn: base.easyOn } : {}), ...(base.experience ? { experience: base.experience } : {}) }, QUICK_DEPS)
      : null;
    return buildIdeas(
      { base, minutes: chip, recent: loaded.recent, ...(loaded.recentWhen ? { recentWhen: loaded.recentWhen } : {}), plan, lastTrained: loaded.lastTrained, now: loaded.now, done: loaded.done, lastShown: loaded.shown },
      QUICK_DEPS,
    );
    // Concepts are worked out for the chip picked; a "never" learned in the deck applies next time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, kit, chip]);

  // PLAN 3.5b: More ideas puts another style in the place it can take (3.5b round 4: card 4, or the
  // one card it is too close to); per chip, a new chip starts fresh. Its chip row then offers the card
  // it replaced, to go back.
  const [picked, setPicked] = useState<{ chip: QuickMinutes; key: string } | null>(null);
  const pickedAt = ideas && picked?.chip === chip ? ideas.more.findIndex((c) => cardKey(c) === picked.key) : -1;
  const concepts = useMemo(() => {
    if (!ideas) return null;
    if (pickedAt === -1) return ideas.cards;
    const out = [...ideas.cards];
    out.splice(ideas.moreAt[pickedAt]!, 1, ideas.more[pickedAt]!);
    return out;
  }, [ideas, pickedAt]);
  const moreIdeas = useMemo(() => {
    if (!ideas || !concepts) return [];
    const out: { concept: Concept; back: boolean }[] = [];
    if (pickedAt !== -1) {
      const replaced = ideas.cards[ideas.moreAt[pickedAt]!];
      if (replaced) out.push({ concept: replaced, back: true });
    }
    for (const c of ideas.more) if (!concepts.includes(c)) out.push({ concept: c, back: false });
    return out;
  }, [ideas, concepts, pickedAt]);
  const [swappedIn, setSwappedIn] = useState<string | null>(null);
  // 3.5d (4): the card a More ideas tap brought in is scrolled into view and glows once (motion.ts DUR.celebrate).
  const [flash, setFlash] = useState<string | null>(null);
  const pickMore = (c: Concept, back: boolean) => {
    setPicked(back ? null : { chip, key: cardKey(c) });
    setSwappedIn(cardKey(c));
    setFlash(cardKey(c));
  };
  useEffect(() => {
    if (!flash) return;
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-concept]')).find((e) => e.dataset.key === flash);
    card?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    const t = window.setTimeout(() => setFlash(null), DUR.celebrate + 200);
    return () => window.clearTimeout(t);
  }, [flash, reduced]);

  // The rotation remembers the first cards shown on each visit (once; a later chip does not count).
  const remembered = useRef(false);
  useEffect(() => {
    if (!ideas || remembered.current || !ideas.cards.length) return;
    remembered.current = true;
    void recordShown(ideas.cards.map((c) => c.id)).catch(() => undefined);
  }, [ideas]);

  // ------------------------------------------------------------ the deck
  const { stage, setStage, notice, swapNote, leaving, fling, setFling, hint, canSwap, decide, flyStart, never, nothingToSwap, curate } = useDeck(base, kit, neverNow, setNeverNow, setError);

  // ------------------------------------------------------------ start

  const start = useTapGuard(async () => {
    if (!stage || !gym || !stage.items.length) return;
    setError('');
    try {
      const session = await startBuilt(gym.id, { id: stage.concept.id, items: stage.items, ...(stage.plan ? { plan: stage.plan } : {}) }, chip);
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
              {metaLine(stage.items, total)}
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
          <section className={`${styles.section} ${styles.longSection}`} aria-labelledby="quick-long">
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
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} height={156} radius={24} />
                ))}
              </div>
            ) : concepts.length === 0 ? (
              // Something can be built here, just not in this little time (round 2, B3).
              <p className={styles.noFit} data-testid="quick-nofit">
                Nothing we can build fits {chip} min here. Try a longer time.
              </p>
            ) : (
              <div className={styles.concepts}>
                {concepts.map((c) => (
                  <ConceptCard key={cardKey(c)} concept={c} onPick={() => curate(c)} entering={cardKey(c) === swappedIn} flash={cardKey(c) === flash} label={cardKey(c) === swappedIn && c.focus ? `${c.title}: ${c.focus.toLowerCase()}` : c.title} reduced={reduced} />
                ))}
              </div>
            )}
            {/* 3.5d (5): no note under the cards: the cards are what they are. */}
          </section>
          {concepts && moreIdeas.length > 0 && (
            <section className={styles.section} aria-labelledby="quick-more" data-testid="more-ideas">
              <h2 id="quick-more" className={styles.sectionTitle}>
                More ideas
              </h2>
              <div className={styles.moreChips} role="group" aria-labelledby="quick-more">
                {moreIdeas.map(({ concept: c, back }) => {
                  const label = moreLabel(c, [...concepts, ...moreIdeas.map((m) => m.concept)]);
                  return (
                    <button key={cardKey(c)} type="button" className={`${styles.moreChip} pressable`} onClick={() => pickMore(c, back)} data-testid={`more-${c.id}`} data-key={cardKey(c)} aria-label={`${label}: show this idea in the list`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
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
