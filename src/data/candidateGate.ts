// THE GATE (PLAN 3.5e): the one place a candidate move can become part of the app. Candidates
// (data/catalog-candidates.json) are never used in any suggestion, plan, swap, quick card, Up next
// or picker result until G approves them on this phone's Review screen. Every lookup the app makes
// (photos, muscles, names, the swap ladders, ordering profiles) asks `approvedCandidate` or
// `approvedLadder`, which know only the ids set here; with none approved they return nothing, so
// every suggestion path returns exactly what it did before candidates existed. Rejected and Fix
// candidates are simply never approved. Only the owner Review screen reads `ownerCandidates`.
// The file itself is its own chunk, loaded only when this phone has approvals or opens the review
// (loadCandidateFile), so everyone else never downloads it.
import type { CandidateFile, CandidateRecord } from '../lib/candidates/types';
import type { Candidate, Pattern } from '../lib/swap';

let FILE: CandidateFile | null = null;
let ALL = new Map<string, CandidateRecord>();
let loading: Promise<CandidateFile> | null = null;

/** Loads the candidate file once (a failed load is tried again next time). */
export function loadCandidateFile(): Promise<CandidateFile> {
  if (FILE) return Promise.resolve(FILE);
  loading ??= import('../../data/catalog-candidates.json').then(
    (m) => {
      FILE = m.default as unknown as CandidateFile;
      ALL = new Map(FILE.candidates.map((c) => [c.id, c]));
      return FILE;
    },
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

let approved: ReadonlySet<string> = new Set();
let version = 0;
const listeners = new Set<() => void>();

/** Sets the approved ids (from this phone's review rows). Ids that are not candidates (or before the file loaded) are ignored. */
export function setApproved(ids: Iterable<string>): void {
  const next = new Set([...ids].filter((id) => ALL.has(id)));
  if (next.size === approved.size && [...next].every((id) => approved.has(id))) return;
  approved = next;
  version += 1;
  for (const fn of listeners) fn();
}

/** Bumped whenever the approved set changes: caches keyed on catalog data drop their entries. */
export const approvedVersion = (): number => version;

/** Called after every change of the approved set (the data modules clear their caches). */
export function onApprovedChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** An approved candidate's record; undefined for any id G has not approved on this phone. */
export function approvedCandidate(id: string): CandidateRecord | undefined {
  return approved.has(id) ? ALL.get(id) : undefined;
}

export const isApprovedCandidate = (id: string): boolean => approved.has(id);

/** The approved candidates of one swap ladder, as ladder candidates, in id order (they join the ladder last). */
export function approvedLadder(pattern: Pattern): Candidate[] {
  const out: Candidate[] = [];
  for (const id of [...approved].sort()) {
    const c = ALL.get(id)!;
    if (!c.ladder || c.pattern !== pattern) continue;
    out.push({ id: c.id, requires: c.requires.map((g) => [...g]), load: c.load, ...(c.bar ? { bar: c.bar } : {}), ...(c.eachSide ? { eachSide: true } : {}), ...(c.timed ? { timed: true } : {}) });
  }
  return out;
}

/** Owner Review screen only (SPEC 9.4): every candidate, approved or not, to decide on (after loadCandidateFile). */
export const ownerCandidates = (): readonly CandidateRecord[] => FILE?.candidates ?? [];

/** The source commit the candidate ids belong to (after loadCandidateFile). */
export const candidateSourceSha = (): string => FILE?.source.sha ?? '';
