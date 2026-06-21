// Web has no share-target intent, so this is a no-op. Native uses share-intent.ts; Metro
// resolves the right file, keeping expo-share-intent out of the web bundle. The signature
// mirrors share-intent.ts so the call site stays platform-agnostic.

/** No-op on web. */
export function useShareInbound(): void {}
