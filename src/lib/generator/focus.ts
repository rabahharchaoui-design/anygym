// Focus areas (SPEC 15): 2 to 4 weekly sets for each.
import { isCompound } from '../order';
import { FOCUS_RULES, FOCUS_TARGET, FOCUS_TARGET_SPLIT } from '../generatorRules';
import { makeItem, pickFrom } from './pick';
import { focusCap, prescribe } from './prescribe';
import type { Ctx, Day, Item } from './types';

/** Adds 2 to 4 weekly sets per focus area: on the moves that train it, else a move of its own. */
export function applyFocus(ctx: Ctx, days: Day[]): void {
  for (const f of ctx.input.focus ?? []) {
    if (f === 'balance') continue;
    const rule = FOCUS_RULES[f];
    for (const group of rule.groups) {
      const target = rule.groups.length > 1 ? FOCUS_TARGET_SPLIT : FOCUS_TARGET;
      const inGroup = (it: Item) => group.includes(it.pattern);
      let items = days.flatMap((d) => d.items.filter(inGroup));
      if (!items.length) {
        // Nothing trains it yet: one move of its own on the days with the fewest moves (two at most).
        const order = days.map((d, i) => ({ d, i })).sort((a, b) => a.d.items.length - b.d.items.length || a.i - b.i);
        let added = 0;
        for (const { d } of order) {
          if (added >= target) break;
          const keys = new Set(d.items.map((x) => x.key));
          const it = group.map((pattern) => {
            const c = pickFrom(ctx, pattern, false, keys);
            return c ? makeItem(ctx, c, pattern) : undefined;
          }).find((x): x is Item => !!x);
          if (!it) continue;
          prescribe(ctx, it, false);
          if (added > 0 && added + it.sets > 4) it.sets = Math.max(1, 4 - added);
          it.extra = it.sets;
          it.focus = f;
          d.items.push(it);
          added += it.sets;
        }
        continue;
      }
      // Small moves take the extra sets first, then the compounds; one at a time around the week.
      items = [...items.filter((it) => !isCompound(it.profile)), ...items.filter((it) => isCompound(it.profile))];
      let added = 0;
      let grew = true;
      while (added < target && grew) {
        grew = false;
        for (const it of items) {
          if (added >= target) break;
          if (it.sets >= focusCap(ctx) || it.extra >= 2) continue;
          it.sets++;
          it.extra++;
          it.focus ??= f;
          added++;
          grew = true;
        }
      }
    }
  }
}
