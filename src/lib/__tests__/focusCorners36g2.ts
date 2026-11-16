// PLAN 3.6g2: the corners that cannot hold, listed one by one with the reason (no silent tolerance).
// The tests compare what they find with these lists exactly: a corner that goes away, or a new one,
// fails the test until the list is brought up to date.

/**
 * The #1 pick under +3 and under 16 sets. The reason is the same for each and is on its row ("Its
 * days are full"): every day that trains it is at the minutes chosen, no move that no pick asks for
 * is left there to give its place or a set (the small moves are all picks' own, the big lifts are
 * at 3 sets or are the day's first), and the 48 hour rule keeps its work off the other days.
 */
export const TOP_CORNERS: string[] = [
  '3d 45m rear_delts,posture | Rear shoulders +1',
  '6d 45m lower_back,hamstrings | Lower back +0',
  '6d 75m lats,biceps | Lats +0',
  '5d 45m mobility,hamstrings,glutes,obliques | Hamstrings +2',
  '6d 45m front_delts,quads,grip,triceps,biceps | Front shoulders +2',
  '6d 45m glutes,calves,upper_chest,quads,upper_back,hamstrings | Glutes +0',
  '5d 45m front_delts,mobility,rear_delts,lower_back,side_delts,lats,upper_chest | Front shoulders +2',
  '6d 45m hamstrings,upper_chest,grip,posture,quads,lats,mobility | Hamstrings +0',
  '6d 45m upper_back,rear_delts,biceps,hamstrings,forearms,upper_chest,side_delts | Upper back +0',
  '6d 60m upper_back,obliques,calves,posture,mobility,lats,glutes | Upper back +2',
  '4d 45m side_delts,hamstrings,upper_chest,posture,biceps,quads,calves,grip | Side shoulders +2',
  '5d 45m upper_back,abs,biceps,forearms,hamstrings,triceps,calves,grip | Upper back +2',
  '5d 75m mobility,lats,glutes,triceps,abs,front_delts,posture,side_delts | Lats +2',
  '6d 45m obliques,upper_back,hamstrings,posture,glutes,upper_chest,front_delts,mobility | Upper back +0',
  '3d 45m front_delts,mobility,lats,upper_back,hamstrings,glutes,quads,abs,rear_delts | Front shoulders +2',
  '3d 45m front_delts,upper_chest,abs,lats,grip,forearms,mobility,posture,side_delts | Front shoulders +0',
  '4d 45m upper_chest,lats,forearms,glutes,calves,side_delts,rear_delts,biceps,upper_back | Upper chest +2',
  '5d 60m lower_back,lats,side_delts,biceps,mobility,forearms,abs,obliques,posture | Lats +0',
  '3d 60m front_delts,triceps,hamstrings,grip,lower_back,rear_delts,abs,posture,obliques,lats | Front shoulders +2',
  '5d 45m biceps,calves,glutes,side_delts,upper_chest,abs,front_delts,grip,hamstrings,rear_delts | Biceps +1',
  '6d 45m forearms,posture,obliques,biceps,rear_delts,hamstrings,quads,lats,side_delts,grip | Posture +0',
  '6d 45m grip,quads,triceps,side_delts,front_delts,abs,glutes,forearms,rear_delts,mobility | Triceps +2',
  '3d 45m upper_back,upper_chest,mobility,glutes,side_delts,lower_back,calves,biceps,posture,hamstrings,triceps | Upper back +0',
  '4d 45m lats,forearms,rear_delts,lower_back,side_delts,quads,biceps,hamstrings,calves,upper_back,triceps | Lats +2',
  '4d 60m obliques,upper_back,glutes,mobility,triceps,forearms,side_delts,biceps,grip,front_delts,abs | Upper back +0',
  '5d 45m lats,mobility,abs,side_delts,forearms,lower_back,triceps,grip,hamstrings,rear_delts,posture | Lats +2',
  '5d 75m forearms,upper_back,posture,front_delts,mobility,triceps,lats,lower_back,abs,glutes,upper_chest | Upper back +2',
  '6d 45m upper_back,hamstrings,calves,mobility,biceps,rear_delts,quads,abs,grip,lower_back,forearms | Upper back +0',
  '6d 60m mobility,calves,lats,forearms,quads,hamstrings,lower_back,upper_chest,abs,posture,triceps | Calves +2',
  '6d 60m mobility,lats,lower_back,posture,forearms,abs,obliques,triceps,hamstrings,side_delts,glutes | Lats +2',
  '6d 75m calves,rear_delts,hamstrings,abs,upper_chest,lats,grip,quads,posture,upper_back,front_delts | Calves +0',
];

