// expo-router's native-intent bridge. When a share launches the app, expo-share-intent
// can deliver it as a deep link of the form `doubledone://dataUrl=...`; without this
// redirect expo-router would try to treat that as a route path. Send it to Today (the
// share itself travels through the native module + the inbound queue, not the URL).
// Everything else passes through untouched, so real deep links keep working.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (path.includes('dataUrl=')) return '/';
    return path;
  } catch {
    return '/';
  }
}
