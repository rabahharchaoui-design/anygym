import { lazy, Suspense } from 'react';
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
import { PlacePlans } from './screens/plans/PlacePlans';
import { SettingsScreen } from './screens/SettingsScreen';
import { ImportReview } from './screens/settings/ImportReview';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';
import { FinishScreen } from './screens/workout/FinishScreen';
import { PlatesDevScreen } from './screens/dev/PlatesDevScreen';
import { LoadsDevScreen } from './screens/dev/LoadsDevScreen';
import { InfoDevScreen } from './screens/dev/InfoDevScreen';
import { ViewportDevScreen } from './screens/dev/ViewportDevScreen';
import { UiDevScreen } from './screens/dev/UiDevScreen';
import { ReviewScreen } from './screens/review/ReviewScreen';
import { devToolsEnabled } from './screens/dev/devFlag';
import { AppMarkLoader } from './ui/AppMarkLoader';
import { IntakeGate } from './components/IntakeGate';
import { IntakeScreen } from './screens/intake/IntakeScreen';

const DEV_TOOLS = devToolsEnabled();
// Lazy, so the catalog JSON it reads stays out of the main bundle.
const MusclesDevScreen = lazy(() => import('./screens/dev/MusclesDevScreen').then((m) => ({ default: m.MusclesDevScreen })));

export function App() {
  return (
    <>
      <ArrivalGuard />
      <Routes>
        {DEV_TOOLS && <Route path="dev/plates" element={<PlatesDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/loads" element={<LoadsDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/info" element={<InfoDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/ui" element={<UiDevScreen />} />}
        {DEV_TOOLS && (
          <Route
            path="dev/muscles"
            element={
              <Suspense fallback={<AppMarkLoader />}>
                <MusclesDevScreen />
              </Suspense>
            }
          />
        )}
        <Route path="review" element={<ReviewScreen />} />
        <Route path="welcome" element={<IntakeScreen />} />
        <Route path="workout/:sessionId/done" element={<FinishScreen />} />
        <Route path="workout/:sessionId/*" element={<WorkoutScreen />} />
        <Route
          element={
            <IntakeGate>
              <AppShell />
            </IntakeGate>
          }
        >
          <Route index element={<TodayScreen />} />
          <Route path="run" element={<RunScreen />} />
          <Route path="history" element={<HistoryScreen />} />
          <Route path="history/:sessionId" element={<HistoryDetail />} />
          <Route path="plans" element={<PlansScreen />} />
          <Route path="plans/:planId" element={<PlanViewer />} />
          <Route path="plans/place/:placeId" element={<PlacePlans />} />
          <Route path="plans/place/:placeId/:planId" element={<PlanViewer />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="settings/import" element={<ImportReview />} />
          {/* Always registered (device geometry only), reached by tapping the Today title 7 times. */}
          <Route path="dev/viewport" element={<ViewportDevScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <LandscapeGuard />
    </>
  );
}
