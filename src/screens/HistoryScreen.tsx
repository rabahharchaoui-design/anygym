import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/EmptyState';

export function HistoryScreen() {
  return (
    <>
      <ScreenHeader title="History" />
      <EmptyState
        title="No workouts yet"
        next="Finish your first workout and it shows up here."
      />
    </>
  );
}
