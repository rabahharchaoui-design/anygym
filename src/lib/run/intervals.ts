// Intervals (SPEC 12.7, PLAN 4.4): the presets, a custom set, and the interval clock. Pure.
// The clock is the time the run was going and not paused by hand. Standing still (auto pause) does
// not stop it: a walk break, or a wait at a light, is part of the block. Time the app was not
// running at all (phone locked, app closed) is not counted: nobody was there to say "Walk".
export type BlockName = 'run' | 'walk' | 'hard' | 'easy' | 'jog' | 'sprint' | 'rest';

/** Every name a block can have. Each is a recorded word, so the voice can say any block. */
export const BLOCK_NAMES: ReadonlyArray<{ id: BlockName; label: string; effort: 'push' | 'ease' }> = [
  { id: 'run', label: 'Run', effort: 'push' },
  { id: 'walk', label: 'Walk', effort: 'ease' },
  { id: 'hard', label: 'Hard', effort: 'push' },
  { id: 'easy', label: 'Easy', effort: 'ease' },
  { id: 'jog', label: 'Jog', effort: 'ease' },
  { id: 'sprint', label: 'Sprint', effort: 'push' },
  { id: 'rest', label: 'Rest', effort: 'ease' },
];

export const blockLabel = (name: BlockName): string => BLOCK_NAMES.find((b) => b.id === name)!.label;
/** Push or ease: which of the two screen colours a block wears. */
export const blockEffort = (name: BlockName): 'push' | 'ease' => BLOCK_NAMES.find((b) => b.id === name)!.effort;

export type IntervalBlock = { name: BlockName; sec: number };
/** The blocks, in order, done `rounds` times. */
export type IntervalPlan = { blocks: IntervalBlock[]; rounds: number };

export type IntervalPresetId = 'beginner' | 'builder' | 'speed';
export type IntervalChoice = IntervalPresetId | 'custom';

/** SPEC 12.7, word for word. */
export const PRESET_PLANS: Record<IntervalPresetId, IntervalPlan> = {
  beginner: { blocks: [{ name: 'run', sec: 60 }, { name: 'walk', sec: 120 }], rounds: 8 },
  builder: { blocks: [{ name: 'run', sec: 180 }, { name: 'walk', sec: 60 }], rounds: 6 },
  speed: { blocks: [{ name: 'hard', sec: 60 }, { name: 'easy', sec: 60 }], rounds: 10 },
};

/** Custom intervals: one to four blocks of half a minute to 30 minutes, done 1 to 20 times. */
export const CUSTOM_BOUNDS = { minBlocks: 1, maxBlocks: 4, minSec: 30, maxSec: 30 * 60, stepSec: 30, minRounds: 1, maxRounds: 20 } as const;
export const DEFAULT_CUSTOM: IntervalPlan = { blocks: [{ name: 'run', sec: 120 }, { name: 'walk', sec: 60 }], rounds: 5 };

const isName = (v: unknown): v is BlockName => BLOCK_NAMES.some((b) => b.id === v);
const whole = (v: unknown, min: number, max: number, step = 1): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max && v % step === 0;

/** A plan read back from storage: the plan when every part is inside the bounds, otherwise null. */
export function sanitizePlan(raw: unknown): IntervalPlan | null {
  const p = raw as Partial<IntervalPlan> | null;
  if (!p || typeof p !== 'object' || !Array.isArray(p.blocks)) return null;
  const B = CUSTOM_BOUNDS;
  if (p.blocks.length < B.minBlocks || p.blocks.length > B.maxBlocks || !whole(p.rounds, B.minRounds, B.maxRounds)) return null;
  const blocks: IntervalBlock[] = [];
  for (const b of p.blocks as Array<Partial<IntervalBlock> | null>) {
    if (!b || !isName(b.name) || !whole(b.sec, B.minSec, B.maxSec, B.stepSec)) return null;
    blocks.push({ name: b.name, sec: b.sec });
  }
  return { blocks, rounds: p.rounds };
}

export const planFor = (choice: IntervalChoice, custom: IntervalPlan): IntervalPlan => (choice === 'custom' ? custom : PRESET_PLANS[choice]);

export const planSeconds = (plan: IntervalPlan): number => plan.rounds * plan.blocks.reduce((sum, b) => sum + b.sec, 0);

/** "1 min", "30 s", "2 min 30 s". */
export function blockTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s} s` : s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** "Run 2 min, walk 1 min, 5 times". */
export function planWords(plan: IntervalPlan): string {
  const parts = plan.blocks.map((b, i) => `${i === 0 ? blockLabel(b.name) : blockLabel(b.name).toLowerCase()} ${blockTime(b.sec)}`);
  return `${parts.join(', ')}, ${plan.rounds === 1 ? 'once' : `${plan.rounds} times`}`;
}

/** The interval clock of a run. `at` is the clock time of the last tick, null while it stands (paused, just back). */
export type IntervalState = { plan: IntervalPlan; activeMs: number; at: number | null };

export const startIntervals = (plan: IntervalPlan): IntervalState => ({ plan, activeMs: 0, at: null });

/** Two ticks further apart than this: the app was not running in between, and that time is not counted. */
export const TICK_GAP_MS = 3000;

/** One tick of the clock. `going` is false while the run is paused by hand: the block freezes. */
export function tickIntervals(state: IntervalState, now: number, going: boolean): IntervalState {
  if (!going) return state.at === null ? state : { ...state, at: null };
  if (state.at === null) return { ...state, at: now };
  const delta = now - state.at;
  if (delta <= 0) return state;
  return { ...state, at: now, activeMs: delta > TICK_GAP_MS ? state.activeMs : state.activeMs + delta };
}

export type IntervalReading = {
  /** Every block is done: the run goes on as a free run. */
  done: boolean;
  /** The block's place in the whole session, from 0. Equal to the number of blocks when done. */
  index: number;
  block: IntervalBlock | null;
  /** 1 based. */
  round: number;
  rounds: number;
  /** The last time through the blocks (of more than one). */
  lastRound: boolean;
  /** Milliseconds left in the block. */
  leftMs: number;
  /** 0 to 1: how much of the block is left. */
  left: number;
};

export function readIntervals(state: IntervalState): IntervalReading {
  const { plan } = state;
  const per = plan.blocks.length;
  let t = Math.max(0, state.activeMs);
  for (let i = 0; i < per * plan.rounds; i++) {
    const block = plan.blocks[i % per]!;
    const ms = block.sec * 1000;
    if (t < ms) {
      const round = Math.floor(i / per) + 1;
      return { done: false, index: i, block, round, rounds: plan.rounds, lastRound: plan.rounds > 1 && round === plan.rounds, leftMs: ms - t, left: (ms - t) / ms };
    }
    t -= ms;
  }
  return { done: true, index: per * plan.rounds, block: null, round: plan.rounds, rounds: plan.rounds, lastRound: false, leftMs: 0, left: 0 };
}

/** The countdown as printed: whole seconds, lifted, so it reads 0:00 only when the block is over. */
export function countdown(leftMs: number): string {
  const s = Math.ceil(Math.max(0, leftMs) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
