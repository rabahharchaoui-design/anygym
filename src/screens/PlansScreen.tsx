import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/EmptyState';

export function PlansScreen() {
  return (
    <>
      <ScreenHeader title="Plans" />
      <EmptyState title="No plans yet" next="Plans you can follow will be listed here." />
    </>
  );
}
