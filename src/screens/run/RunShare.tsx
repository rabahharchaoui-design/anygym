import { useEffect, useMemo, useRef, useState } from 'react';
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../../lib/intake/answers';
import { gpxDocument, gpxFileName, posterOf } from '../../lib/run';
import { shareOrDownload, type ShareOutcome } from '../../lib/shareFile';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { drawPoster, posterFile } from './posterCanvas';
import styles from './Share.module.css';

type Props = { run: Run; unit: DistanceUnit };

const said = (o: ShareOutcome): string => (o === 'downloaded' ? 'Saved to your phone' : o === 'needs-tap' ? 'Tap again to share' : '');

/**
 * Share card and GPX for one run (PLAN 4.6, SPEC 12.9, 12.12): two plain buttons. The card is a
 * line on a dark poster with the numbers and AnyGym; the first and last 200 m are off it unless
 * the switch is turned off. The GPX goes through the same share sheet (a download where there is
 * none) so Strava or Garmin can take it.
 */
export function RunShare({ run, unit }: Props) {
  const [open, setOpen] = useState(false);
  const [hideEnds, setHideEnds] = useState(true);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const poster = useMemo(() => posterOf(run, unit, hideEnds), [run, unit, hideEnds]);

  // The picture is made before the tap on Share, so the tap can open the share sheet at once.
  useEffect(() => {
    if (!open) return;
    if (preview.current) drawPoster(preview.current, poster);
    let alive = true;
    setFile(null);
    void posterFile(poster, `AnyGym-run-${run.id.slice(0, 8)}.png`).then((f) => alive && setFile(f));
    return () => {
      alive = false;
    };
  }, [open, poster, run.id]);

  const shareCard = async () => {
    if (file) setNote(said(await shareOrDownload(file)));
  };
  const exportGpx = async () => {
    const gpx = new File([gpxDocument(run)], gpxFileName(run), { type: 'application/gpx+xml' });
    setNote(said(await shareOrDownload(gpx)));
  };

  return (
    <>
      <div className={styles.row}>
        <Button variant="secondary" onClick={() => { setNote(''); setOpen(true); }} data-testid="run-share-card">
          Share card
        </Button>
        <Button variant="secondary" onClick={() => void exportGpx()} data-testid="run-export-gpx">
          Export GPX
        </Button>
      </div>
      {note && (
        <p className={styles.note} role="status" data-testid="run-share-note">
          {note}
        </p>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} label="Share card" scroll>
        <div className={styles.sheet} data-testid="run-share-sheet">
          <canvas ref={preview} className={styles.preview} data-testid="run-share-preview" data-hidden={poster.routeHidden || undefined} role="img" aria-label="Share card preview" />
          <Switch label="Hide start and end" hint="Leaves out the first and last 200 m, so your door stays private." checked={hideEnds} onChange={setHideEnds} />
          <Button onClick={() => void shareCard()} disabled={!file} data-testid="run-share-go">
            Share
          </Button>
        </div>
      </Sheet>
    </>
  );
}
