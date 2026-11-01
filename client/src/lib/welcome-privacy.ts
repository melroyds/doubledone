// Which privacy lines the welcome shows, chosen here so the choice is tested (bug sweep 2026-11-01, #13). Pure: no
// React, no auth import, so node can run it.

/** The two privacy lines on the welcome: under the capture box, and the last screen's fine print. */
export type WelcomePrivacyKeys = { capture: string; handoff: string };

/**
 * The signed-out lines say what is only true signed out: "keeps everything on this device", and an invite to
 * sign in and sync. A replay from Settings while signed in read them too, which was false twice over, since the
 * tasks sync to the account and there is nothing to sign in to. So anyone not KNOWN to be signed out gets the
 * SignedIn lines, which make no device, sync or account claim and so stay true either way. That covers the
 * moment before the session is known as well, which is why there are four new keys rather than eight.
 *
 * `signedOut` is lib/auth's `known && !session`. A build with no sync configured knows at once that nobody is
 * signed in, so it keeps the signed-out lines, which is right: everything there does stay on the device.
 */
export function welcomePrivacyKeys(aiEnabled: boolean, signedOut: boolean): WelcomePrivacyKeys {
  if (aiEnabled) {
    return signedOut
      ? { capture: 'welcome.capturePrivacyAi', handoff: 'welcome.handoffFineAi' }
      : { capture: 'welcome.capturePrivacyAiSignedIn', handoff: 'welcome.handoffFineAiSignedIn' };
  }
  return signedOut
    ? { capture: 'welcome.capturePrivacyNoAi', handoff: 'welcome.handoffFineNoAi' }
    : { capture: 'welcome.capturePrivacyNoAiSignedIn', handoff: 'welcome.handoffFineNoAiSignedIn' };
}
