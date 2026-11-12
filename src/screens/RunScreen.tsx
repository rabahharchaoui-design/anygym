import { useState } from 'react';
import { TopBar } from '../ui/TopBar';
import { EmptyState } from '../ui/EmptyState';
import { Toast, type ToastMessage } from '../ui/Toast';
import { GymPill } from '../components/GymPill';
import { useToastTimeout } from '../ui/useToastTimeout';

export function RunScreen() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useToastTimeout(toast, setToast);
  return (
    <>
      {/* SPEC 19: the gym pill is on the Run tab too. */}
      <TopBar title="Run" trailing={<GymPill onToast={setToast} />} />
      <EmptyState art="run" title="No runs yet" next="Your runs will show up here after your first one." />
      <Toast toast={toast} bottom="calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom) - 4px)" />
    </>
  );
}
