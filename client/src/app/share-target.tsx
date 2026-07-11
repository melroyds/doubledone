import { Redirect, useLocalSearchParams } from 'expo-router';

import { setInbound, shareTextFromParams } from '@/lib/inbound';

// The web share_target landing route. When DoubleDone is installed as a PWA and picked on
// the system share sheet, the browser opens /share-target?title=&text=&url= (a GET, per
// public/manifest.json). We stash the shared text on the same inbound queue the Android
// share intent uses and bounce straight to Today, which seeds the capture box with it,
// focused and ready to add. Nothing is auto-added: a share is an offer, the user confirms.
// The redirect also means this route never lingers in history (back returns to Today).
export default function ShareTarget() {
  const params = useLocalSearchParams<{ title?: string; text?: string; url?: string }>();
  const text = shareTextFromParams(params);
  if (text) setInbound({ kind: 'capture', text });
  return <Redirect href="/" />;
}