/**
 * More buys more: the steps where a pick still ends with fewer sets than one step smaller. Each
 * line: the pick list | the step | the pick, before and after | the reason, read from the two plans.
 *
 * WHY THESE CANNOT HOLD. The weekly budget of extra sets is 12 at every choice, and the rank is
 * strict. So with several picks the extra sets are shared out of the same 12, and a pick can only
 * keep its number at a bigger choice when the others do not need more of the 12 there. The reasons:
 *   base N to M   the plan with no picks itself gives that muscle fewer sets at the bigger choice (a
 *                 different split on more days; longer rests and other moves with more minutes), so
 *                 the pick would need more extra than before just to stay where it was;
 *   budget        the 12 extra sets are all used in the bigger plan (picks that had no room in the
 *                 smaller plan now take their share of the same 12);
 *   rank          it has as much as a pick ranked above it that could not take more (the strict rank);
 *   room          its days are full in the bigger plan, also after the trades (at 75 minutes the
 *                 rests are longer, so a set costs more time than in a plan trimmed to 60);
 *   at 16 or more it is at the 16 sets the sessions aim for (the last step can be a 2 set move);
 *   stretch       Mobility: the bigger plan has no free minute and no set to trade for a longer block.
 * A single pick has the whole budget to itself: in the seeded lists it has no corner (the test
 * holds that); CRITIC_MORE_CORNERS below lists the one kind found for a single pick.
 */
