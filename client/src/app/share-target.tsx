import { Redirect, useLocalSearchParams } from 'expo-router';

import { setInbound, shareTextFromParams } from '@/lib/inbound';

// The web share_target landing route. The manifest stopped offering DoubleDone as a share target on
// 2026-11-01 (a GET put the shared text in the URL, so it reached our host's logs), and this route stays
// only for an installed web app still holding the old manifest: the browser opens
// /share-target?title=&text=&url=. We stash the shared text on the same inbound queue the Android
// share intent uses and bounce straight to Today, which seeds the capture box with it,
// focused and ready to add. Nothing is auto-added: a share is an offer, the user confirms.
// The redirect also means this route never lingers in history (back returns to Today).
export default function ShareTarget() {
  const params = useLocalSearchParams<{ title?: string; text?: string; url?: string }>();
  const text = shareTextFromParams(params);
  if (text) setInbound({ kind: 'capture', text });
  return <Redirect href="/" />;
}
