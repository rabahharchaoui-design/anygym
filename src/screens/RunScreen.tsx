import { TopBar } from '../ui/TopBar';
import { EmptyState } from '../ui/EmptyState';

export function RunScreen() {
  return (
    <>
      <TopBar title="Run" />
      <EmptyState art="run" title="No runs yet" next="Your runs will show up here after your first one." />
    </>
  );
}
