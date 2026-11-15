// PLAN 3.6f, counted independently: this file reads the PLAN text, not the focus module. It maps
// each focus option to the reviewed primary muscles itself, counts the sets of the built plan, and
// compares with the same intake built without focus picks.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { musclesForCatalog, musclesForPlan } from '../../data/muscles';
import { profileFor } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { equipmentPreset } from '../../db/gyms';
import { focusFit } from '../intake/focusFit';
import { checkFit } from './focusFitCheck36g2';
import { focusName } from '../plan/focus';
import { focusLine, focusPeriod, focusRow } from '../plan/focusWords';
import { FOCUS_PARTS, FOCUS_PICKS, type ExperienceId, type FocusPickId, type GoalId } from '../intake/options';
import type { GeneratorInput } from '../generator';
import { easyOnAvoids, isCompound, type Muscle } from '../order';
import { estimateDayMinutes, type Plan } from '../plans';
import { requiresOf, supports } from '../swap';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 1493 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
viTimeout.setConfig({ testTimeout: 60_000 });

type T = { muscle: string; label: string };
const named = (l: string) => (t: T) => t.label.toLowerCase() === l;
const mus = (...m: string[]) => (t: T) => m.includes(t.muscle);
/** Each option, as the PLAN names it, against the reviewed primary muscles. */
const SRC: Record<string, (t: T) => boolean> = {
  chest: mus('chest'), upper_chest: named('upper chest'), back: mus('lats', 'middle back', 'lower back'), lats: mus('lats'), upper_back: mus('middle back'), lower_back: mus('lower back'),
  shoulders: (t) => t.label.toLowerCase().endsWith('delts'), front_delts: named('front delts'), side_delts: named('side delts'), rear_delts: named('rear delts'),
  arms: mus('biceps', 'triceps', 'forearms'), biceps: mus('biceps'), triceps: mus('triceps'), forearms: mus('forearms'), grip: mus('forearms'),
  core: mus('abdominals', 'obliques'), abs: mus('abdominals'), obliques: mus('obliques'), glutes: mus('glutes'),
  legs: mus('quadriceps', 'hamstrings', 'calves'), quads: mus('quadriceps'), hamstrings: mus('hamstrings'), calves: mus('calves'),
  posture: (t) => t.muscle === 'middle back' || t.label.toLowerCase() === 'rear delts',
};
/** The single muscles under an option: the 20 set limit is per muscle, never per area. */
const partsOf = (p: FocusPickId): string[] => (p === 'posture' ? ['upper_back', 'rear_delts'] : p === 'grip' ? ['forearms'] : p === 'glutes' ? ['glutes'] : p === 'chest' ? ['chest'] : (FOCUS_PARTS as Record<string, readonly { id: string }[]>)[p]?.map((x) => x.id) ?? [p]);
/** The order rule's own muscle words (SPEC 22), for "focused moves go earlier". */
const ORDER: Record<string, Muscle[]> = {
  chest: ['chest'], upper_chest: ['chest'], back: ['back'], lats: ['back'], upper_back: ['back'], lower_back: ['lower back'], shoulders: ['front delts', 'side delts', 'rear delts'], front_delts: ['front delts'], side_delts: ['side delts'], rear_delts: ['rear delts'],
  arms: ['biceps', 'triceps', 'forearms'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearms'], grip: ['forearms'], core: ['abs'], abs: ['abs'], glutes: ['glutes'], legs: ['quads', 'hamstrings', 'calves'], quads: ['quads'], hamstrings: ['hamstrings'], calves: ['calves'], posture: ['back', 'rear delts'],
};
const primary = (id: string): T[] => (profileFor(id).role === 'lift' ? ((musclesForPlan(id) ?? musclesForCatalog(id))?.primary ?? []) : []);
type Move = { id: string; sets: number; prim: T[] };
const movesOf = (plan: Plan): Move[][] => plan.days.map((d) => d.blocks.filter((b) => !b.warmup).flatMap((b) => b.items.map((it) => ({ id: it.exerciseId, sets: b.sets!, prim: primary(it.exerciseId) }))));
const setsFor = (ms: Move[][], on: (t: T) => boolean) => ms.flat().reduce((n, m) => n + (m.prim.some(on) ? m.sets : 0), 0);
const footprint = (plan: Plan) => plan.days.map((d) => new Set(d.blocks.filter((b) => !b.warmup).flatMap((b) => b.items).flatMap((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' ? p.targets : []; })));
const exps: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
const ALL = [...new Set(FOCUS_PICKS.map((p) => p.id))].filter((p) => p !== 'balance') as FocusPickId[];
const childOf = (a: FocusPickId, b: FocusPickId) => a !== b && ((FOCUS_PARTS as Record<string, readonly { id: string }[]>)[a]?.some((x) => x.id === b) ?? false);
const build = (input: GeneratorInput) => { const r = generate(input); return r.ok ? { r, plan: definitionPlan(r.plan)! } : null; };

export const tally = { covered: 0, leads: 0, partial: 0, n: 0, built: 0, withPicks: 0, needLine: 0, offered: 0, offeredBoth: 0, fixesChecked: 0, maxMuscle: 0, maxShown: 0, order: 0, rankPairs: 0, rankExempt: 0, plenty: 0, whyLines: 0, whyDays: 0, noWhyDays: 0, noMove: new Set<string>(), byMin: {} as Record<number, number>, byDays: {} as Record<number, number>, extra: {} as Record<number, { n: number; min: number; max: number; sum: number; line: number }> };

function check(count: number, days: number, minutes: number, rep: number) {
  const seed = count * 1000 + days * 100 + minutes + rep * 7919;
  let rng = seed + 1;
  const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
  const pool = [...ALL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  // `count` picks that stand on their own: never an area together with one of its parts.
  const picks: FocusPickId[] = [];
  for (const p of pool) { if (picks.length >= count) break; if (!picks.some((q) => childOf(p, q) || childOf(q, p))) picks.push(p); }
  expect(picks.length).toBe(count);
  const gym = equipmentPreset(rep === 2 ? (seed % 2 ? 'hotel' : 'none') : 'full', 'lb');
  const input: GeneratorInput = {
    goals: [goals[seed % 5]!], experience: exps[(seed >> 2) % 5]!, days, minutes, focusPicks: picks, scheduleStyle: rep ? 'flexible' : 'fixed', gym,
    never: ['barbell-bicep-curl', 'hip-thrust', 'dumbbell-lateral-raise'], love: ['cable-tricep-pushdown', 'leg-extension'], easyOn: seed % 3 === 0 ? ['lower_back'] : seed % 3 === 1 ? ['knees'] : [],
  };
  tally.n++;
  const f = build(input), b = build({ ...input, focusPicks: [] });
  expect(!!f, 'focus picks never decide whether a plan can be built').toBe(!!b);
  if (!f || !b) return;
  tally.built++;
  const m = movesOf(f.plan), mb = movesOf(b.plan);
  const hard = picks.filter((p) => p !== 'mobility');
  const report = f.r.applied.focusReport!;
  const label = `${JSON.stringify(picks)} ${days} days ${minutes} min rep ${rep}`;

  if (!count) { expect(f.plan.days).toEqual(b.plan.days); expect(f.plan.focusReport).toBeUndefined(); return; }
  tally.withPicks++;

  // The budget, from the PLAN text: 4 each for 1 or 2, 3 each for 3 or 4, then 12 shared by rank.
  const asked = report.priorities.filter((p) => p.id !== 'mobility').map((p) => p.requested);
  expect(report.priorities.map((p) => p.id)).toEqual(picks);
  if (hard.length <= 2) expect(asked).toEqual(hard.map(() => 4));
  else if (hard.length <= 4) expect(asked).toEqual(hard.map(() => 3));
  else {
    expect(asked.slice(0, 2).every((n) => n === 3 || n === 4), label).toBe(true);
    expect(asked.slice(2).every((n) => n <= 2), label).toBe(true);
    expect(asked.slice(2).every((n, i, all) => i === 0 || n <= all[i - 1]!), 'a lower rank never gets more').toBe(true);
    expect(asked.reduce((x, y) => x + y, 0)).toBe(12);
  }
  // The shares first; what is left of 12 may go to picks still under 12 sets a week (round 3), so the budget is the shares or what was spent, never past 12.
  expect(report.budget).toBeGreaterThanOrEqual(asked.reduce((x, y) => x + y, 0));
  expect(report.budget).toBeLessThanOrEqual(12);
  expect(report.spent).toBeLessThanOrEqual(report.budget);

  // Extra sets, counted on the built plans: all focused work against the same intake without picks.
  const any = (t: T) => hard.some((p) => SRC[p]!(t));
  const extra = setsFor(m, any) - setsFor(mb, any);
  expect(extra, `total extra ${label}`).toBeLessThanOrEqual(12);
  const s = (tally.extra[count] ??= { n: 0, min: 99, max: -99, sum: 0, line: 0 });
  s.n++; s.min = Math.min(s.min, extra); s.max = Math.max(s.max, extra); s.sum += extra;

  // Never above 20 hard sets a week on a focused muscle. Fewer than without picks only to respect that limit.
  for (const p of hard) for (const part of partsOf(p)) {
    const sets = setsFor(m, SRC[part]!);
    tally.maxMuscle = Math.max(tally.maxMuscle, sets);
    expect(sets, `${part} ${label}`).toBeLessThanOrEqual(20);
  }
  // The app's own muscle words: lats and upper back are one back; quads and abs by their short names.
  const group = (t: T) => (t.label.toLowerCase().endsWith('delts') ? t.label.toLowerCase() : t.muscle === 'lats' || t.muscle === 'middle back' ? 'back' : t.muscle === 'quadriceps' ? 'quads' : t.muscle === 'abdominals' ? 'abs' : t.muscle);
  // ONE MEANING FOR THE NUMBERS: total is every set that trains the pick, extra is what is above the
  // same intake with no picks. Both counted here, on the built plans, never taken from the report.
  const totalOf = (id: FocusPickId, ms: Move[][] = m) => setsFor(ms, SRC[id]!);
  const extraOf = (id: FocusPickId) => Math.max(0, totalOf(id) - totalOf(id, mb));
  const period = focusPeriod(input.scheduleStyle, days);
  expect(period).toBe(rep ? `every ${days} workouts` : 'a week');
  for (const p of report.priorities) {
    if (p.id === 'mobility') continue;
    expect(p.total, `${p.id} total ${label}`).toBe(totalOf(p.id));
    expect(p.extra, `${p.id} extra ${label}`).toBe(extraOf(p.id));
    // THE 20 LIMIT AS SHOWN: every set count the line shows is at most 20, and is the count of the plan.
    const [, much] = focusLine(p, period);
    if (p.parts) {
      for (const part of p.parts) {
        expect(part.sets, `${p.id} ${part.muscle} ${label}`).toBe(setsFor(m, (t) => group(t) === part.muscle));
        expect(part.sets).toBeLessThanOrEqual(20);
        tally.maxShown = Math.max(tally.maxShown, part.sets);
      }
    } else if (p.state !== 'no_move' && p.total > 0) {
      expect(much, `${p.id} ${label}`).toContain(`${p.total} ${p.total === 1 ? 'set' : 'sets'}`);
      expect(p.total, `${p.id} shown ${label}`).toBeLessThanOrEqual(20);
      tally.maxShown = Math.max(tally.maxShown, p.total);
    }
    // The same number is never the total in one line and the extra in another.
    // A goal whose every set is shown under another pick says so in words, with no number or extra of its own (round 3, critic 5).
    if (much.startsWith('covered by your ')) { expect(p.shared).toBe(p.total); expect(p.coveredBy!.length).toBeGreaterThan(0); for (const o of p.coveredBy!) expect(picks).toContain(o); tally.covered++; continue; }
    if (p.state !== 'no_move' && p.total > 0) {
      if (p.extra > 0 && p.extra < p.total) expect(much).toContain(`, ${p.extra} of them extra`);
      if (p.extra === 0) expect(much).not.toContain('extra,');
      // Plenty and extra are never said together: with extra it is "as much as is useful".
      // PLAN 3.6g2: a pick that got its share on the way to the limit says "as much as is useful" too.
      expect(/already (has )?plenty|as much as is useful/.test(much)).toBe(p.state === 'plenty' || (!!p.atLimit && p.extra > 0));
      // PLAN 3.6g2: "no extra" never stands alone: the reason from the report follows it.
      if (p.extra === 0 && p.state !== 'plenty') expect(much, `${p.id} ${label}`).toMatch(/, no extra: (its exercises are at their most sets|extra work stops at 12 sets a week|no more than .+, ranked above it|its days are full)$/);
      expect(/extra.*already (has )?plenty/.test(much), much).toBe(false);
    }
    expect(much).not.toContain('nothing extra');
  }
  // RANK DECIDES COMPETITION (round 3): shares never rise down the rank, and a pick takes sets past
  // its own share (past +4 only toward 12 sets a week, PLAN 3.6g) only while no pick above it has less, unless that one says it has
  // plenty or the app has no exercise for it. Whether a higher pick could have used the room a lower
  // one took is proved on the pure module (lib/plan/__tests__/focusRank.test.ts).
  const ranked = report.priorities.filter((p) => p.id !== 'mobility');
  // A muscle the pick's moves train is at 20 sets (a part like lats is held by its whole muscle, the back).
  const atLimitOf = (id: FocusPickId) => [...new Set(m.flat().filter((x) => x.prim.some(SRC[id]!)).flatMap((x) => x.prim.map(group)))].some((g) => setsFor(m, (t) => group(t) === g) >= 20);
  for (const [j, low] of ranked.entries()) {
    const higher = ranked.slice(0, j);
    const own = (ms: Move[][]) => ms.flat().reduce((n, x) => n + (x.prim.some(SRC[low.id]!) && !ranked.some((h) => h.id !== low.id && x.prim.some(SRC[h.id]!)) ? x.sets : 0), 0);
    // Its own sets, net: when the 20 set limit took sets off moves it shares with another pick, sets of its own make up for them and are not extra.
    const ownExtra = Math.min(low.extra, Math.max(0, own(m) - own(mb)));
    // PLAN 3.6g, 3.6g2: past +4 only toward the sets a week the sessions aim for (12; 16 from 60 minutes, 18 for a single pick at 75; one more when the last step was a 2 set move), or together with a pick ranked below it that still needed sets (the strict rank: the higher pick goes up with it).
    const weakest = Math.min(...partsOf(low.id).map((part) => setsFor(m, SRC[part]!)).filter((n) => n > 0));
    const aim = minutes < 60 ? 12 : hard.length === 1 && minutes >= 75 ? 18 : 16;
    const carriedBy = ranked.slice(j + 1).some((l) => l.extra >= ownExtra - 2);
    // A single pick is also held to what the same answers get with a day or minutes fewer (more buys more), inside the budget of 12.
    expect(ownExtra <= 4 || weakest <= aim + 1 || carriedBy || hard.length === 1, `#${j + 1} ${low.id} past +4 (${ownExtra}) with ${weakest} sets ${label}`).toBe(true);
    for (const high of higher) {
      expect(low.requested, `#${j + 1} ${low.id} has a bigger share than ${high.id} ${label}`).toBeLessThanOrEqual(high.requested);
      // A higher pick at 20 sets cannot take more, whether it got its whole share first ("extra") or not ("plenty"); neither can one whose exercises are all at their most sets (PLAN 3.6g2: said as that).
      if (high.state === 'plenty' || high.state === 'no_move' || high.total >= 20 || atLimitOf(high.id) || high.held === 'maxed') { tally.rankExempt++; continue; }
      tally.rankPairs++;
      // PLAN 3.6g2, THE STRICT RANK: a pick's own extra sets are never more than the extra of a pick ranked above it. No exception for room.
      expect(ownExtra, `#${j + 1} ${low.id} is above ${high.id} ${label}`).toBeLessThanOrEqual(extraOf(high.id));
    }
  }
  // DAY WHY LINES: each names what that day adds for every pick by rank (PLAN 3.6g2: never "and more"), and the
  // pick its first lift trains; a day that does neither has none.
  const dayTotal = (ms: Move[][], i: number, id: FocusPickId) => (ms[i] ?? []).reduce((n, x) => n + (x.prim.some(SRC[id]!) ? x.sets : 0), 0);
  for (const [i, d] of f.plan.days.entries()) {
    const adds = ranked.filter((p) => extraOf(p.id) > 0 && dayTotal(m, i, p.id) > dayTotal(mb, i, p.id));
    const lines = d.focusWhy ?? [];
    expect(lines.length).toBeLessThanOrEqual(1);
    const lead = report.dayLead?.[i] ?? null;
    if (!lines.length) { if (!picks.includes('mobility')) expect(adds, `day ${i + 1} adds but says nothing ${label}`).toEqual([]); expect(lead).toBeNull(); tally.noWhyDays++; continue; }
    tally.whyDays++;
    const whole = lines[0]!;
    // The lead: the day's first lift really trains that pick.
    if (lead) {
      expect(whole.startsWith(`${focusName(lead)} first today`), `${whole} ${label}`).toBe(true);
      expect((m[i] ?? [])[0]!.prim.some(SRC[lead]!), `day ${i + 1} does not open with ${lead} ${label}`).toBe(true);
      tally.leads++;
    }
    const line = lead ? whole.slice(`${focusName(lead)} first today`.length).replace(/^\. Extra: /, 'Extra today: ') : whole;
    if (!line) { if (!picks.includes('mobility')) expect(adds, `day ${i + 1} adds but only names its lead ${label}`).toEqual([]); continue; }
    expect(line.startsWith('Extra today: '), whole).toBe(true);
    // Truth pass (critic r3 3): a minute of stretches is not said as an extra, so it is not counted among what the day adds.
    const saidAdds = report.dayExtra![i]!.filter((x) => x.id !== 'mobility' || (x.minutes ?? 0) >= 5);
    if (saidAdds.every((x) => x.id !== 'mobility')) expect(whole, label).not.toContain('stretch');
    // PLAN 3.6g2: every add is named, never "and more".
    expect(whole, label).not.toContain('and more');
    expect((line.match(/\d+ (?:sets? for|for|min of stretches)/g) ?? []).length, `${line} ${label}`).toBe(saidAdds.length);
    const named = [...line.matchAll(/(\d+) (?:sets? )?for ([a-z ]+?)(?=,| and \d|$)/g)].map((x) => ({ n: Number(x[1]), name: x[2]! }));
    if (!line.includes('stretches')) expect(named.map((x) => x.name), `${line} ${label}`).toEqual(adds.map((p) => focusName(p.id).toLowerCase()));
    for (const x of named) {
      const pick = ranked.find((p) => focusName(p.id).toLowerCase() === x.name)!;
      expect(pick, line).toBeDefined();
      expect(x.n, `${line} day ${i + 1} ${label}`).toBe(dayTotal(m, i, pick.id) - dayTotal(mb, i, pick.id));
      tally.whyLines++;
    }
  }

  const fa = footprint(f.plan), ba = footprint(b.plan);
  const focusTargets = new Set(hard.flatMap((p) => ORDER[p] ?? []));
  for (const [i, d] of f.plan.days.entries()) {
    // Inside the session minutes, through the one time estimate.
    const mins = estimateDayMinutes(d);
    expect(mins).toBe(f.r.applied.minutes[i]);
    if (minutes < 75) expect(mins, `day ${i + 1} ${label}`).toBeLessThanOrEqual(Math.max(minutes, estimateDayMinutes(b.plan.days[i]!)));
    // The 48 hour rule: focus never makes two days in a row share a muscle that they did not share before.
    const j = (i + 1) % fa.length;
    if (j !== i && ![...ba[i]!].some((x) => ba[j]!.has(x))) expect([...fa[i]!].filter((x) => fa[j]!.has(x)), `days ${i + 1} and ${j + 1} ${label}`).toEqual([]);
    // Never want, go easy on, equipment.
    const blocks = d.blocks.filter((x) => !x.warmup);
    for (const it of blocks.flatMap((x) => x.items)) {
      expect(input.never).not.toContain(it.exerciseId);
      expect(easyOnAvoids(input.easyOn, profileFor(it.exerciseId)), it.exerciseId).toBe(false);
      expect(supports(requiresOf(SWAP_DATA, it.exerciseId)!, gym), it.exerciseId).toBe(true);
    }
    // Focused moves go earlier: once the big lifts are done, no small focused move waits behind an unfocused one.
    const info = blocks.map((x) => { const ps = x.items.map((it) => profileFor(it.exerciseId)).filter((p) => p.role === 'lift'); return { lift: ps.length > 0, big: ps.some(isCompound), tier: Math.min(...ps.map((p) => p.tier)), focused: ps.some((p) => p.targets.some((t) => focusTargets.has(t))), first: ps[0]?.pattern, last: ps.at(-1)?.pattern }; });
    const small = info.slice(info.findLastIndex((x) => x.big) + 1).filter((x) => x.lift && x.tier <= 3);
    // PLAN 3.6g2, spread: the one exception is a move that stands between two near identical moves (two curls, two raises) to keep them apart.
    const rest = small.filter((_, k) => !(k > 0 && k + 1 < small.length && !!small[k + 1]!.first && small[k - 1]!.last === small[k + 1]!.first));
    const firstOther = rest.findIndex((x) => !x.focused);
    if (firstOther >= 0 && rest.slice(firstOther).some((x) => x.focused)) { tally.order++; }
  }
  // A loved move the plan had without picks is still there with them.
  const ids = (ms: Move[][]) => new Set(ms.flat().map((x) => x.id));
  for (const id of input.love!) if (ids(mb).has(id) && b.r.applied.loved.includes(id)) expect(ids(m).has(id), `${id} ${label}`).toBe(true);

  // Honest shortfall: extra work that did not fit is said, with a tap only when it really fixes it.
  const short = report.priorities.filter((p) => p.id !== 'mobility' && p.requested > 0 && extraOf(p.id) < Math.max(1, p.requested - 1) && p.state !== 'plenty' && p.state !== 'no_move');
  // "No exercises for it" is only said when the plan really has none.
  for (const p of report.priorities) if (p.state === 'no_move') { expect(totalOf(p.id), `${p.id} ${label}`).toBe(0); tally.noMove.add(p.id); }
  // "Already plenty" is only said when a muscle of that pick really is at 20 (the app counts lats and upper back as one back).
  for (const p of report.priorities) if (p.state === 'plenty') {
    tally.plenty++;
    const groups = new Set(m.flat().filter((x) => x.prim.some(SRC[p.id]!)).flatMap((x) => x.prim.map(group)));
    // Posture is shown as one count of back and rear shoulder work: that count is its limit.
    expect([...groups].some((g) => setsFor(m, (t) => group(t) === g) >= 20) || (p.id === 'posture' && totalOf(p.id) >= 20), `${p.id} at the limit ${label}`).toBe(true);
  }
  const rebuilt = (a: { days?: number; minutes?: number }) => build({ ...input, days: a.days!, minutes: a.minutes! });
  const fit = focusFit({ days: days as 2, minutes: minutes as 20 }, report, (a) => rebuilt(a)?.r.applied.focusReport);
  if (short.length) expect(fit, label).not.toBeNull();
  // Truth pass (critic r3 3): Mobility with no stretch block is said on its own row; it needs no line here unless a step would bring a block.
  for (const p of report.priorities) if (p.id === 'mobility') { expect(p.state, label).toBe((p.session ?? 0) >= 5 ? 'extra' : 'short'); expect(focusRow(p).amount === null, label).toBe((p.session ?? 0) < 5); }
  if (short.length) { tally.needLine++; s.line++; tally.byMin[minutes] = (tally.byMin[minutes] ?? 0) + 1; tally.byDays[days] = (tally.byDays[days] ?? 0) + 1; if (fit!.days || fit!.minutes) tally.offered++; if (fit!.both) tally.offeredBoth++; }
  if (fit) {
    expect(fit.line.length).toBeGreaterThan(10);
    expect(fit.line).not.toContain('with your equipment');
    // PLAN 3.6g2: a step is named with its value and the rebuilt plan's numbers ("Make it 4 days: Side shoulders 6 to 12"); the whole line is checked against this plan and the rebuilt ones (focusFitCheck36g2.ts).
    expect(fit.line.startsWith('Make it ')).toBe(!!(fit.days || fit.minutes));
    checkFit(report, fit, (tap) => rebuilt({ days, minutes, ...tap })?.r.applied.focusReport, label);
    // Never "yet" as if it would change by itself (only "No exercises for … yet", which the app will add).
    expect(fit.line.replace(/No exercises for [^.]+ yet\./, '')).not.toContain('yet');
    if (fit.partial) { tally.partial++; expect(fit.line).toMatch(/^Make it (\d days|\d+ min|\d days and \d+ min): .+( \d+ to \d+| gets its stretches)/); expect(!!(fit.days || fit.minutes)).toBe(true); }
    // FIX OFFERS ARE TRUE: applying the tap leaves no shortfall and no pick with fewer extra sets, counted on the rebuilt plans.
    const taps = fit.both ? [{ days: fit.days!, minutes: fit.minutes! }] : [...(fit.days ? [{ days: fit.days, minutes }] : []), ...(fit.minutes ? [{ days, minutes: fit.minutes }] : [])];
    for (const tap of taps) {
      const nf = rebuilt(tap), nb = build({ ...input, ...tap, focusPicks: [] });
      expect(!!nf && !!nb, `${JSON.stringify(tap)} builds ${label}`).toBe(true);
      const nm = movesOf(nf!.plan), nmb = movesOf(nb!.plan);
      tally.fixesChecked++;
      for (const p of nf!.r.applied.focusReport!.priorities) {
        // Stretches are never fewer after a tap (a tap is only ever offered for them when it brings a real block).
        if (p.id === 'mobility') { expect(p.minutes ?? 0, `stretches after ${JSON.stringify(tap)} ${label}`).toBeGreaterThanOrEqual(report.priorities.find((x) => x.id === 'mobility')?.minutes ?? 0); continue; }
        const after = Math.max(0, setsFor(nm, SRC[p.id]!) - setsFor(nmb, SRC[p.id]!));
        // Nobody is left with less: sets a pick held past its own share were a bonus from room nobody else could use, so keeping the whole share is not less.
        expect(after, `${p.id} lost extra after ${JSON.stringify(tap)} ${label}`).toBeGreaterThanOrEqual(Math.min(extraOf(p.id), Math.max(1, p.requested)));
        // The best partial step (round 3) promises only what its line says: nobody lower, and the picks it names higher.
        // PLAN 3.6g2: a pick the step's sentence names has more sets in the rebuilt plan, counted here on the plans.
        const sentence = [...fit.line.matchAll(/(?:Or make|Make) it ([^:]+): ([^.]+)\./g)].find((x) => x[1] === [tap.days !== days ? `${tap.days} days` : null, tap.minutes !== minutes ? `${tap.minutes} min` : null].filter(Boolean).join(' and '))?.[2] ?? '';
        if (new RegExp(`(^|, | and )${focusName(p.id)} \\d+ to \\d+`).test(sentence)) expect(setsFor(nm, SRC[p.id]!), `${p.id} named but not helped by ${JSON.stringify(tap)} ${label}`).toBeGreaterThan(totalOf(p.id));
        if (fit.partial) continue;
        if (p.state === 'plenty' || p.state === 'no_move' || p.requested === 0) continue;
        expect(after, `${p.id} still short after ${JSON.stringify(tap)} ${label}`).toBeGreaterThanOrEqual(Math.max(1, p.requested - 1));
      }
    }
  }
}

describe('900 seeded intakes: every pick count 0 to 11, days 2 to 6, every minutes choice', () => {
  for (let count = 0; count <= 11; count++) for (const days of [2, 3, 4, 5, 6]) it(`${count} picks, ${days} days`, () => {
    for (const minutes of [20, 30, 45, 60, 75]) for (let rep = 0; rep < 3; rep++) check(count, days, minutes, rep);
  });
  it('covered the whole matrix and stayed inside the PLAN numbers', () => {
    expect(tally.n).toBe(900);
    expect(tally.built).toBeGreaterThan(750);
    expect(tally.withPicks).toBeGreaterThan(700);
    console.log(JSON.stringify({ ...tally, noMove: [...tally.noMove] }));
    expect(tally.maxMuscle).toBeLessThanOrEqual(20);
    expect(tally.maxShown).toBeLessThanOrEqual(20);
    expect(tally.rankPairs).toBeGreaterThan(1000);
    expect(tally.whyLines).toBeGreaterThan(300);
    expect(tally.order).toBe(0);
  });
});
