// Sharing the scrapbook keepsake (native): get the jpeg into the cache and hand it to the
// system share sheet. A stored keepsake image is EITHER a local data: URL (base64 jpeg)
// or an R2-served https URL (the persisted shape) — both must share, which is the bug
// this file once had: the base64 split silently returned 'unavailable' for every R2
// image ("Sharing isn't available here", Melroy on device, 2026-07-12). What leaves the
// device is exactly the image the user chose to send, to the app they chose to send it
// to. The share payload is the IMAGE ONLY, deliberately no caption text (the caption
// derives from task titles, and silently attaching task-derived words to an outbound
// share would be a surprise). Platform-split like reminders: share.web.ts is the web
// variant (whose fetch() accepts both shapes natively, which is why web never broke).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// 'shared' = the sheet opened (or the user changed their mind, equally fine);
// 'saved' = web-only, the image downloaded instead; 'unavailable' = no path worked.
export type ShareOutcome = 'shared' | 'saved' | 'unavailable';

export async function shareScrapbook(image: string, _caption?: string, _weekMeta?: string): Promise<ShareOutcome> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    // A captured keepsake PAGE (the view-shot tmpfile, caption already in its pixels)
    // shares as-is. The caption/meta params exist for the web variant's canvas composite
    // and are unused here on purpose: on native the words are baked in before this call.
    if (/^file:/i.test(image)) {
      await Sharing.shareAsync(image, { mimeType: 'image/jpeg' });
      return 'shared';
    }
    const uri = `${FileSystem.cacheDirectory}doubledone-week.jpg`;
    if (/^https?:/i.test(image)) {
      const dl = await FileSystem.downloadAsync(image, uri);
      if (dl.status !== 200) return 'unavailable';
    } else {
      const b64 = image.split(',')[1] ?? '';
      if (!b64) return 'unavailable';
      // The legacy file-system API writes base64 directly, no atob dependency (Hermes's
      // Intl-style gaps taught us not to lean on newer globals without feature detection).
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    }
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    return 'shared';
  } catch {
    return 'unavailable';
  }
}
