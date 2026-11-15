// PLAN 3.6i: the line icon of each Quick workout style (one Lucide family, SPEC 23.2). It shows in the
// style card's icon slot until the 3D icon has loaded, and stays when it cannot or data is being saved.
import { BicepsFlexed, Dumbbell, HeartPulse, Leaf, Repeat, StretchHorizontal, Weight, type LucideIcon } from 'lucide-react';
import type { StyleId } from '../../lib/quickStyles';

const STYLE_ICONS: Record<StyleId, LucideIcon> = {
  circuit: Repeat,
  pump: Dumbbell,
  strength: Weight,
  cardioCore: HeartPulse,
  mobility: StretchHorizontal,
  armsAbs: BicepsFlexed,
  easy: Leaf,
};

/** The line icon of a style card, or undefined for a card that is not a style (the plan day, a focus). */
export const styleIcon = (id: string): LucideIcon | undefined => (Object.hasOwn(STYLE_ICONS, id) ? STYLE_ICONS[id as StyleId] : undefined);
