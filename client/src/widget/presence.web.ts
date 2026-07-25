// No home-screen widgets on web, so there is never one placed and the offer never shows. Metro
// resolves this so the widget library stays out of the web bundle. See presence.ts for native.

/** No home-screen widgets on the web build, so the offer is gated off entirely. */
export const WIDGETS_SUPPORTED = false;

/** Always "already placed" on web, which suppresses the widget offer entirely. */
export function hasWidgetPlaced(): Promise<boolean> {
  return Promise.resolve(true);
}
