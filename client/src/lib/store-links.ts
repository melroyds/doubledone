// The website's links to the two stores. Pure (no React Native import) so the static landing, built in node, and the
// app's own welcome page share one copy.
//
// Each link carries a campaign label, so each store's own analytics can say an install came from this website. The
// label names the CHANNEL, never the person: no id, no cookie, nothing set or read back by us. Apple: `pt` is the
// account's provider token (public, it is in every campaign link Apple generates), `ct` the campaign, `mt=8` the
// media type for apps. Google Play: the `referrer` holds URL-encoded utm tags, which Play Console's acquisition
// report reads for visits that open the Play Store app.
//
// The update nudge (STORE_URLS in lib/updates.ts) stays UNTAGGED on purpose: it sends people who already have the
// app, and counting them would read as new acquisition.

/** Apple's provider token for this developer account, from App Store Connect, Analytics, Acquisition, Campaigns. */
export const APPLE_PROVIDER_TOKEN = '128916719';
/** The website's campaign label on both stores, for every visitor who did not come by a channel link below. A store
 *  hides a campaign until it has five first-time installs. */
export const WEB_CAMPAIGN = 'website';

/** The channels a link to the site may name, as doubledone.app/?ref=instagram, so the store badges carry that channel
 *  instead of `website` (2026-11-01, for the Instagram and Facebook kit, whose week-12 checkpoint asks which installs
 *  each channel brought). A FIXED list: any other `ref`, or none, stays `website`, so a link can never write free text
 *  into a store's analytics. Nothing is stored or read back by us; the word only rides the badge's link. The landing
 *  repeats this list as a literal in landingCampaign (lib/landing-page), and a test holds the two equal. */
export const CHANNELS = ['instagram', 'facebook'] as const;
export type Campaign = typeof WEB_CAMPAIGN | (typeof CHANNELS)[number];

/** The campaign a page's query string names: one of CHANNELS, or `website`. */
export function campaignFrom(search: string): Campaign {
  let ref = '';
  try {
    ref = (new URLSearchParams(search).get('ref') ?? '').trim().toLowerCase();
  } catch {
    return WEB_CAMPAIGN;
  }
  return (CHANNELS as readonly string[]).includes(ref) ? (ref as Campaign) : WEB_CAMPAIGN;
}

export function appStoreUrl(campaign: Campaign = WEB_CAMPAIGN): string {
  return `https://apps.apple.com/app/doubledone/id6790136615?pt=${APPLE_PROVIDER_TOKEN}&ct=${campaign}&mt=8`;
}

export function playUrl(campaign: Campaign = WEB_CAMPAIGN): string {
  return (
    'https://play.google.com/store/apps/details?id=app.doubledone&referrer=' +
    encodeURIComponent(`utm_source=doubledone.app&utm_medium=website&utm_campaign=${campaign}`)
  );
}

export const APP_STORE_URL = appStoreUrl();
export const PLAY_URL = playUrl();
