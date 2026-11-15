// PLAN 3.6f and 3.6g: one pick's turn, the stretch block and the fill. Each tentative edit goes
// through the board's one check (the 20 set limit and the minutes chosen). Pure.
import { FOCUS_MUSCLE_MAX, FOCUS_SHARE_MAX, type FocusMove } from './focus';
import type { FocusPickId } from '../intake/options';
import { NARROW, countPick, type Board } from './focusBoard';

/**
 * One pick's turn: everything it can take of `requested` extra sets from the room that is left now.
 * Free time first (PLAN 3.6g: the minutes chosen are used before anything is traded): a set on its
 * own moves, then a new move. Then trades on a full day: a low value accessory gives its place,
 * unpicked moves give a set or two for a new move, and last a set moves over one at a time. A
 * pick's extra goes on the days that already train it, spread over them (PLAN 3.6g2: never a third
 * new move on one day while another day that trains it has none); other days only after those, and
 * only where the 48 hour rule allows (the board's `rested`). `floor`: the round toward 12 sets a week, where
 * the +4 of a share does not hold.
 */
export function serve(b: Board, id: FocusPickId, requested: number, floor = false): void {
  const { days, input, state } = b;
  // A muscle of it is already at the limit: it has plenty and takes no extra.
  // (A part of a muscle, like upper chest, can still take another move's place inside that muscle.)
  if (NARROW.has(id) ? countPick(days, id) >= FOCUS_MUSCLE_MAX : b.atLimit(id)) return;
  // Work already added for another choice counts here too, without a second charge.
  const room = () => Math.min(requested - b.gained(id), state.pool - b.spent());
  // A new move is 2 sets at least, so a pick one set short may take a 2 set move ("about" its share): never past the round's most, never above a pick ranked higher.
  const reach = () => (room() === 1 && b.gained(id) + 2 <= Math.min(floor ? Infinity : FOCUS_SHARE_MAX, b.above(id)) && state.pool - b.spent() >= 2 ? 2 : room());
  if (room() <= 0) return;
  const own = (i: number) => days[i]!.some((m) => m.hard && m.picks.includes(id));
  /** PLAN 3.6g2, spread: the moves for this pick a day has that it did not have with no picks. */
  const added = (i: number) => days[i]!.filter((m) => m.hard && m.picks.includes(id) && !b.baseline[i]!.some((x) => x.key === m.key)).length;
  /** Never more than two moves for the pick added to one day while another day that trains it has none. */
  const crowded = (i: number) => added(i) >= 2 && days.some((_, j) => j !== i && own(j) && added(j) === 0);
  /** Its own days first; of those the ones with the fewest moves added for it (the extra is spread over the days that train it), then the ones with the most time left. */
  const order = () => days.map((_, i) => i).sort((x, y) => Number(own(y)) - Number(own(x)) || added(x) - added(y) || b.slack(y) - b.slack(x) || x - y);
  // The round toward 12 sets only adds to the muscles of an area that are still under it (calves, not more squats).
  const lacking = (m: FocusMove | undefined): m is FocusMove => !!m && (!floor || NARROW.has(id) || b.need(id) === 0 || b.weak(id, m) < state.aim);
  const mine = (day: FocusMove[], compound: boolean) => day.filter((m) => m.hard && m.compound === compound && m.picks.includes(id) && lacking(m)).sort((x, y) => b.weak(id, x) - b.weak(id, y));
  // An option only big lifts train (upper back: rows; front shoulders: presses) takes one of those.
  const candidate = (i: number) => [b.fresh(i, id), b.fresh(i, id, true)].find(lacking);
  const share = (q: FocusPickId) => b.budget.targets.find((t) => t.id === q)?.sets;
  /** May `p` get a set along with this pick's move? A move no pick asks for always (it costs no budget); a focused one only while the budget and its own picks' shares have the room. */
  const rides = (p: FocusMove): boolean => {
    if (!b.wanted(p)) return true;
    const cost = p.picks.includes(id) ? room() >= 2 : state.pool - b.spent() >= 2;
    return cost && p.picks.every((q) => q === id || share(q) === undefined || b.gained(q) < share(q)! || (floor && b.need(q) > 0 && b.gained(q) < b.above(q)));
  };
  /** One more set on `m`. When that alone does not fit (its pair would come apart), together with another small move of the day with the same sets, so the two stay a pair. */
  const grow = (i: number, m: FocusMove): boolean => {
    if (m.sets >= input.cap) return false;
    if (b.accepts(i, () => m.sets++, () => m.sets--)) return true;
    if (m.compound) return false;
    const partners = days[i]!.filter((p) => p !== m && p.hard && !p.compound && p.sets === m.sets && p.sets < input.cap);
    return [...partners.filter((p) => b.wanted(p)), ...partners.filter((p) => !b.wanted(p))].some((p) => rides(p) && b.accepts(i, () => { m.sets++; p.sets++; }, () => { m.sets--; p.sets--; }));
  };
  /** Inside a muscle at the limit, the work for that muscle no pick asks for gives first (PLAN 3.6g2). */
  const inside = (m: FocusMove) => m.muscles.some((x) => b.tight(id).includes(x));
  const donors = (day: FocusMove[]) => b.donors(day, inside);
  const add = (i: number, c: FocusMove, n: number) => b.accepts(i, () => days[i]!.push({ ...c, sets: n }), () => { days[i]!.pop(); });

  // 1. One more working set where the time is free, accessories before compounds, respecting experience.
  for (let guard = 0; room() > 0 && guard < 4; guard++) {
    let grew = false;
    for (const compound of [false, true]) for (const i of order()) for (const m of mine(days[i]!, compound)) {
      if (room() <= 0) break;
      if (grow(i, m)) grew = true;
    }
    if (!grew) break;
  }
  // 2. A new move where the time is free: as many sets as fit, down to 2.
  for (const i of order()) {
    if (reach() < 2) break;
    const c = b.lifts(days[i]!) < b.maxMoves && !crowded(i) ? candidate(i) : undefined;
    if (!c) continue;
    for (let n = Math.min(reach(), input.cap); n >= 2; n--) if (add(i, c, n)) break;
  }
  // 3. A full day: a low priority accessory gives its place. Never another ranked choice, a loved move or a big lift.
  for (const i of order()) {
    if (reach() < 2) break;
    const c = crowded(i) ? undefined : candidate(i);
    const day = days[i]!;
    for (const at of c ? [...new Set([...b.rivals(day, b.tight(id)), ...b.spares(day)])] : []) {
      const old = day[at]!;
      const sizes = [...new Set([Math.min(old.sets, input.cap, reach()), 2])].filter((n) => n >= 2 && n <= reach());
      const swap = (n: number) => b.accepts(i, () => { day[at] = { ...c!, sets: n }; }, () => { day[at] = old; });
      if (sizes.some(swap)) break;
      // A big lift in a small move's place needs more time than it frees: up to two more sets come from moves no pick asks for.
      const gave: FocusMove[] = [];
      let placed = false;
      for (const donor of donors(day).filter((d) => d !== old).slice(0, 2)) {
        donor.sets--; gave.push(donor);
        if (swap(2)) { placed = true; break; }
      }
      if (placed) break;
      for (const d of gave) d.sets++;
    }
  }
  // 4. A full day with nothing to spare: up to three sets from moves no pick asks for make the room for a 2 set move.
  for (const i of order()) {
    if (reach() < 2) break;
    const day = days[i]!;
    const c = b.lifts(day) < b.maxMoves && !crowded(i) ? candidate(i) : undefined;
    if (!c) continue;
    const gave: FocusMove[] = [];
    let placed = false;
    for (const donor of donors(day).slice(0, 3)) {
      donor.sets--; gave.push(donor);
      if (add(i, c, 2)) { placed = true; break; }
    }
    if (!placed) for (const d of gave) d.sets++;
  }
  // 5. Last: one set moves to a focused move from a move no pick asks for.
  for (const compound of [false, true]) for (const i of order()) for (const m of mine(days[i]!, compound)) {
    for (const donor of donors(days[i]!)) {
      if (room() <= 0 || m.sets >= input.cap) break;
      donor.sets--;
      if (!grow(i, m)) donor.sets++;
    }
  }
  // 6. Exactly one set short, with no move left to grow and no budget for two: a new 2 set move joins
  // while one of its own moves on that day gives a set (one more set in all, never one a lower pick has coming).
  for (const i of order()) {
    if (room() !== 1 || reach() !== 1) break;
    const day = days[i]!;
    const c = b.lifts(day) < b.maxMoves && !crowded(i) ? candidate(i) : undefined;
    // The giver is a move of this pick alone (a set taken from one another pick counts too would be taken from that pick), small moves first.
    const giver = c && [...mine(day, false), ...mine(day, true)].find((m) => m.sets > 2 && m.picks.every((q) => q === id || share(q) === undefined));
    if (c && giver) b.accepts(i, () => { giver.sets--; day.push({ ...c, sets: 2 }); }, () => { giver.sets++; day.pop(); });
  }
}

