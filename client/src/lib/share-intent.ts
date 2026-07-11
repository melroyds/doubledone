// Bridge an incoming Android/iOS share (text or a URL) into the inbound queue, so the
// Today screen seeds its capture box with it. Native only; web uses share-intent.web.ts
// (a no-op), which keeps expo-share-intent out of the web bundle entirely.
//
// DEBUG BREADCRUMBS (temporary, launch-week): the field report is "sharing opens the app
// onto Today and nothing happens", which static analysis cannot split further, the native
// module, the hook, and our bridge all read correct. debug:true makes the library log its
// mount / onChange / error path, and the [share-inbound] lines log ours, so one
// `adb logcat -s ReactNativeJS:V` while sharing shows exactly where the chain breaks.
// Remove the flag + logs once the share path is confirmed on device.
import { useShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';

import { cleanSharedText, setInbound } from './inbound';

/** Catch a share that launched (or reached) the app and queue it as a capture. The raw
 *  share is cleaned to one calm line (words kept, links dropped unless the share IS a
 *  link) by the same cleanSharedText the web share_target uses. */
export function useShareInbound(): void {
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent({ debug: true });
  useEffect(() => {
    if (error) console.log('[share-inbound] error:', error);
  }, [error]);
  useEffect(() => {
    console.log('[share-inbound] state:', hasShareIntent, JSON.stringify(shareIntent));
    if (!hasShareIntent) return;
    const text = cleanSharedText(shareIntent.text ?? shareIntent.webUrl);
    console.log('[share-inbound] queueing capture, text length:', text?.length ?? 0);
    if (text) setInbound({ kind: 'capture', text });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}
