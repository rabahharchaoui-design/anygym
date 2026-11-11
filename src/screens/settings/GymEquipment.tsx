import { useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Skeleton } from '../../ui/Skeleton';
import { Toast, type ToastMessage } from '../../ui/Toast';
import { MakeActive } from '../../components/gym/MakeActive';
import { useLive } from '../../hooks/useLive';
import { db } from '../../db/schema';
import { setGymEquipment } from '../../db/gymList';
import { EQUIPMENT_IDS, type DumbbellRange, type EquipmentId } from '../../db/types';
import { EquipmentStep } from '../intake/Steps';
import styles from '../Settings.module.css';
import gymStyles from './Gyms.module.css';

/**
 * A gym's equipment (PLAN 3.9, SPEC 3): the intake's picture picker, grouped, each group with its
 * All. Every tap saves. With dumbbells on, their range is asked right under them; until it is given
 * the gym counts as having no dumbbells it can load (no guessed range). PLAN 3.5j: the heaviest
 * dumbbell may be typed in kg or lb, and Make active is right under the equipment.
 */
export function GymEquipment() {
  const { gymId = '' } = useParams();
  const gym = useLive(() => db.gyms.get(gymId), [gymId]);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), toast.action ? 5000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);
  // A range typed here comes back if dumbbells are turned off and on again on this screen.
  const lastRange = useRef<DumbbellRange | null>(null);
  const g = gym.data;
  if (gym.ready && !gym.error && !g) return <Navigate to="/settings/gyms" replace />;
  if (g?.dumbbellRange) lastRange.current = g.dumbbellRange;

  const write = (equipment: readonly EquipmentId[], range?: DumbbellRange | null) => {
    setError(false);
    setGymEquipment(gymId, equipment, range).catch(() => setError(true));
  };

  return (
    <>
      <TopBar title="Equipment" leading={<BackButton to={`/settings/gyms/${gymId}`} label="Back to the gym" />}>
        {g && <p className={gymStyles.meta}>{g.name}</p>}
      </TopBar>
      {!g ? (
        <Skeleton height={320} radius={20} />
      ) : (
        <div className={gymStyles.picker} data-testid="gym-equipment">
          <EquipmentStep
            value={g.equipment}
            onChange={(next) => write(next, next.includes('dumbbells') && !g.dumbbellRange ? lastRange.current : undefined)}
            askRange={g.equipment.includes('dumbbells')}
            range={g.dumbbellRange ?? undefined}
            unit={g.unit}
            onRange={(r) => r && write(g.equipment, r)}
            choices={EQUIPMENT_IDS}
          />
          <p className={styles.error} role="status">
            {error ? 'Could not save that. Try again.' : ''}
          </p>
          <MakeActive gym={g} onToast={setToast} />
        </div>
      )}
      <Toast toast={toast} />
    </>
  );
}