/** The stretch block's length in minutes, longest first (PLAN 3.6g: 5 to 8; the shortest is STRETCH_BLOCK_MIN). */
const STRETCH_MINUTES = [8, 6, 5] as const;
/** Each stretch is held twice; a hold is never shorter or longer than this (seconds). */
const STRETCH_ROUNDS = 2;
const STRETCH_HOLD = [30, 90] as const;

/** The most sets the moves no pick asks for give for the block (two pairs can each give a round, and stay pairs). */
const STRETCH_DONORS = 4;
/** Sessions shorter than this never trade lifting for the block (a 5 minute block is too much of a 20 or 30 minute session). */
const STRETCH_TRADE_MIN = 45;
/** A day keeps at least this many lifts when one gives its place to the stretch block. */
const STRETCH_MIN_LIFTS = 4;

/**
 * PLAN 3.6g: Mobility is a block. Each session with the room ends with 5 to 8 minutes of the sure
 * floor stretches (the caller's candidates), each held twice for the same time. A session with less
 * room gets none (never a stray minute), and the plan says so. `trade` (after the ranked picks had
 * their call, sessions of 45 minutes and up): on a full day moves no pick asks for give up to four
 * sets, or a small move no pick asks for gives its place to the block, or both; never a loved move,
 * a big lift's place or a pick's work.
 */