export const MORE_CORNERS: string[] = [
  'rear_delts,posture | 5 to 6 days at 45 min | rear_delts 12 to 8 | room',
  'rear_delts,posture | 5 to 6 days at 60 min | rear_delts 12 to 10 | room',
  'rear_delts,posture | 5 to 6 days at 75 min | rear_delts 13 to 12 | room',
  'triceps,upper_back | 45 to 60 min on 3 days | triceps 9 to 8 | room',
  'triceps,upper_back | 3 to 4 days at 45 min | upper_back 5 to 2 | base 3 to 2, room',
  'triceps,upper_back | 60 to 75 min on 4 days | triceps 13 to 12 | budget',
  'triceps,upper_back | 60 to 75 min on 6 days | triceps 18 to 16 | at 16 or more',
  'triceps,upper_back | 60 to 75 min on 6 days | upper_back 15 to 12 | room',
  'upper_back,glutes,lower_back | 60 to 75 min on 3 days | glutes 10 to 8 | budget',
  'upper_back,glutes,lower_back | 3 to 4 days at 45 min | upper_back 8 to 7 | base 4 to 3, room',
  'upper_back,glutes,lower_back | 3 to 4 days at 60 min | glutes 10 to 8 | budget',
  'upper_back,glutes,lower_back | 3 to 4 days at 75 min | upper_back 11 to 10 | budget',
  'upper_back,glutes,lower_back | 4 to 5 days at 45 min | glutes 8 to 7 | base 4 to 3, budget',
  'upper_back,glutes,lower_back | 60 to 75 min on 5 days | upper_back 15 to 13 | budget',
  'upper_back,glutes,lower_back | 5 to 6 days at 45 min | lower_back 8 to 7 | base 5 to 4, budget',
  'upper_back,glutes,lower_back | 5 to 6 days at 75 min | upper_back 13 to 12 | room',
  'upper_back,glutes,lower_back | 5 to 6 days at 75 min | glutes 13 to 8 | rank',
  'upper_back,glutes,lower_back | 5 to 6 days at 75 min | lower_back 8 to 6 | rank',
  'upper_back,glutes,lower_back | 60 to 75 min on 6 days | upper_back 17 to 12 | room',
  'upper_back,glutes,lower_back | 60 to 75 min on 6 days | glutes 13 to 8 | rank',
  'upper_back,glutes,lower_back | 60 to 75 min on 6 days | lower_back 8 to 6 | base 8 to 6, rank',
  'calves,upper_chest,side_delts | 4 to 5 days at 45 min | calves 12 to 9 | base 6 to 3, budget',
  'calves,upper_chest,side_delts | 5 to 6 days at 45 min | calves 9 to 6 | base 3 to 0, budget',
  'upper_chest,triceps,hamstrings | 60 to 75 min on 3 days | upper_chest 9 to 8 | budget',
  'upper_chest,triceps,hamstrings | 3 to 4 days at 45 min | triceps 5 to 4 | base 2 to 0, budget',
  'upper_chest,triceps,hamstrings | 3 to 4 days at 60 min | upper_chest 9 to 8 | budget',
  'upper_chest,triceps,hamstrings | 3 to 4 days at 75 min | triceps 10 to 9 | budget',
  'upper_chest,triceps,hamstrings | 60 to 75 min on 4 days | triceps 10 to 9 | budget',
  'upper_chest,triceps,hamstrings | 5 to 6 days at 45 min | upper_chest 8 to 6 | base 3 to 2, room',
  'upper_chest,triceps,hamstrings | 5 to 6 days at 45 min | hamstrings 11 to 9 | room',
  'upper_chest,triceps,hamstrings | 5 to 6 days at 60 min | upper_chest 9 to 8 | budget',
  'upper_chest,triceps,hamstrings | 60 to 75 min on 6 days | triceps 16 to 15 | budget',
  'abs,front_delts,calves,rear_delts | 60 to 75 min on 3 days | abs 14 to 13 | budget',
  'abs,front_delts,calves,rear_delts | 3 to 4 days at 45 min | rear_delts 2 to 0 | base 2 to 0, rank',
  'abs,front_delts,calves,rear_delts | 3 to 4 days at 60 min | abs 14 to 8 | base 8 to 4, budget',
  'abs,front_delts,calves,rear_delts | 3 to 4 days at 60 min | rear_delts 4 to 2 | base 3 to 0, rank',
  'abs,front_delts,calves,rear_delts | 3 to 4 days at 75 min | abs 13 to 10 | base 9 to 6, budget',
  'abs,front_delts,calves,rear_delts | 3 to 4 days at 75 min | calves 9 to 8 | room',
  'abs,front_delts,calves,rear_delts | 3 to 4 days at 75 min | rear_delts 4 to 2 | base 3 to 0, rank',
  'abs,front_delts,calves,rear_delts | 4 to 5 days at 75 min | front_delts 12 to 11 | budget',
  'abs,front_delts,calves,rear_delts | 60 to 75 min on 5 days | front_delts 12 to 11 | budget',
  'abs,front_delts,calves,rear_delts | 5 to 6 days at 45 min | calves 5 to 3 | base 2 to 0, budget',
  'abs,front_delts,calves,rear_delts | 5 to 6 days at 60 min | front_delts 12 to 11 | budget',
  'abs,front_delts,calves,rear_delts | 5 to 6 days at 75 min | calves 9 to 8 | room',
  'abs,front_delts,calves,rear_delts | 60 to 75 min on 6 days | rear_delts 10 to 8 | base 7 to 6, rank',
  'posture,biceps,calves,mobility | 3 to 4 days at 45 min | posture 11 to 6 | base 6 to 3, room',
  'posture,biceps,calves,mobility | 3 to 4 days at 45 min | mobility 12 to 11 | stretch',
  'posture,biceps,calves,mobility | 3 to 4 days at 60 min | posture 12 to 9 | base 6 to 3, budget',
  'posture,biceps,calves,mobility | 3 to 4 days at 75 min | posture 12 to 9 | base 6 to 3, budget',
  'posture,biceps,calves,mobility | 4 to 5 days at 45 min | calves 9 to 6 | base 6 to 3, rank',
  'posture,biceps,calves,mobility | 60 to 75 min on 5 days | calves 10 to 9 | budget',
  'posture,biceps,calves,mobility | 5 to 6 days at 45 min | calves 6 to 0 | base 3 to 0, rank',
  'posture,biceps,calves,mobility | 5 to 6 days at 60 min | calves 10 to 8 | rank',
  'grip,abs,lats,mobility | 3 to 4 days at 60 min | abs 14 to 12 | base 8 to 6, budget',
  'grip,abs,lats,mobility | 3 to 4 days at 75 min | abs 15 to 12 | base 9 to 6, budget',
  'grip,abs,lats,mobility | 5 to 6 days at 45 min | lats 13 to 12 | at 12, the aim under 60 min',
  'grip,abs,lats,mobility | 5 to 6 days at 60 min | lats 14 to 12 | budget',
  'grip,abs,lats,mobility | 5 to 6 days at 75 min | lats 16 to 15 | room',
  'hamstrings,front_delts,triceps,side_delts,calves | 45 to 60 min on 3 days | hamstrings 12 to 7 | budget',
  'hamstrings,front_delts,triceps,side_delts,calves | 3 to 4 days at 45 min | hamstrings 12 to 11 | room',
  'hamstrings,front_delts,triceps,side_delts,calves | 4 to 5 days at 45 min | hamstrings 11 to 9 | room',
  'hamstrings,front_delts,triceps,side_delts,calves | 4 to 5 days at 45 min | calves 4 to 2 | base 4 to 2, room',
  'hamstrings,front_delts,triceps,side_delts,calves | 4 to 5 days at 60 min | hamstrings 14 to 12 | base 10 to 9, budget',
  'hamstrings,front_delts,triceps,side_delts,calves | 60 to 75 min on 5 days | front_delts 11 to 10 | room',
  'hamstrings,front_delts,triceps,side_delts,calves | 60 to 75 min on 5 days | triceps 12 to 11 | base 10 to 9, budget',
  'hamstrings,front_delts,triceps,side_delts,calves | 5 to 6 days at 45 min | hamstrings 9 to 7 | room',
  'hamstrings,front_delts,triceps,side_delts,calves | 5 to 6 days at 45 min | front_delts 8 to 7 | rank',
  'hamstrings,front_delts,triceps,side_delts,calves | 5 to 6 days at 45 min | calves 2 to 0 | base 2 to 0, rank',
  'hamstrings,front_delts,triceps,side_delts,calves | 5 to 6 days at 60 min | front_delts 11 to 10 | room',
  'hamstrings,front_delts,triceps,side_delts,calves | 60 to 75 min on 6 days | triceps 15 to 14 | base 13 to 12, budget',
  'side_delts,front_delts,abs,biceps,mobility | 45 to 60 min on 3 days | side_delts 9 to 6 | room',
  'side_delts,front_delts,abs,biceps,mobility | 45 to 60 min on 3 days | front_delts 6 to 5 | room',
  'side_delts,front_delts,abs,biceps,mobility | 3 to 4 days at 45 min | abs 5 to 0 | base 2 to 0, rank',
  'side_delts,front_delts,abs,biceps,mobility | 3 to 4 days at 60 min | abs 11 to 6 | base 9 to 6, rank',
  'side_delts,front_delts,abs,biceps,mobility | 3 to 4 days at 60 min | biceps 8 to 6 | rank',
  'side_delts,front_delts,abs,biceps,mobility | 3 to 4 days at 75 min | abs 12 to 9 | base 9 to 6, budget',
  'side_delts,front_delts,abs,biceps,mobility | 60 to 75 min on 4 days | side_delts 13 to 9 | budget',
  'side_delts,front_delts,abs,biceps,mobility | 4 to 5 days at 45 min | side_delts 10 to 9 | room',
  'side_delts,front_delts,abs,biceps,mobility | 4 to 5 days at 60 min | side_delts 13 to 9 | room',
  'side_delts,front_delts,abs,biceps,mobility | 5 to 6 days at 60 min | abs 9 to 8 | room',
  'side_delts,front_delts,abs,biceps,mobility | 45 to 60 min on 6 days | side_delts 11 to 10 | budget',
  'side_delts,front_delts,abs,biceps,mobility | 60 to 75 min on 6 days | side_delts 10 to 9 | budget',
  'side_delts,front_delts,abs,biceps,mobility | 60 to 75 min on 6 days | front_delts 10 to 9 | budget',
  'lower_back,hamstrings,grip,triceps,biceps | 3 to 4 days at 45 min | triceps 6 to 5 | base 3 to 0, budget',
  'lower_back,hamstrings,grip,triceps,biceps | 3 to 4 days at 60 min | biceps 9 to 7 | base 6 to 4, budget',
  'lower_back,hamstrings,grip,triceps,biceps | 4 to 5 days at 45 min | hamstrings 11 to 9 | base 6 to 5, budget',
  'lower_back,hamstrings,grip,triceps,biceps | 4 to 5 days at 60 min | hamstrings 12 to 10 | budget',
  'lower_back,hamstrings,grip,triceps,biceps | 4 to 5 days at 75 min | hamstrings 12 to 10 | budget',
  'lower_back,hamstrings,grip,triceps,biceps | 5 to 6 days at 45 min | hamstrings 9 to 8 | base 5 to 4, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 45 to 60 min on 3 days | rear_delts 8 to 6 | budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 3 days | biceps 9 to 8 | budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 3 to 4 days at 45 min | rear_delts 8 to 4 | base 3 to 0, room',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 3 to 4 days at 60 min | rear_delts 6 to 4 | base 3 to 0, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 3 to 4 days at 75 min | rear_delts 7 to 4 | base 3 to 0, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 4 days | biceps 10 to 8 | base 8 to 6, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 4 to 5 days at 60 min | front_delts 12 to 11 | budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 45 to 60 min on 5 days | rear_delts 7 to 6 | budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 4 to 5 days at 75 min | front_delts 12 to 11 | budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 5 days | hamstrings 10 to 9 | base 7 to 6, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 5 days | biceps 13 to 12 | base 10 to 9, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 6 days | rear_delts 11 to 10 | base 7 to 6, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 6 days | front_delts 12 to 11 | budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 6 days | hamstrings 10 to 9 | base 8 to 6, budget',
  'rear_delts,mobility,front_delts,obliques,hamstrings,biceps | 60 to 75 min on 6 days | biceps 16 to 14 | base 14 to 12, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 45 to 60 min on 3 days | front_delts 6 to 3 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 60 to 75 min on 3 days | lats 15 to 6 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 45 min | triceps 3 to 2 | base 3 to 0, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 45 min | rear_delts 3 to 2 | base 3 to 0, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 60 min | lats 15 to 9 | budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 60 min | rear_delts 3 to 2 | base 3 to 0, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 60 min | abs 9 to 8 | base 9 to 6, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 45 to 60 min on 4 days | lats 10 to 9 | budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 75 min | rear_delts 5 to 2 | base 3 to 0, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 3 to 4 days at 75 min | abs 11 to 8 | base 9 to 6, budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 4 to 5 days at 45 min | mobility 17 to 16 | stretch',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 4 to 5 days at 60 min | front_delts 9 to 8 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 45 to 60 min on 5 days | front_delts 9 to 8 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 4 to 5 days at 75 min | front_delts 9 to 8 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 5 to 6 days at 45 min | lats 13 to 12 | budget',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 45 to 60 min on 6 days | front_delts 9 to 8 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 5 to 6 days at 75 min | lats 16 to 15 | room',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 5 to 6 days at 75 min | front_delts 8 to 6 | rank',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 60 to 75 min on 6 days | front_delts 8 to 6 | rank',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 60 to 75 min on 6 days | triceps 14 to 12 | rank',
  'lats,mobility,front_delts,triceps,rear_delts,abs | 60 to 75 min on 6 days | rear_delts 8 to 6 | rank',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 3 to 4 days at 45 min | side_delts 4 to 2 | rank',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 3 to 4 days at 75 min | calves 9 to 8 | budget',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 4 to 5 days at 45 min | glutes 6 to 5 | room',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 4 to 5 days at 45 min | hamstrings 9 to 8 | room',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 4 to 5 days at 45 min | calves 4 to 2 | base 4 to 2, rank',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 4 to 5 days at 60 min | hamstrings 13 to 12 | budget',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 5 to 6 days at 45 min | glutes 5 to 4 | room',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 5 to 6 days at 45 min | calves 2 to 0 | base 2 to 0, rank',
  'glutes,mobility,forearms,hamstrings,calves,side_delts | 5 to 6 days at 60 min | calves 8 to 6 | base 5 to 4, room',
];

/**
 * The critic's own picks (Lats alone, Mobility alone, Lats with Mobility; an experienced lifter)
 * over every step of days and minutes: the steps where the pick still ends with less, and why.
 */
export const CRITIC_MORE_CORNERS: string[] = [
  // Six days are push, pull, legs twice over: lats are trained on the two pull days only, the 48 hour
  // rule keeps lat work off the days next to them, and both pull days are full ("Its days are full").
  'lats of lats, 45 min, 5 to 6 days: 15 to 14 | room',
  'lats of lats, 60 min, 5 to 6 days: 16 to 14 | room',
  'lats of lats, 75 min, 5 to 6 days: 20 to 15 | room',
  'lats of lats, mobility, 45 min, 5 to 6 days: 15 to 14 | room',
  'lats of lats, mobility, 60 min, 5 to 6 days: 16 to 14 | room',
  'lats of lats, mobility, 75 min, 5 to 6 days: 20 to 15 | room',
];
