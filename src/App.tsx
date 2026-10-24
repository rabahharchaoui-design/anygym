import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ArrivalGuard } from './components/ArrivalGuard';
import { LandscapeGuard } from './components/LandscapeGuard';
import { TodayScreen } from './screens/TodayScreen';
import { RunScreen } from './screens/RunScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HistoryDetail } from './screens/history/HistoryDetail';
import { PlansScreen } from './screens/plans/PlansScreen';
import { PlanViewer } from './screens/plans/PlanViewer';
import { SettingsScreen } from './screens/SettingsScreen';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';
import { PlatesDevScreen } from './screens/dev/PlatesDevScreen';
import { LoadsDevScreen } from './screens/dev/LoadsDevScreen';
import { InfoDevScreen } from './screens/dev/InfoDevScreen';
import { ViewportDevScreen } from './screens/dev/ViewportDevScreen';
import { devToolsEnabled } from './screens/dev/devFlag';

const DEV_TOOLS = devToolsEnabled();

export function App() {
  return (
    <>
      <ArrivalGuard />
      <Routes>
        {DEV_TOOLS && <Route path="dev/plates" element={<PlatesDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/loads" element={<LoadsDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/info" element={<InfoDevScreen />} />}
        <Route path="workout/:sessionId" element={<WorkoutScreen />} />
        <Route element={<AppShell />}>
          <Route index element={<TodayScreen />} />
          <Route path="run" element={<RunScreen />} />
          <Route path="history" element={<HistoryScreen />} />
          <Route path="history/:sessionId" element={<HistoryDetail />} />
          <Route path="plans" element={<PlansScreen />} />
          <Route path="plans/:planId" element={<PlanViewer />} />
          <Route path="settings" element={<SettingsScreen />} />
          {/* Always registered (device geometry only), reached by tapping the Today title 7 times. */}
          <Route path="dev/viewport" element={<ViewportDevScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <LandscapeGuard />
    </>
  );
}
