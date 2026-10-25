// Hands a file to the user (SPEC 9.1): the share sheet when the phone can share files, else a
// download. Nothing is ever sent anywhere by the app itself (SPEC 0.5).

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

type ShareNav = Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };

export function canShareFile(file: File, nav: ShareNav = navigator): boolean {
  try {
    return typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Saves through a Blob link with a download name. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Share sheet first, download as the fallback. 'cancelled': the user closed the share sheet.
 * 'needs-tap': Safari wants a fresh tap before it opens the share sheet (the file took a moment to
 * build), so the caller offers a button that calls this again.
 */
export async function shareOrDownload(file: File, nav: ShareNav = navigator): Promise<ShareOutcome> {
  if (!canShareFile(file, nav)) {
    downloadFile(file);
    return 'downloaded';
  }
  try {
    await nav.share!({ files: [file], title: file.name });
    return 'shared';
  } catch (e) {
    const name = e instanceof Error || (typeof e === 'object' && e !== null) ? (e as { name?: string }).name : undefined;
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'needs-tap';
    downloadFile(file);
    return 'downloaded';
  }
}