export function stretch(b: Board, trade = false): void {
  for (const [i, day] of b.days.entries()) {
    if (day.some((m) => m.picks.includes('mobility'))) continue;
    const moves = (b.input.candidates[i] ?? []).filter((m) => !m.hard && m.picks.includes('mobility'));
    if (!moves.length) continue;
    /** The block joins the day; `at`: in the same edit the small move there gives its place (one edit, so the board judges the day as it ends up). */
    const place = (at?: number): boolean => STRETCH_MINUTES.some((minutes) => {
      const seconds = minutes * 60 / (STRETCH_ROUNDS * moves.length);
      if (seconds < STRETCH_HOLD[0] || seconds > STRETCH_HOLD[1] || !Number.isInteger(seconds)) return false;
      const block = moves.map((m) => ({ ...m, sets: STRETCH_ROUNDS, seconds }));
      const old = at === undefined ? undefined : day[at]!;
      return b.accepts(i, () => { if (old) day.splice(at!, 1); day.push(...block); }, () => { day.splice(day.length - block.length); if (old) day.splice(at!, 0, old); });
    });
    if (place() || !trade || (b.input.budgetMinutes ?? Infinity) < STRETCH_TRADE_MIN) continue;
    const donors = b.donors(day).slice(0, STRETCH_DONORS);
    const swap = (): boolean => b.lifts(day) > STRETCH_MIN_LIFTS && b.spares(day).some((at) => place(at));
    // Sets first (every move stays), then a small move's place, then both.
    for (const both of [false, true]) {
      if (both && swap()) break;
      const gave: FocusMove[] = [];
      if (donors.some((donor) => { donor.sets--; gave.push(donor); return place() || (both && swap()); })) break;
      for (const d of gave) d.sets++;
    }
  }
}

/**
 * PLAN 3.6g2, more buys more: when the stretch minutes are under `least` (what the same picks get
 * with a day or minutes fewer), a day's block is made longer, the shortest first: in free time, or
 * with sets from moves no pick asks for (four a day in all at the most), or the place of one small
 * move no pick asks for (never a pick's work, so no pick loses a set).
 */
