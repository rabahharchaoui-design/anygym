// PLAN Q1 (SPEC 20.3): recovery for Quick workout's targets. The front door of src/lib/recovery/.
export { RECOVERY_GROUPS, RECOVERY_HOURS, groupOf, windowMs, type RecoveryGroup } from './groups';
export { TRAINED_MIN_SETS, groupsTrained, lastTrainedGroups, type GroupTraining, type LoggedSet, type LoggedWorkout } from './trained';
export { MAX_RECOMMENDED, hasHistory, isRested, targetRecovery, trainedFact, type RecoveryState, type RecoveryTarget, type TargetRecovery } from './status';
