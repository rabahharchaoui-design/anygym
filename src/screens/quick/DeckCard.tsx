import type { QuickItem } from '../../lib/quick';
import { setsText } from '../../lib/plans';
import { demoFor } from '../../data/exerciseInfo';
import { ExerciseFace } from '../../components/deck/ExerciseFace';

// One Quick deck card's face (PLAN 3.5a; 3.5f: the shared calm face): the moving demo, then the name,
// sets x reps and one curated why line. The shared deck (components/deck) owns the drag and the flight.

const amount = (it: QuickItem) => setsText({ sets: it.sets, ...(it.reps !== undefined ? { reps: it.reps } : {}), ...(it.seconds !== undefined ? { seconds: it.seconds } : {}) });

export const itemLine = (it: QuickItem): string => `${amount(it)}${it.reps !== undefined ? ' reps' : ''}${it.eachSide ? ' each side' : ''}`;

export function Card({ item, position, of, under, onInfo }: { item: QuickItem; position: number; of: number; under?: boolean; onInfo?: () => void }) {
  return <ExerciseFace demo={demoFor(item.id)} name={item.name} sets={itemLine(item)} why={item.why} position={`${position} of ${of}`} {...(item.fact ? { fact: item.fact } : {})} {...(under ? { under } : {})} {...(onInfo ? { onInfo } : {})} />;
}