export function stretchMore(b: Board, least: number): void {
  const blockOf = (day: FocusMove[]) => day.filter((m) => !m.hard && m.picks.includes('mobility'));
  const total = () => b.days.reduce((n, d) => n + blockOf(d).reduce((k, m) => k + (m.seconds ?? 0) * m.sets / 60, 0), 0);
  for (let guard = 0; guard < 12 && total() < least; guard++) {
    const order = b.days.map((_, i) => i).filter((i) => blockOf(b.days[i]!).length).sort((x, y) => blockOf(b.days[x]!)[0]!.seconds! - blockOf(b.days[y]!)[0]!.seconds!);
    const grew = order.some((i) => {
      const day = b.days[i]!, block = blockOf(day), now = block[0]!.seconds!;
      const longer = STRETCH_MINUTES.map((minutes) => minutes * 60 / (STRETCH_ROUNDS * block.length)).filter((sec) => sec > now && sec <= STRETCH_HOLD[1] && Number.isInteger(sec)).reverse();
      const set = (sec: number) => b.accepts(i, () => { for (const m of block) m.seconds = sec; }, () => { for (const m of block) m.seconds = now; });
      const gave: FocusMove[] = [];
      // The sets this day's moves already gave (to the block, or to a pick): a day never gives more than STRETCH_DONORS in all.
      const given = b.baseline[i]!.reduce((n, was) => n + Math.max(0, was.sets - (day.find((m) => m.id === was.id)?.sets ?? was.sets)), 0);
      for (const donor of [undefined, ...b.donors(day).slice(0, Math.max(0, STRETCH_DONORS - given))]) {
        if (donor) { donor.sets--; gave.push(donor); }
        if (longer.some(set)) return true;
      }
      for (const d of gave) d.sets++;
      // Last, like the block's first call: one small move no pick asks for gives its place (never a second one, never under STRETCH_MIN_LIFTS lifts).
      if (b.baseline[i]!.some((was) => !day.some((m) => m.id === was.id)) || b.lifts(day) <= STRETCH_MIN_LIFTS) return false;
      return b.spares(day).some((at) => {
        const old = day[at]!;
        return longer.some((sec) => b.accepts(i, () => { day.splice(at, 1); for (const m of block) m.seconds = sec; }, () => { for (const m of block) m.seconds = now; day.splice(at, 0, old); }));
      });
    });
    if (!grew) break;
  }
}

/** PLAN 3.5j's "about": a day within this many minutes of the choice is full. */
const FILL_SLACK = 2;

/**
 * PLAN 3.6g: the minutes chosen are used. After the picks had their call on the free time, a day
 * still short of the choice is built up with work no pick asks for and that trains no focused
 * muscle (so every focus number stays what it was): a set on its small moves, then on its big
 * lifts, then a small move for muscles the day already trains or that rest on the days around it.
 * More is not better here either: the fill never takes any muscle past FOCUS_MUSCLE_MAX sets a
 * week, and a small move the other days do not have yet comes first (never the same one every day).
 */
export function fill(b: Board): void {
  const { days, input } = b;
  // Only moves whose muscles are sure: a move with none on record can be counted for no limit.
  const free = (m: FocusMove) => m.hard && !b.wanted(m) && m.muscles.length > 0 && !m.muscles.some((x) => b.focusedMuscles.has(x));
  // Counted the wide way: by the sure muscles and by what the 48 hour rule tracks (a plank has no muscle on record, but it is ab work).
  const trains = (m: FocusMove, x: string) => m.hard && (m.muscles.includes(x) || !!m.recovery?.includes(x));
  const room = (m: FocusMove, sets: number) => [...m.muscles, ...(m.recovery ?? [])].every((x) => days.flat().reduce((n, o) => n + (trains(o, x) ? o.sets : 0), 0) + sets <= FOCUS_MUSCLE_MAX);
  const used = (c: FocusMove) => days.filter((d) => d.some((x) => x.key === c.key)).length;
  for (const [i, day] of days.entries()) {
    for (let guard = 0; guard < 40 && b.slack(i) > FILL_SLACK; guard++) {
      const grown = [...day].reverse().sort((x, y) => Number(x.compound) - Number(y.compound)).find((m) => free(m) && m.sets < input.cap && room(m, 1) && b.accepts(i, () => m.sets++, () => m.sets--));
      if (grown) continue;
      if (b.lifts(day) >= b.maxMoves) break;
      const small = (input.candidates[i] ?? []).filter((c) => free(c) && !c.compound && room(c, 2) && !day.some((x) => x.key === c.key) && b.rested(i, c)).sort((x, y) => used(x) - used(y));
      // A muscle no small move of the day trains yet first: the day gets wider before it gets deeper.
      const fresh = small.find((c) => !day.some((x) => x.hard && !x.compound && x.muscles.some((s) => c.muscles.includes(s)))) ?? small[0];
      if (!fresh || ![Math.min(3, input.cap), 2].some((n) => room(fresh, n) && b.accepts(i, () => day.push({ ...fresh, sets: n }), () => { day.pop(); }))) break;
    }
  }
}
