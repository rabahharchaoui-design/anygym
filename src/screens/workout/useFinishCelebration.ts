import { useEffect, useMemo, useRef, useState } from 'react';
import { claimBig } from '../../db/celebrations';
import { selectCelebrations, type Arrival, type Moment } from '../../ui/celebrate';

/**
 * The finish screen's celebration (PLAN 3.6b): which moment gets the whole screen (once per
 * workout, ever), which lead as cards, and when each may show.
 *   - `settled` false: the claim is still being written (one small write); the screen waits for it
 *     before it lets itself be seen, so a card never flashes ahead of its full screen moment.
 *   - `big`: the full screen moment to render now, or null.
 *   - `lead` / `others`: the record cards, biggest first. The first workout has no card of its
 *     own (its number is the Total lifted tile, which it settles into).
 *   - `leadArrival`: hidden while the full screen moment is on its way to it.
 */
export function useFinishCelebration(sessionId: string, moments: readonly Moment[] | undefined, sliding: boolean) {
  // pending: not decided yet. show: on screen. leaving: settling into the screen. none: nothing BIG (or it is over).
  const [state, setState] = useState<'pending' | 'show' | 'leaving' | 'none'>('pending');
  const [seenBig, setSeenBig] = useState(false);
  const claim = useRef<{ id: string; result: Promise<boolean> } | null>(null);
  const ready = moments !== undefined;
  const wanted = useMemo(() => (moments ? selectCelebrations(moments, 'summary').big : null), [moments]);
  const wantedId = wanted?.id;

  useEffect(() => {
    if (!ready || state !== 'pending') return;
    if (!wantedId) return setState('none');
    // One claim per visit, also when React runs this effect twice (StrictMode).
    if (claim.current?.id !== sessionId) claim.current = { id: sessionId, result: claimBig(sessionId, wantedId) };
    let live = true;
    void claim.current.result.then((mine) => {
      if (!live) return;
      setSeenBig(mine);
      setState(mine ? 'show' : 'none');
    });
    return () => {
      live = false;
    };
  }, [ready, state, wantedId, sessionId]);

  const showing = state === 'show' || state === 'leaving';
  // After the decision the order never changes: a spent BIG leads the cards (select.ts).
  const selection = useMemo(() => selectCelebrations(moments ?? [], 'summary', { bigSpent: !showing }), [moments, showing]);
  const cards = [...(selection.big ? [selection.big] : []), ...selection.medium].filter((m) => m.kind !== 'first_workout');
  const lead = cards[0] ?? null;
  // The lead card: waits for its full screen moment; else bursts (or, arriving with the screen, bursts once landed).
  const leadIsBig = !!lead && lead.id === wanted?.id;
  const calm: Arrival = sliding ? 'land' : 'burst';
  const leadArrival: Arrival = (state === 'pending' || state === 'show') && leadIsBig ? 'hidden' : seenBig ? 'still' : calm;

  return {
    settled: ready && state !== 'pending',
    big: showing ? selection.big : null,
    lead,
    others: cards.slice(1),
    leadArrival,
    // One celebration at a time: under a full screen moment the other cards are simply there.
    otherArrival: showing || seenBig ? ('still' as Arrival) : calm,
    onSettle: () => setState((s) => (s === 'show' ? 'leaving' : s)),
    onDone: () => setState('none'),
  };
}
