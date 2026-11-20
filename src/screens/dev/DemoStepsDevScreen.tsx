import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DemoImages, Frames } from '../../lib/exerciseInfo';
import { FormDemo } from '../../components/exercise/FormDemo';
import { DemoViewer } from '../../components/exercise/DemoViewer';
import styles from './MonolithDevScreen.module.css';

const FRAME = /^ex\/[A-Za-z0-9_-]+\/[0-3]$/;

/** The frames the test asks for (`f=ex/A/0,ex/A/1,...`, 2 to 4 of them), or null. */
function framesOf(param: string | null): DemoImages | null {
  const list = (param ?? '').split(',').filter((p) => FRAME.test(p));
  if (list.length < 2 || list.length > 4) return null;
  return { webp: list.map((p) => `${p}.webp`) as unknown as Frames, jpg: list.map((p) => `${p}.jpg`) as unknown as Frames };
}

/**
 * Dev preview (#/dev/demo-steps?dev&f=..., PLAN D1): the sheet's form demo, its full screen viewer
 * and a list tile for any 2 to 4 existing frame files, so the Playwright spec can check a 4 frame
 * sequence before any real one ships. The frames come from the test's URL only: nothing here is a
 * real exercise's sequence. Only in the dev server and VITE_DEV_PREVIEW=1 builds (App.tsx).
 */
export function DemoStepsDevScreen() {
  const [params] = useSearchParams();
  const [full, setFull] = useState(false);
  const demo = framesOf(params.get('f'));
  const name = params.get('name') ?? 'Test sequence';
  if (!demo) return <main className={styles.screen}>No frames</main>;
  return (
    <main className={styles.screen}>
      <section className={styles.block} aria-label="Sheet demo">
        <FormDemo demo={demo} name={name} onOpen={() => setFull(true)} fit />
      </section>
      <section className={styles.block} aria-label="Tile" data-testid="dev-tile">
        <FormDemo demo={demo} name={name} compact />
      </section>
      <DemoViewer open={full} onClose={() => setFull(false)} name={name} demo={demo} />
    </main>
  );
}
