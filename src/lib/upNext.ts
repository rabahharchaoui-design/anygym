// "Up next" and the plain words of SPEC 22 (PLAN 3.4a; moved out of order.ts in 3.5f, code
// organization, behavior unchanged). Pure. Everyone imports these from lib/order.
import type { Pattern } from './swap';
import { type Goal, type Muscle, type Profile, isCompound } from './order';

// ---------------------------------------------------------------- Up next

export type UpNextContext = {
  goal?: Goal;
  focus?: readonly Muscle[];
  /** Muscles trained in the last 48 hours (other workouts): not hammered again (SPEC 22). */
  recent?: readonly Muscle[];
  /** Joints to go easy on (intake 14): risky lifts for them are never suggested. */
  easyOn?: readonly string[];
  /** One key for ids that are the same exercise, so nothing done today comes back. */
  sameAs?: (id: string) => string;
  /** Intake experience (SPEC 14): advanced skills only for '3y' (2+ years); unknown is treated as new. */
  experience?: string;
};

export type Idea = { profile: Profile; reason: string };

const PUSH: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal push', 'vertical push', 'chest isolation', 'triceps', 'lateral delt']);
const PULL: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal pull', 'vertical pull', 'rear delt', 'biceps']);
const LEGS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves']);

/** Lifts a sore joint should skip (SPEC 15 "go easy on"), by pattern or id words. */
const EASY_ON_AVOID: Record<string, (p: Profile) => boolean> = {
  // Supported rows and machines over loaded hinges, bent over rows and bar squats.
  lower_back: (p) => (p.pattern === 'hinge' && p.tier <= 1) || /good_morning|bent_over|bent-over|barbell_squat|barbell-back-squat|front_barbell_squat|front-squat/i.test(p.id),
  knees: (p) => p.pattern === 'lunge' || /jump|sissy/i.test(p.id),
  shoulders: (p) => p.pattern === 'vertical push' || /dips|upright/i.test(p.id),
  wrists: (p) => /wrist|skullcrusher|barbell_curl|barbell-bicep-curl/i.test(p.id),
  hips: (p) => /sumo|adductor|abductor/i.test(p.id),
  neck: (p) => /shrug|upright/i.test(p.id),
};

/** Whether a lift is one a sore joint on the "go easy on" list should skip (SPEC 15). Unknown joints skip nothing. */
export function easyOnAvoids(easyOn: readonly string[] | undefined, p: Profile): boolean {
  return (easyOn ?? []).some((j) => EASY_ON_AVOID[j]?.(p) === true);
}

/** "bench", "squat", "rows": the plain word for a lift in a reason. */
export function liftWord(p: Pick<Profile, 'name' | 'pattern'>): string {
  const n = p.name.toLowerCase();
  if (p.pattern === 'horizontal push') return /bench/.test(n) ? 'bench' : /push.?up/.test(n) ? 'push ups' : 'chest press';
  if (p.pattern === 'vertical push') return 'overhead press';
  if (p.pattern === 'squat') return /leg press/.test(n) ? 'leg press' : 'squat';
  if (p.pattern === 'hinge') return /deadlift/.test(n) && !/romanian|stiff/.test(n) ? 'deadlift' : 'hinge';
  if (p.pattern === 'horizontal pull') return 'rows';
  if (p.pattern === 'vertical pull') return /pulldown/.test(n) ? 'pulldown' : 'pull ups';
  if (p.pattern === 'lunge') return 'lunges';
  return n;
}

const MUSCLE_WORD: Record<Muscle, string> = {
  quads: 'quads',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  'lower back': 'lower back',
  adductors: 'inner thighs',
  abductors: 'outer hips',
  calves: 'calves',
  chest: 'chest',
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'rear shoulders',
  back: 'back',
  traps: 'traps',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  abs: 'abs',
};
export const muscleWord = (m: Muscle): string => MUSCLE_WORD[m];

type Scored = { p: Profile; score: number; reason: string; at: number };

/** Rule 4: the isolation patterns that finish what a compound started. */
const FOLLOW_UPS: Partial<Record<Pattern, readonly Pattern[]>> = {
  'horizontal push': ['chest isolation', 'triceps'],
  'vertical push': ['lateral delt', 'triceps'],
  'horizontal pull': ['rear delt', 'biceps'],
  'vertical pull': ['biceps', 'rear delt'],
  squat: ['quads isolation', 'hamstrings isolation'],
  hinge: ['hamstrings isolation', 'glutes'],
  lunge: ['quads isolation', 'glutes'],
};

/** Reasons, most telling first: the line shown is the first that applies. */
type Why = 'focus' | 'follow' | 'balance' | 'legs' | 'compound' | 'late';

/**
 * Up next (SPEC 22): the single best next exercise after `done` (today's, in order), plus up to
 * `others` other ideas of other patterns, from `pool` (only what the active gym can do, best first
 * per pattern; the caller filters). Fewer when fewer fit; never one done today, never a stretch.
 */
