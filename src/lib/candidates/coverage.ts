// The coverage table (PLAN 3.5e): for every place preset and every movement pattern, how many sure
// moves exist today and how many there would be if every candidate were approved, against the
// targets. Pure; scripts/coverage-report.ts prints it and the review queue orders by it.
import { supports, type PatternLadder, type Requires } from '../swap';
import { PATTERN_TARGET, PRESET_TARGET, type PresetKit } from './presets';

/** A move as coverage sees it: its group (pattern or extra group) and its gear. */
export interface Move {
  id: string;
  group: string;
  requires: Requires;
  /** In a swap ladder (strength and core moves); false for cardio, mobility, power and accessory. */
  ladder: boolean;
}

export interface CoverageRow {
  id: string;
  label: string;
  today: number;
  ifAll: number;
  /** Of ifAll, the swap ladder moves only (what Quick, swaps and Up next can pick today). */
  ifAllLadder: number;
  target: number;
}

/** Today's sure moves: every ladder candidate with a sure demo, once each. */
export function sureLadderMoves(patterns: Readonly<Record<string, PatternLadder>>, sureDemo: (id: string) => boolean): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const [group, ladder] of Object.entries(patterns)) {
    for (const c of ladder.candidates) {
      if (seen.has(c.id) || !sureDemo(c.id)) continue;
      seen.add(c.id);
      out.push({ id: c.id, group, requires: c.requires, ladder: true });
    }
  }
  return out;
}

const fitCount = (moves: readonly Move[], kit: PresetKit['kit']) => moves.filter((m) => supports(m.requires, kit)).length;

export function presetRows(sure: readonly Move[], candidates: readonly Move[], presets: readonly PresetKit[]): CoverageRow[] {
  return presets.map((p) => {
    const today = fitCount(sure, p.kit);
    return { id: p.id, label: p.label, today, ifAll: today + fitCount(candidates, p.kit), ifAllLadder: today + fitCount(candidates.filter((m) => m.ladder), p.kit), target: PRESET_TARGET };
  });
}

export function groupRows(sure: readonly Move[], candidates: readonly Move[], groups: readonly string[]): CoverageRow[] {
  return groups.map((g) => {
    const today = sure.filter((m) => m.group === g).length;
    const ifAll = today + candidates.filter((m) => m.group === g).length;
    return { id: g, label: g, today, ifAll, ifAllLadder: ifAll, target: PATTERN_TARGET };
  });
}

/** A markdown table: "| Hotel gym | 12 | 220 | 25 | short → met |"; `ladder` adds the swap ladder only column. */
export function coverageTable(title: string, rows: readonly CoverageRow[], ladder = false): string[] {
  const verdict = (r: CoverageRow) => `${r.today >= r.target ? 'met' : 'short'} → ${(ladder ? r.ifAllLadder : r.ifAll) >= r.target ? 'met' : 'still short'}`;
  if (ladder) return [`| ${title} | Sure today | If every candidate is approved | Of them strength and core (ladder) moves | Target | Today → if approved (ladder moves) |`, '|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.label} | ${r.today} | ${r.ifAll} | ${r.ifAllLadder} | ${r.target} | ${verdict(r)} |`)];
  return [`| ${title} | Sure today | If every candidate is approved | Target | Today → if approved |`, '|---|---|---|---|---|', ...rows.map((r) => `| ${r.label} | ${r.today} | ${r.ifAll} | ${r.target} | ${verdict(r)} |`)];
}
