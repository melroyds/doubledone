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
/** The website's campaign label on both stores. One label for the whole site: which page or post sent the visitor is
 *  Cloudflare Web Analytics' referrer question, and a store hides a campaign until it has five first-time installs. */
export const WEB_CAMPAIGN = 'website';

export const APP_STORE_URL = `https://apps.apple.com/app/doubledone/id6790136615?pt=${APPLE_PROVIDER_TOKEN}&ct=${WEB_CAMPAIGN}&mt=8`;
export const PLAY_URL =
  'https://play.google.com/store/apps/details?id=app.doubledone&referrer=' +
  encodeURIComponent(`utm_source=doubledone.app&utm_medium=website&utm_campaign=${WEB_CAMPAIGN}`);
