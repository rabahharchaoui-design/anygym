import { useCallback, useMemo, useState } from 'react';
import type { QuickDeps, QuickInput } from '../lib/quick';
import { builderPool, builderView, type BuilderPool, type BuilderStep, type BuilderView } from '../lib/quickBuilder';

// PLAN Q8: the swipe builder's state. The deck and every number come from src/lib/quickBuilder.ts;
// this only keeps the answers in order. Add and Skip answer the suggestion when one is shown, else the
// top card; Undo drops the last answer. Not read by any screen yet (the UI lands after Q3a1).

export type QuickBuilder = {
  pool: BuilderPool | null;
  view: BuilderView | null;
  add: () => void;
  skip: () => void;
  undo: () => void;
  canUndo: boolean;
  /** Start over (another duration keeps what was kept; this clears it). */
  clear: () => void;
};

/** `input` should be memoised by the caller: a new object builds the pool again. */
export function useQuickBuilder(input: QuickInput | null, deps: QuickDeps, budget: number): QuickBuilder {
  const pool = useMemo(() => (input ? builderPool(input, deps) : null), [input, deps]);
  const [steps, setSteps] = useState<BuilderStep[]>([]);
  const view = useMemo(() => (pool ? builderView(pool, steps, budget) : null), [pool, steps, budget]);
  const answer = useCallback(
    (kind: BuilderStep['kind']) =>
      setSteps((prev) => {
        if (!pool) return prev;
        const v = builderView(pool, prev, budget);
        const card = v.suggestion?.card ?? v.current;
        return card ? [...prev, { kind, id: card.item.id, from: v.suggestion ? 'suggestion' : 'deck' }] : prev;
      }),
    [pool, budget],
  );
  const add = useCallback(() => answer('add'), [answer]);
  const skip = useCallback(() => answer('skip'), [answer]);
  const undo = useCallback(() => setSteps((prev) => prev.slice(0, -1)), []);
  const clear = useCallback(() => setSteps([]), []);
  return { pool, view, add, skip, undo, canUndo: steps.length > 0, clear };
}
