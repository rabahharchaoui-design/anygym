// PLAN D0: G's hand review of the catalog demos, read straight from the file for tests that pinned
// the earlier audit only rule (approved is shown, anything else hidden).
import { readFileSync } from 'node:fs';

const DECISIONS = (JSON.parse(readFileSync('data/reviews/demo-review-2026-11-19.json', 'utf8')) as { decisions: Record<string, { verdict: string }> }).decisions;

/** True when G approved this catalog id's demo on Nov 19. */
export const gApproved = (catalogId: string | null | undefined): boolean => !!catalogId && DECISIONS[catalogId]?.verdict === 'approved';
