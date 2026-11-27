// The active-device counts' one door (lib/active). The root layout renders <ActiveCount /> once, for the life of the
// app: it counts the cold open and every return to the foreground, and the counter claims each name once for its day,
// week or install. A count that got no answer goes again on the next of those, and on the web also when the connection
// comes back.
//
// On the web, "/" is the landing page for a visitor who has not begun (app/index.tsx), with the app mounted behind it.
// Reading the front page is not opening the app, so nothing counts there: the count starts when Begin is pressed, or,
// for someone returning, when "/" hands them on to Today. A tab opened in the background waits until it is looked at
// (react-native-web's AppState follows the page's visibility, and a prerendered page reads as background), and a
// native launch in the background waits for the foreground the same way.
//
// A component rather than a hook in the root layout, because following the path re-renders whoever follows it: here
// that is a component that draws nothing, never the navigator and every screen under it.

import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { activeCounter, isAutomatedBrowser } from './active';
import { loadActiveMemory, loadOnboarded, saveActiveMemory } from './storage';
import { trackSent } from './telemetry';

type Locks = { request<T>(name: string, run: () => Promise<T>): Promise<T> };

/**
 * One claim at a time across this browser's windows. Two DoubleDone windows can both come to the front on a new day
 * (a screen unlocked with the installed app and a tab side by side), and without the lock each would read yesterday's
 * memory before the other wrote today's, and both would count. A phone runs one app at a time, and a browser without
 * Web Locks just runs the claim.
 */
function acrossWindows<T>(run: () => Promise<T>): Promise<T> {
  const locks = Platform.OS === 'web' && typeof navigator !== 'undefined' ? (navigator as { locks?: Locks }).locks : undefined;
  if (!locks) return run();
  return locks.request('doubledone.active', run).catch(() => run());
}

/** The app-wide counter: one per run of the app, so its guards cover every caller. */
export const countActive = activeCounter({
  load: loadActiveMemory,
  save: saveActiveMemory,
  // loadOnboarded answers true when storage fails, so a hiccup reads as an existing device and never as a new one.
  isFresh: async () => !(await loadOnboarded()),
  send: trackSent,
  exclusive: acrossWindows,
});

/** Count this device's opens toward active devices. */
export function useActiveCount(): void {
  const pathname = usePathname();
  const counts = Platform.OS !== 'web' || pathname !== '/';
  useEffect(() => {
    if (!counts) return;
    if (Platform.OS === 'web' && isAutomatedBrowser(typeof navigator === 'undefined' ? null : navigator)) return;
    const tryNow = () => {
      if (AppState.currentState !== 'background') void countActive();
    };
    tryNow();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void countActive();
    });
    // The web also hears when the connection comes back, for a count that got no answer while it was gone.
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) window.addEventListener('online', tryNow);
    return () => {
      // react-native-web hands back nothing where the page cannot report its visibility.
      sub?.remove();
      if (web) window.removeEventListener('online', tryNow);
    };
  }, [counts]);
}

/** The root layout's door, drawn once: a component that renders nothing. */
export function ActiveCount(): null {
  useActiveCount();
  return null;
}
