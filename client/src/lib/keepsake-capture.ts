// Capture the offscreen keepsake PAGE (image + caption band) as a jpeg tmpfile for
// sharing (native). Platform-split like share.ts: the web variant returns null and web
// composites on a canvas instead, so react-native-view-shot never enters the web bundle.
import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Snapshot the referenced view to a jpeg tmpfile (file:// URI), or null when capture
 *  is not possible (no view yet, or the snapshot fails) so the caller can fall back to
 *  sharing the bare image. Best effort by design: a share must never throw. */
export async function captureKeepsakeCard(ref: RefObject<View | null>): Promise<string | null> {
  try {
    if (!ref.current) return null;
    return await captureRef(ref.current, { result: 'tmpfile', format: 'jpg', quality: 0.92 });
  } catch {
    return null;
  }
}
