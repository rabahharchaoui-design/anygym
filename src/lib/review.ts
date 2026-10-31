// Review state (SPEC 9.4): the owner's decision for each catalog exercise and the export file.
// Pure: the screen stores `ReviewState` as one JSON string in the Dexie kv table (no schema change).

export type Verdict = 'approved' | 'wrong-demo' | 'wrong-muscles' | 'fix-cues';

export interface Decision {
  verdict: Verdict;
  /** Required for fix-cues. */
  note?: string;
  at: number;
}

export interface ReviewState {
  decisions: Record<string, Decision>;
}

export const REVIEW_KEY = 'review:v1';
export const REVIEW_FORMAT = 'anygym-review-v1';
export const emptyReview = (): ReviewState => ({ decisions: {} });

/** True when the decision may be saved: Fix cues needs a note. */
export function canDecide(verdict: Verdict, note: string): boolean {
  return verdict !== 'fix-cues' || note.trim().length > 0;
}

export function decide(state: ReviewState, id: string, verdict: Verdict, note: string, at: number): ReviewState {
  if (!canDecide(verdict, note)) return state;
  const d: Decision = { verdict, at };
  if (note.trim()) d.note = note.trim();
  return { decisions: { ...state.decisions, [id]: d } };
}

export function clearDecision(state: ReviewState, id: string): ReviewState {
  const { [id]: _gone, ...rest } = state.decisions;
  return { decisions: rest };
}

/** Counts only ids still in the catalog. */
export function progress(state: ReviewState, ids: readonly string[]): { reviewed: number; total: number } {
  return { reviewed: ids.filter((id) => state.decisions[id]).length, total: ids.length };
}

export const progressText = (p: { reviewed: number; total: number }) => `${p.reviewed} / ${p.total} reviewed`;

/** The first undecided exercise after `from`, wrapping round; else the next one; else `from`. */
export function nextIndex(state: ReviewState, ids: readonly string[], from: number): number {
  for (let k = 1; k <= ids.length; k++) {
    const i = (from + k) % ids.length;
    if (!state.decisions[ids[i]!]) return i;
  }
  return Math.min(from + 1, ids.length - 1);
}

export interface ReviewExport {
  format: typeof REVIEW_FORMAT;
  catalogSha: string;
  exportedAt: string;
  reviewed: number;
  total: number;
  decisions: Record<string, Decision>;
}

export function buildExport(state: ReviewState, ids: readonly string[], catalogSha: string, now: number): ReviewExport {
  const decisions: Record<string, Decision> = {};
  for (const id of ids) if (state.decisions[id]) decisions[id] = state.decisions[id]!;
  const p = progress(state, ids);
  return { format: REVIEW_FORMAT, catalogSha, exportedAt: new Date(now).toISOString(), ...p, decisions };
}

export const exportName = (now: number) => `anygym-review-${new Date(now).toISOString().slice(0, 10)}.json`;

/** Reads stored JSON defensively; anything unexpected is an empty review. */
export function parseReview(raw: string | null): ReviewState {
  try {
    const v = JSON.parse(raw ?? '') as ReviewState;
    const out: ReviewState = emptyReview();
    for (const [id, d] of Object.entries(v?.decisions ?? {})) {
      if (['approved', 'wrong-demo', 'wrong-muscles', 'fix-cues'].includes(d?.verdict) && typeof d.at === 'number') out.decisions[id] = d;
    }
    return out;
  } catch {
    return emptyReview();
  }
}
