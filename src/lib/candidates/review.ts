// G's decisions on candidate moves (PLAN 3.5e). Pure: the rows the phone stores (Dexie
// candidateReviews, backed up), the approved set the gate gets, and the small export file the
// orchestrator bakes into the repo. The export holds candidate ids, decisions and Fix notes only:
// nothing about the person, their gyms or their workouts.

export const DECISIONS = ['approve', 'wrong', 'fix'] as const;
export type CandidateDecision = (typeof DECISIONS)[number];

export const FIX_REASONS = ['photo', 'gear', 'muscles', 'unsafe', 'other'] as const;
export type FixReason = (typeof FIX_REASONS)[number];

export const FIX_WORDS: Record<FixReason, string> = {
  photo: 'Wrong photo',
  gear: 'Wrong gear',
  muscles: 'Wrong muscles',
  unsafe: 'Unsafe',
  other: 'Other',
};

/** One decision, keyed by the candidate id. */
export interface CandidateReviewRow {
  id: string;
  decision: CandidateDecision;
  reason?: FixReason;
  note?: string;
  at: number;
}

export const NOTE_MAX = 200;

/** A Fix needs a reason; "Other" also needs a few words. */
export function canFix(reason: FixReason | null, note: string): boolean {
  if (!reason) return false;
  return reason !== 'other' || note.trim().length > 0;
}

/** The row a decision writes (a Fix keeps its reason and trimmed note). */
export function decisionRow(id: string, decision: CandidateDecision, at: number, fix?: { reason: FixReason; note: string }): CandidateReviewRow {
  const row: CandidateReviewRow = { id, decision, at };
  if (decision === 'fix' && fix) {
    row.reason = fix.reason;
    const note = fix.note.trim().slice(0, NOTE_MAX);
    if (note) row.note = note;
  }
  return row;
}

/** Only approved ids become sure moves; Wrong and Fix never show. */
export const approvedIds = (rows: readonly CandidateReviewRow[]): string[] => rows.filter((r) => r.decision === 'approve').map((r) => r.id).sort();

/** A stored row as it must look (backup restore and reads check it). */
export function isReviewRow(v: unknown): v is CandidateReviewRow {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const keys = Object.keys(r);
  if (keys.some((k) => !['id', 'decision', 'reason', 'note', 'at'].includes(k))) return false;
  if (typeof r.id !== 'string' || !r.id || typeof r.at !== 'number' || !Number.isFinite(r.at)) return false;
  if (!(DECISIONS as readonly unknown[]).includes(r.decision)) return false;
  if (r.reason !== undefined && (r.decision !== 'fix' || !(FIX_REASONS as readonly unknown[]).includes(r.reason))) return false;
  if (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > NOTE_MAX)) return false;
  return true;
}

export const APPROVALS_FORMAT = 'anygym-candidate-approvals-v1';

export interface ApprovalsExport {
  format: typeof APPROVALS_FORMAT;
  /** The source commit the candidate ids belong to. */
  sourceSha: string;
  exportedAt: string;
  total: number;
  decided: number;
  approved: string[];
  wrong: string[];
  fix: Array<{ id: string; reason: FixReason; note?: string }>;
}

/** The export: only ids still in the candidate list, each list sorted, so two exports compare line by line. */
export function buildApprovalsExport(rows: readonly CandidateReviewRow[], candidateIds: readonly string[], sourceSha: string, now: number): ApprovalsExport {
  const known = new Set(candidateIds);
  const mine = rows.filter((r) => known.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    format: APPROVALS_FORMAT,
    sourceSha,
    exportedAt: new Date(now).toISOString(),
    total: candidateIds.length,
    decided: mine.length,
    approved: mine.filter((r) => r.decision === 'approve').map((r) => r.id),
    wrong: mine.filter((r) => r.decision === 'wrong').map((r) => r.id),
    fix: mine.filter((r) => r.decision === 'fix').map((r) => ({ id: r.id, reason: r.reason ?? 'other', ...(r.note ? { note: r.note } : {}) })),
  };
}

export const approvalsFileName = (now: number) => `anygym-approvals-${new Date(now).toISOString().slice(0, 10)}.json`;
