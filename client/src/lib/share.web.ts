// Sharing the scrapbook keepsake (web): the Web Share API with the image as a file where
// the browser supports it (Chrome/Edge/Android, Safari), otherwise a plain download so
// the user still walks away with the jpeg. Image only, no caption text, same reasoning
// as the native variant. A share-sheet cancel is the user changing their mind, not an
// error, so it reports 'shared' and the screen stays quiet.
export type ShareOutcome = 'shared' | 'saved' | 'unavailable';

export async function shareScrapbook(imageDataUrl: string): Promise<ShareOutcome> {
  try {
    const blob = await (await fetch(imageDataUrl)).blob();
    const file = new File([blob], 'doubledone-week.jpg', { type: blob.type || 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'shared';
        // A real share failure falls through to the download path below.
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'doubledone-week.jpg';
    a.click();
    URL.revokeObjectURL(a.href);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}
