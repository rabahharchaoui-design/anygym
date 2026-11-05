import { useEffect, useState } from 'react';
import { TopBar } from '../ui/TopBar';
import { EmptyState } from '../ui/EmptyState';
import { Toast, type ToastMessage } from '../ui/Toast';
import { GymPill } from '../components/GymPill';

export function RunScreen() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  return (
    <>
      {/* SPEC 19: the gym pill is on the Run tab too. */}
      <TopBar title="Run" trailing={<GymPill onToast={setToast} />} />
      <EmptyState art="run" title="No runs yet" next="Your runs will show up here after your first one." />
      <Toast toast={toast} bottom="calc(var(--tabbar-capsule) + var(--tabbar-gap) + var(--resume-space, 0px) - var(--safe-bottom) - 4px)" />
    </>
  );
}
