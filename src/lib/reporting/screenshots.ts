// The optional screenshot (SPEC 24): the user's own picture, re-encoded on the phone to a JPEG at
// most 900 px wide and about 300 KB, so it also loses any photo metadata.

export const MAX_WIDTH = 900;
export const MAX_BYTES = 300_000;
const QUALITIES = [0.7, 0.6, 0.5, 0.4];

/** Width and height scaled down (never up) to fit `maxWidth`. */
export function fitWidth(width: number, height: number, maxWidth = MAX_WIDTH): { width: number; height: number } {
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) };
}

/** The encode steps to try in order: each quality at full size, then smaller sizes. */
export function encodePlan(width: number, height: number): Array<{ width: number; height: number; quality: number }> {
  const plan: Array<{ width: number; height: number; quality: number }> = [];
  let size = fitWidth(width, height);
  for (let round = 0; round < 3; round++) {
    for (const quality of QUALITIES) plan.push({ ...size, quality });
    size = { width: Math.max(1, Math.round(size.width * 0.75)), height: Math.max(1, Math.round(size.height * 0.75)) };
  }
  return plan;
}

/** Base64 of a blob, without the data: prefix. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type Screenshot = { base64: string; previewUrl: string; bytes: number };

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fall back to an <img> below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));

/** Decodes the picked image and re-encodes it within the budget. Throws if it cannot be read. */
export async function prepareScreenshot(file: Blob): Promise<Screenshot> {
  const img = await decode(file);
  try {
    if (!img.width || !img.height) throw new Error('empty image');
    const canvas = document.createElement('canvas');
    let best: Blob | null = null;
    for (const step of encodePlan(img.width, img.height)) {
      canvas.width = step.width;
      canvas.height = step.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.drawImage(img.source, 0, 0, step.width, step.height);
      best = await toJpeg(canvas, step.quality);
      if (best && best.size <= MAX_BYTES) break;
    }
    if (!best || best.size > MAX_BYTES) throw new Error('too large');
    return { base64: await blobToBase64(best), previewUrl: URL.createObjectURL(best), bytes: best.size };
  } finally {
    img.close();
  }
}
