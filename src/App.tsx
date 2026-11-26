import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ArrivalGuard } from './components/ArrivalGuard';
import { LandscapeGuard } from './components/LandscapeGuard';
import { TodayScreen } from './screens/TodayScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { HistoryDetail } from './screens/history/HistoryDetail';
import { PlansScreen } from './screens/plans/PlansScreen';
import { PlanViewer } from './screens/plans/PlanViewer';
import { PlacePlans } from './screens/plans/PlacePlans';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';
import { FinishScreen } from './screens/workout/FinishScreen';
import { PlatesDevScreen } from './screens/dev/PlatesDevScreen';
import { LoadsDevScreen } from './screens/dev/LoadsDevScreen';
import { InfoDevScreen } from './screens/dev/InfoDevScreen';
import { ViewportDevScreen } from './screens/dev/ViewportDevScreen';
import { UiDevScreen } from './screens/dev/UiDevScreen';
import { CandidateReviewScreen, GymDetail, GymEquipment, GymsScreen, ImportReview, preloadRun, preloadTabs, ReviewScreen, RunDetail, RunRecords, RunScreen, SettingsScreen } from './screens/lazyScreens';
import { devToolsEnabled } from './screens/dev/devFlag';
import { AppMarkLoader } from './ui/AppMarkLoader';
import { IntakeGate } from './components/IntakeGate';
import { IntakeScreen } from './screens/intake/IntakeScreen';
import { QuickScreen } from './screens/quick/QuickScreen';
import { useWarmPlanPhotos } from './hooks/useWarmPlanPhotos';

const DEV_TOOLS = devToolsEnabled();
// Lazy, so the catalog JSON it reads stays out of the main bundle.
// PLAN 4.2: the Run tab's start screen, a run's detail and the records are their own chunks
// (src/screens/lazyScreens.ts, PLAN R1). MapLibre is a further chunk that only an open map asks for.
// PLAN M1: the Monolith pieces preview. Only in the dev server and in builds made with
// VITE_DEV_PREVIEW=1 (the Playwright build, playwright.config.ts): the shipped build has no route
// and no chunk for it, since the constant below is replaced at build time and the import dropped.
const PREVIEW = import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === '1';
const MonolithDevScreen = PREVIEW ? lazy(() => import('./screens/dev/MonolithDevScreen').then((m) => ({ default: m.MonolithDevScreen }))) : null;
// PLAN D1: the 2 to 4 frame demo with test frames (tests/demo-steps-d1a.spec.ts).
const DemoStepsDevScreen = PREVIEW ? lazy(() => import('./screens/dev/DemoStepsDevScreen').then((m) => ({ default: m.DemoStepsDevScreen }))) : null;
const RunSummaryDevScreen = PREVIEW ? lazy(() => import('./screens/dev/RunSummaryDevScreen').then((m) => ({ default: m.RunSummaryDevScreen }))) : null;
const MusclesDevScreen = lazy(() => import('./screens/dev/MusclesDevScreen').then((m) => ({ default: m.MusclesDevScreen })));

export function App() {
  // PLAN 3.6k: the current plan's photos are saved for offline in the background.
  useWarmPlanPhotos();
  // The Run tab's chunk and the other lazy tabs (PLAN PB1), once the first screen has settled. A failed fetch is tried again by the tab itself.
  useEffect(() => {
    const t = window.setTimeout(() => {
      void preloadRun();
      preloadTabs();
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <>
      <ArrivalGuard />
      <Routes>
        {DEV_TOOLS && <Route path="dev/plates" element={<PlatesDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/loads" element={<LoadsDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/info" element={<InfoDevScreen />} />}
        {DEV_TOOLS && <Route path="dev/ui" element={<UiDevScreen />} />}
        {DEV_TOOLS && MonolithDevScreen && <Route path="dev/monolith" element={<Suspense fallback={null}><MonolithDevScreen /></Suspense>} />}
        {DEV_TOOLS && DemoStepsDevScreen && <Route path="dev/demo-steps" element={<Suspense fallback={null}><DemoStepsDevScreen /></Suspense>} />}
        {DEV_TOOLS && RunSummaryDevScreen && <Route path="dev/run-summary/:runId" element={<Suspense fallback={null}><RunSummaryDevScreen /></Suspense>} />}
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
        <Route path="review/new" element={<CandidateReviewScreen />} />
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
          <Route path="history/runs" element={<RunRecords />} />
          <Route path="history/run/:runId" element={<RunDetail />} />
          <Route path="history/:sessionId" element={<HistoryDetail />} />
          <Route path="quick" element={<QuickScreen />} />
          <Route path="plans" element={<PlansScreen />} />
          <Route path="plans/:planId" element={<PlanViewer />} />
          <Route path="plans/place/:placeId" element={<PlacePlans />} />
          <Route path="plans/place/:placeId/:planId" element={<PlanViewer />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="settings/import" element={<ImportReview />} />
          <Route path="settings/gyms" element={<GymsScreen />} />
          <Route path="settings/gyms/:gymId" element={<GymDetail />} />
          <Route path="settings/gyms/:gymId/equipment" element={<GymEquipment />} />
          {/* Always registered (device geometry only), reached by tapping the Today title 7 times. */}
          <Route path="dev/viewport" element={<ViewportDevScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <LandscapeGuard />
    </>
  );
}
