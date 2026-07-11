// Sharing the scrapbook keepsake (native): write the base64 jpeg to the cache and hand it
// to the system share sheet. The keepsake is a locally-held data: URL, so nothing is
// uploaded and no public link exists; what leaves the device is exactly the image the
// user chose to send, to the app they chose to send it to. The share payload is the
// IMAGE ONLY, deliberately no caption text (the caption derives from task titles, and
// silently attaching task-derived words to an outbound share would be a surprise).
// Platform-split like reminders: share.web.ts is the web variant.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// 'shared' = the sheet opened (or the user changed their mind, equally fine);
// 'saved' = web-only, the image downloaded instead; 'unavailable' = no path worked.
export type ShareOutcome = 'shared' | 'saved' | 'unavailable';

export async function shareScrapbook(imageDataUrl: string): Promise<ShareOutcome> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const b64 = imageDataUrl.split(',')[1] ?? '';
    if (!b64) return 'unavailable';
    // The legacy file-system API writes base64 directly, no atob dependency (Hermes's
    // Intl-style gaps taught us not to lean on newer globals without feature detection).
    const uri = `${FileSystem.cacheDirectory}doubledone-week.jpg`;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    return 'shared';
  } catch {
    return 'unavailable';
  }
}
