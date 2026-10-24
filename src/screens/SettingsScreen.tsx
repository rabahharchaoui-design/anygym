import { ScreenHeader } from '../components/ScreenHeader';
import { IconLink } from '../components/IconButton';
import { EmptyState } from '../components/EmptyState';
import { BackIcon } from '../components/icons';

export function SettingsScreen() {
  return (
    <>
      <ScreenHeader
        title="Settings"
        leading={
          <IconLink to="/" label="Back to Today">
            <BackIcon />
          </IconLink>
        }
      />
      <EmptyState
        title="Nothing to set yet"
        next="Your gyms, units and backups will live here."
      />
    </>
  );
}
