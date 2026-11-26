// The front door of the finish counts (PLAN M18a): the weekly count against the goal, the weekly
// streak, the comeback and the time of day. Pure: dates in, numbers out, on the phone's own clock.
export { countsAsWorkout, type WorkoutFact } from './types';
export { DEFAULT_WEEKLY_GOAL, weekCount, weekOf, weeklyGoal, workoutsInWeek, type WeekCount } from './week';
export { weekStreak } from './streak';
export { clockOf, COMEBACK_DAYS_OFF, EARLY_BEFORE_HOUR, EARLY_FROM_HOUR, isComeback, NIGHT_FROM_HOUR, type ClockBadge } from './moments';
