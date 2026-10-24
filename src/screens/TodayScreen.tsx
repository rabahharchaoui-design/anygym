import { ScreenHeader } from '../components/ScreenHeader';
import { IconLink } from '../components/IconButton';
import { EmptyState } from '../components/EmptyState';
import { GymPill } from '../components/GymPill';
import { ProfileIcon } from '../components/icons';
import styles from './TodayScreen.module.css';

export function TodayScreen() {
  return (
    <>
      <ScreenHeader
        title="Today"
        trailing={
          <div className={styles.trailing}>
            <GymPill />
            <IconLink to="/settings" label="Settings">
              <ProfileIcon />
            </IconLink>
          </div>
        }
      />
      <EmptyState
        title="No plan yet"
        next="Once you pick a plan, today's workout shows up here."
      />
    </>
  );
}
