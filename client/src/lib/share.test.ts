import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shareScrapbook } from './share';

// The native share seam is thin, but it broke in the field in a way pure review missed
// (an R2-served https keepsake hit the base64 split and reported "Sharing isn't available
// here"), so both image shapes are pinned here with the expo modules mocked out.
// vi.mock is hoisted above every import, so declaring the mocks below the import is safe.
const mocks = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  downloadAsync: vi.fn(),
}));

vi.mock('expo-sharing', () => ({
  isAvailableAsync: mocks.isAvailableAsync,
  shareAsync: mocks.shareAsync,
}));

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: mocks.writeAsStringAsync,
  downloadAsync: mocks.downloadAsync,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAvailableAsync.mockResolvedValue(true);
  mocks.shareAsync.mockResolvedValue(undefined);
  mocks.writeAsStringAsync.mockResolvedValue(undefined);
  mocks.downloadAsync.mockResolvedValue({ status: 200 });
});

describe('shareScrapbook (native): both keepsake image shapes must share', () => {
  it('an R2-served https URL downloads to the cache, then shares (the field bug)', async () => {
    const out = await shareScrapbook('https://api.doubledone.app/scrapbook-img/abc123');
    expect(out).toBe('shared');
    expect(mocks.downloadAsync).toHaveBeenCalledWith('https://api.doubledone.app/scrapbook-img/abc123', 'file:///cache/doubledone-week.jpg');
    expect(mocks.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mocks.shareAsync).toHaveBeenCalledWith('file:///cache/doubledone-week.jpg', { mimeType: 'image/jpeg' });
  });

  it('a captured keepsake page (file:// tmpfile) shares as-is: no download, no rewrite', async () => {
    const out = await shareScrapbook('file:///cache/keepsake-page.jpg', 'a quiet week', 'DoubleDone · Week of 6 July');
    expect(out).toBe('shared');
    expect(mocks.downloadAsync).not.toHaveBeenCalled();
    expect(mocks.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mocks.shareAsync).toHaveBeenCalledWith('file:///cache/keepsake-page.jpg', { mimeType: 'image/jpeg' });
  });

  it('a local data: URL writes its base64 to the cache, then shares', async () => {
    const out = await shareScrapbook('data:image/jpeg;base64,AAAA');
    expect(out).toBe('shared');
    expect(mocks.writeAsStringAsync).toHaveBeenCalledWith('file:///cache/doubledone-week.jpg', 'AAAA', { encoding: 'base64' });
    expect(mocks.downloadAsync).not.toHaveBeenCalled();
  });

  it('a failed download is unavailable, and the sheet never opens', async () => {
    mocks.downloadAsync.mockResolvedValue({ status: 404 });
    expect(await shareScrapbook('https://api.doubledone.app/scrapbook-img/gone')).toBe('unavailable');
    expect(mocks.shareAsync).not.toHaveBeenCalled();
  });

  it('a junk image value (no base64 payload) is unavailable', async () => {
    expect(await shareScrapbook('not-an-image')).toBe('unavailable');
    expect(mocks.shareAsync).not.toHaveBeenCalled();
  });

  it('no share capability is unavailable', async () => {
    mocks.isAvailableAsync.mockResolvedValue(false);
    expect(await shareScrapbook('data:image/jpeg;base64,AAAA')).toBe('unavailable');
  });

  it('a throwing share sheet reports unavailable rather than crashing', async () => {
    mocks.shareAsync.mockRejectedValue(new Error('boom'));
    expect(await shareScrapbook('data:image/jpeg;base64,AAAA')).toBe('unavailable');
  });
});
