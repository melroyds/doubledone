// Bridge an incoming Android/iOS share (text or a URL) into the inbound queue, so the
// Today screen seeds its capture box with it. Native only; web uses share-intent.web.ts
// (a no-op), which keeps expo-share-intent out of the web bundle entirely.
// (The launch-week debug breadcrumbs lived here until the share path was confirmed on
// device, 2026-07-12: cold, warm, and bare-link shares all landing clean.)
import { useShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';

import { cleanSharedText, setInbound } from './inbound';

/** Catch a share that launched (or reached) the app and queue it as a capture. The raw
 *  share is cleaned to one calm line (words kept, links dropped unless the share IS a
 *  link) by the same cleanSharedText the web share_target uses. */
export function useShareInbound(): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    const text = cleanSharedText(shareIntent.text ?? shareIntent.webUrl);
    if (text) setInbound({ kind: 'capture', text });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}
