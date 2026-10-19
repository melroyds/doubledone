// The store's own rating card, the native half. WHEN it is asked (rarely, at the end of a good day)
// lives in lib/review.ts; this file only reaches the store. The web resolves store-review.web.ts,
// which never imports the package, so the web never asks and never writes a review key (REV-04).
//
// Two traps, found by reading the package source rather than its docs (the store 1.9 review scout):
//
// 1. AN IMPORT-TIME CRASH. expo-store-review's native entry runs requireNativeModule('ExpoStoreReview')
//    at import, which THROWS on any binary built without the module (an old dev client, or a future
//    slip). Today imports this file, so a top-level import would crash Today at launch, the same shape
//    as the Hermes Intl gotcha. The package is therefore imported lazily, inside try/catch, at the
//    moment of asking, and any failure reads as "not available".
//
// 2. THE STORE-URL FALLBACK. requestReview() opens the store page with Linking when the native function
//    is missing and app.json carries ios.appStoreUrl or android.playStoreUrl, and hasAction() is true
//    on those keys alone. Never add either key, and never call hasAction(): the one gate is
//    isAvailableAsync() (false in TestFlight, false without the Play Store).
//
// No identifier here contains the package's own name in camel case: the web export is checked for
// that word (plan slice 1, "Verify"), and this file's names never reach the web bundle anyway.

export const REVIEW_SUPPORTED: boolean = true;

type ReviewModule = typeof import('expo-store-review');

async function loadModule(): Promise<ReviewModule | null> {
  try {
    return await import('expo-store-review');
  } catch {
    return null;
  }
}

/** Whether the store can show its card on this install. False on any throw. */
export async function reviewCardAvailable(): Promise<boolean> {
  const mod = await loadModule();
  if (!mod) return false;
  try {
    return (await mod.isAvailableAsync()) === true;
  } catch {
    return false;
  }
}

/**
 * Hand the store its one request. True when the request was handed over, which is all anybody can
 * know: neither store reports whether a card appeared, let alone what was chosen. False on any throw
 * (iOS throws when no window scene is in the foreground).
 */
export async function requestReviewCard(): Promise<boolean> {
  const mod = await loadModule();
  if (!mod) return false;
  try {
    await mod.requestReview();
    return true;
  } catch {
    return false;
  }
}
