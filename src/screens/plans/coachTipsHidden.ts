// "Hide tips for this plan" (SPEC 22): remembered on this phone, per curated plan.
const KEY = 'anygym.coachTipsHidden';

function read(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const tipsHidden = (planId: string): boolean => read().includes(planId);

export function hideTips(planId: string, hide: boolean): void {
  const next = new Set(read());
  if (hide) next.add(planId);
  else next.delete(planId);
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Private mode or full storage: hidden for this visit only.
  }
}
