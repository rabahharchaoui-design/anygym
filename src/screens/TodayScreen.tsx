import { ScreenHeader } from '../components/ScreenHeader';
import { IconLink } from '../components/IconButton';
import { EmptyState } from '../components/EmptyState';
import { ProfileIcon } from '../components/icons';

export function TodayScreen() {
  return (
    <>
      <ScreenHeader
        title="Today"
        trailing={
          <IconLink to="/settings" label="Settings">
            <ProfileIcon />
          </IconLink>
        }
      />
      <EmptyState
        title="No plan yet"
        next="Once you pick a plan, today's workout shows up here."
      />
    </>
  );
}
