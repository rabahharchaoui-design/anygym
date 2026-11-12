// What the celebration engine is handed (PLAN 3.6b). A moment is a fact that already happened and
// is already saved: the producer (gym records, later runs, XP, the passport) writes every word and
// number; the engine only decides how loudly to show it and never computes anything.

/** How loud: a chip in a row, a card on a summary screen, or the whole screen. */
export type Tier = 'small' | 'medium' | 'big';

/** Where moments are being shown: in the middle of the work (a set, a run) or on its summary screen. */
export type Place = 'active' | 'summary';

/** What happened. Only first_workout and lift_record are produced today (the gym). */
export type MomentKind = 'first_workout' | 'level_up' | 'city_stamp' | 'run_record' | 'lift_record' | 'badge' | 'xp';

export type Moment = {
  /** Stable for the fact: "lift:<set id>", "first:<session id>". Two moments with one id are one moment. */
  id: string;
  kind: MomentKind;
  /** Rare enough for the whole screen (the producer's rule, from facts: a first workout, the heaviest ever on a main lift). */
  big: boolean;
  /** Ranks moments of one kind: the larger wins (a gain ratio for lifts). Kinds are ranked by KIND_ORDER first. */
  weight: number;
  /** What it is about: "Barbell Bench Press", "First workout". */
  title: string;
  /** The one number, with its unit: "185 lb". It counts up on the full screen. */
  hero: string;
  /** Under the hero on the full screen: "Heaviest ever", "lifted today". */
  caption: string;
  /** The card's line, the whole fact: "185 lb × 6, heaviest ever". */
  detail: string;
  /** How much more than before, when one plain number says it: "+10 lb", "+2 reps". */
  plus?: string;
};

/** What to show, by tier. `small` is only filled while active; `big` and `medium` only on a summary. */
export type Selection = { big: Moment | null; medium: Moment[]; small: Moment[] };

/** How a tier moves for this person: no particles, no count up and no travel under reduced motion (a calm fade, the same words). */
export type Staging = { particles: boolean; countUp: boolean; travel: boolean };
