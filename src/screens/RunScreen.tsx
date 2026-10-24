import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/EmptyState';

export function RunScreen() {
  return (
    <>
      <ScreenHeader title="Run" />
      <EmptyState title="No runs yet" next="Your runs will show up here after your first one." />
    </>
  );
}
