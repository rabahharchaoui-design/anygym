import { describe, expect, it, vi } from 'vitest';
import { shareOrDownload } from '../shareFile';

const file = () => new File(['{}'], 'anygym-backup-2026-10-24.json', { type: 'application/json' });
const err = (name: string) => Object.assign(new Error(name), { name });

describe('shareOrDownload', () => {
  it('shares when the phone can share files', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { canShare: () => true, share } as unknown as Navigator;
    expect(await shareOrDownload(file(), nav)).toBe('shared');
    expect(share.mock.calls[0]![0].files[0].name).toBe('anygym-backup-2026-10-24.json');
  });

  it('cancelled share sheet, and a share that needs a fresh tap', async () => {
    expect(await shareOrDownload(file(), { canShare: () => true, share: () => Promise.reject(err('AbortError')) } as unknown as Navigator)).toBe('cancelled');
    expect(await shareOrDownload(file(), { canShare: () => true, share: () => Promise.reject(err('NotAllowedError')) } as unknown as Navigator)).toBe('needs-tap');
  });

  it('downloads when sharing is unavailable or fails', async () => {
    // No DOM in these tests: a stand in anchor records the download.
    const click = vi.fn();
    const anchors: Array<Record<string, unknown>> = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const a = { style: {}, click, remove: vi.fn() };
        anchors.push(a);
        return a;
      },
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    expect(await shareOrDownload(file(), {} as Navigator)).toBe('downloaded');
    expect(await shareOrDownload(file(), { canShare: () => false, share: vi.fn() } as unknown as Navigator)).toBe('downloaded');
    expect(await shareOrDownload(file(), { canShare: () => true, share: () => Promise.reject(err('DataError')) } as unknown as Navigator)).toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(3);
    expect(anchors[0]).toMatchObject({ href: 'blob:x', download: 'anygym-backup-2026-10-24.json' });
    vi.unstubAllGlobals();
  });
});
