import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../../lib/intake/answers';
import { gpxDocument, gpxFileName, posterLabel, posterOf } from '../../lib/run';
import { shareOrDownload, type ShareOutcome } from '../../lib/shareFile';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { drawPoster, posterFile } from './posterCanvas';
import styles from './Share.module.css';

type Props = { run: Run; unit: DistanceUnit };

const said = (o: ShareOutcome): string => (o === 'downloaded' ? 'Saved to your phone' : o === 'needs-tap' ? 'Tap again to share' : '');

/** What a screen places: the Share card button, the Export GPX button, the outcome note and the sheet. */
export type RunShareParts = { shareButton: ReactNode; gpxButton: ReactNode; note: ReactNode; sheet: ReactNode };

/**
 * Share card and GPX for one run (PLAN 4.6, SPEC 12.9, 12.12). The card is a line on a dark poster
 * with the numbers and AnyGym; the first and last 200 m are off it unless the switch is turned off.
 * The GPX goes through the same share sheet (a download where there is none) so Strava or Garmin
 * can take it. Returns the pieces, so the finish screen can put Share card beside Done (PLAN M3)
 * while the run's detail keeps the two buttons together (`RunShare`).
 */
export function useRunShare({ run, unit }: Props, shareVariant: 'secondary' | 'primary' = 'secondary'): RunShareParts {
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

  return {
    shareButton: (
      <Button variant={shareVariant} size="md" onClick={() => { setNote(''); setOpen(true); }} data-testid="run-share-card">
        Share card
      </Button>
    ),
    gpxButton: (
      <Button variant="secondary" size="md" onClick={() => void exportGpx()} data-testid="run-export-gpx">
        Export GPX
      </Button>
    ),
    note: note ? (
      <p className={styles.note} role="status" data-testid="run-share-note">
        {note}
      </p>
    ) : null,
    sheet: (
      <Sheet open={open} onClose={() => setOpen(false)} label="Share card" scroll>
        <div className={styles.sheet} data-testid="run-share-sheet">
          <canvas ref={preview} className={styles.preview} data-testid="run-share-preview" data-hidden={poster.routeHidden || undefined} role="img" aria-label={posterLabel(poster)} />
          <Switch label="Hide start and end" hint="Leaves out the first and last 200 m, so your door stays private." checked={hideEnds} onChange={setHideEnds} />
          <Button onClick={() => void shareCard()} disabled={!file} data-testid="run-share-go">
            Share
          </Button>
        </div>
      </Sheet>
    ),
  };
}

/** Share card and Export GPX side by side, the note under them, and the card's sheet (the run's detail). */
export function RunShare(props: Props) {
  const parts = useRunShare(props);
  return (
    <>
      <div className={styles.row}>
        {parts.shareButton}
        {parts.gpxButton}
      </div>
      {parts.note}
      {parts.sheet}
    </>
  );
}
