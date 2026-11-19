// The run diagnostics recorder (PLAN 4.4d (2)): the engine tells it every position and what the
// run did with it; it keeps them in memory and writes them in chunks to their own small database
// (src/db/runDiag.ts) at each save. Positions before GO (the countdown) are kept too, stamped
// before the start, so a slow first fix shows in the log. Writing never holds up the run: a failed
// chunk is dropped (the log is for diagnosis only, the run itself is saved elsewhere).
import { appendDiag, deleteDiag, pruneDiag } from '../db/runDiag';
import { MAX_DIAG_ENTRIES, diagEntry, diagNote, type DiagEntry, type DiagFate, type RawFix } from '../lib/run/diag';

/** Positions kept from before the run exists (the countdown, a few seconds). */
const MAX_EARLY = 120;

type Log = { runId: string; startedAt: number; buffer: DiagEntry[]; count: number; seq: number };

let log: Log | null = null;
let early: Array<{ arrival: number; fix: RawFix }> = [];

export const runDiagLog = {
  /** A position before the run started (the countdown). */
  early(arrival: number, fix: RawFix): void {
    if (log) return;
    early = [...early.slice(-(MAX_EARLY - 1)), { arrival, fix }];
  },

  /** A run started (or came back after the app closed): its log starts or goes on. */
  begin(runId: string, startedAt: number, fresh: boolean): void {
    log = { runId, startedAt, buffer: fresh ? early.map((e) => diagEntry(startedAt, e.arrival, e.fix, 'before-run', null)) : [], count: 0, seq: 0 };
    early = [];
    if (fresh) void pruneDiag().catch(() => undefined);
  },

  /** A position during the run and its fate; `still`: standing froze the distance after it. */
  fix(arrival: number, fix: RawFix, fate: DiagFate, still: boolean): void {
    if (!log || log.count + log.buffer.length >= MAX_DIAG_ENTRIES) return;
    log.buffer.push(diagEntry(log.startedAt, arrival, fix, fate, { still }));
  },

  /** Something the watch did with no position (an error, a restart). */
  note(arrival: number, fate: DiagFate): void {
    if (!log || log.count + log.buffer.length >= MAX_DIAG_ENTRIES) return;
    log.buffer.push(diagNote(log.startedAt, arrival, fate));
  },

  /** Writes what is waiting. `end`: the run is over, the log closes. */
  flush(end = false): void {
    const l = log;
    if (!l) return;
    if (l.buffer.length) {
      // Sequence numbers only grow, also across an app restart (they follow the clock).
      l.seq = Math.max(l.seq + 1, Date.now());
      const chunk = { runId: l.runId, seq: l.seq, startedAt: l.startedAt, entries: l.buffer };
      l.count += l.buffer.length;
      l.buffer = [];
      void appendDiag(chunk).catch(() => undefined);
    }
    if (end) log = null;
  },

  /** The run was thrown away: so is its log. */
  discard(runId: string): void {
    if (log?.runId === runId) log = null;
    void deleteDiag(runId).catch(() => undefined);
  },
};
