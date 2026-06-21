// Bridge an incoming Android/iOS share (text or a URL) into the inbound queue, so the
// Today screen seeds its capture box with it. Native only; web uses share-intent.web.ts
// (a no-op), which keeps expo-share-intent out of the web bundle entirely.
import { useShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';

import { setInbound } from './inbound';

/** Catch a share that launched (or reached) the app and queue it as a capture. */
export function useShareInbound(): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    const text = shareIntent.text ?? shareIntent.webUrl;
    if (text) setInbound({ kind: 'capture', text });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}
