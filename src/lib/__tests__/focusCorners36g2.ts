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
  '6d 45m forearms,posture,obliques,biceps,rear_delts,hamstrings,quads,lats,side_delts,grip | Posture +0',
  '6d 45m grip,quads,triceps,side_delts,front_delts,abs,glutes,forearms,rear_delts,mobility | Triceps +2',
  '6d 75m obliques,mobility,posture,side_delts,rear_delts,biceps,forearms,upper_back,lower_back,hamstrings | Side shoulders +2',
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