export function upNextIdeas(done: readonly Profile[], pool: readonly Profile[], ctx: UpNextContext = {}, others = 2): Idea[] {
  const key = ctx.sameAs ?? ((id: string) => id);
  const taken = new Set(done.map((p) => key(p.id)));
  const last = done[done.length - 1];
  // The words name the last lift (a warm up or stretch is not one).
  const lastLift = [...done].reverse().find((p) => p.role === 'lift');
  const goal = ctx.goal ?? 'muscle';
  const compounds = done.filter(isCompound);
  // Rule 1: the big lifts first; a strength day leans on them longer.
  const need = goal === 'strength' ? 4 : 3;
  const recent = new Set(ctx.recent ?? []);
  const focus = new Set(ctx.focus ?? []);
  const avoid = (ctx.easyOn ?? []).map((j) => EASY_ON_AVOID[j]).filter((f): f is (p: Profile) => boolean => !!f);
  const doneSet = (s: ReadonlySet<Pattern>) => done.filter((p) => p.pattern && s.has(p.pattern)).length;
  const push = doneSet(PUSH);
  const pull = doneSet(PULL);
  const legs = doneSet(LEGS);
  const patternsDone = new Set(done.flatMap((p) => (p.pattern ? [p.pattern] : [])));
  // Rule 3: a muscle an isolation already tired today is a helper no compound should lean on now.
  const tired = new Set(done.filter((p) => p.role === 'lift' && !isCompound(p)).flatMap((p) => p.targets));

  const scored: Scored[] = [];
  pool.forEach((p, at) => {
    if (p.role !== 'lift' || taken.has(key(p.id)) || avoid.some((f) => f(p))) return;
    if (isCompound(p) && p.helpers.some((h) => tired.has(h))) return;
    if (p.advanced && ctx.experience !== '3y') return;
    let score = 0;
    const why = new Map<Why, string>();
    if (isCompound(p)) {
      if (compounds.length < need) {
        score += 40 - p.tier * 6 + p.load;
        why.set('compound', lastLift ? `Different pattern after ${liftWord(lastLift)}` : 'Big lift first, while you are fresh');
      } else score += 8 - p.tier * 4;
      // Spread the big lifts over the body: another one on the same muscles waits.
      if (compounds.some((c) => c.targets.some((m) => p.targets.includes(m)))) score -= 8;
    } else {
      const anchor = [...done].reverse().find((d) => isCompound(d) && d.pattern && p.pattern && FOLLOW_UPS[d.pattern]?.includes(p.pattern));
      if (anchor && !(p.pattern && patternsDone.has(p.pattern))) {
        score += 25 + (anchor === last ? 8 : 0);
        const m = p.targets.find((x) => anchor.targets.includes(x) || anchor.helpers.includes(x)) ?? p.targets[0];
        why.set('follow', m ? `Finishes the ${muscleWord(m)} your ${liftWord(anchor)} warmed up` : `Builds on your ${liftWord(anchor)}`);
      }
      if (compounds.length < need) score -= 20;
      if (p.tier >= 3) {
        if (done.length >= 3) why.set('late', 'Abs and calves go near the end');
        else score -= 12;
      }
    }
    // Push and pull roughly equal (rule 7), legs never skipped.
    if (p.pattern && PULL.has(p.pattern) && push > pull) {
      score += 12 + (isCompound(p) ? 4 : 0);
      why.set('balance', 'Balances your push');
    }
    if (p.pattern && PUSH.has(p.pattern) && pull > push) {
      score += 12 + (isCompound(p) ? 4 : 0);
      why.set('balance', 'Balances your pull');
    }
    if (p.pattern && LEGS.has(p.pattern) && legs === 0 && done.length >= 3 && push + pull >= 3) {
      score += 10;
      why.set('legs', 'Your legs get a turn');
    }
    if (last?.pattern && p.pattern === last.pattern) score -= 50;
    else if (p.pattern && patternsDone.has(p.pattern)) score -= 15;
    // Not the same muscles two days in a row (SPEC 22).
    if (p.targets.some((m) => recent.has(m))) score -= 30;
    const f = p.targets.find((m) => focus.has(m));
    if (f) {
      score += 10;
      why.set('focus', `Your focus: ${muscleWord(f)}`);
    }
    // Plain moves first, even for those who may do a skill.
    if (p.advanced) score -= 25;
    const order: Why[] = ['focus', 'follow', 'balance', 'legs', 'compound', 'late'];
    const reason = order.map((w) => why.get(w)).find(Boolean) ?? (isCompound(p) ? 'Next big lift while you are fresh' : 'Rounds out the workout');
    scored.push({ p, score, reason, at });
  });
  scored.sort((a, b) => b.score - a.score || a.p.tier - b.p.tier || a.at - b.at);
  // One big suggestion and other ideas of other patterns when there are any (never three alike).
  const out: Scored[] = [];
  const usedPatterns = new Set<Pattern | null>();
  for (const s of scored) {
    if (out.length > others) break;
    if (usedPatterns.has(s.p.pattern)) continue;
    out.push(s);
    usedPatterns.add(s.p.pattern);
  }
  for (const s of scored) {
    if (out.length > others) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.map((s) => ({ profile: s.p, reason: s.reason }));
}
