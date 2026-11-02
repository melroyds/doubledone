// Whether this browser lets DoubleDone keep anything (the 1 Nov bug sweep, #31). On the web the app saves through
// AsyncStorage, whose web build is window.localStorage, and with site data blocked every read and write throws.
// lib/storage.ts catches each one, so Today opened empty, took tasks, kept none after a reload, and said nothing.
// Sign-in already said it (signIn.storageBlocked). Today now says it too, with today.storageBlocked, decided here.
//
// Web only. On a phone AsyncStorage is not localStorage, so the call site checks Platform.OS === 'web' and the probe
// never runs there. No react-native import on purpose, like lib/storefront.ts, so vitest runs this in node. And no
// `instanceof DOMException`: Hermes has none, and any throw means the same thing here.
//
// Not through AsyncStorage, for two reasons. It is async, and the line is decided at first paint, so it never arrives
// late or pushes the day down. And on the web it is the same localStorage anyway, so the probe tests the very store
// the tasks use. A modern private window saves for the session, so it passes and never sees the line, which is true:
// its tasks last until the window closes.

/** The three methods of window.localStorage the probe uses, so a test can hand it a stand-in. */
export type ProbeStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The probe's own key. It never holds anything of the person's, and it is removed straight after the read. */
export const PROBE_KEY = 'doubledone.storageprobe.v1';

/**
 * Whether a write can be read straight back. Never throws. Just reading window.localStorage throws a SecurityError in
 * Chrome, Firefox and Safari when site data is blocked, so even the getter runs inside the one try. No storage at all
 * (a webview with DOM storage off) is false. A setItem that throws (a full store, Safari's private mode before 11) is
 * false. A store that drops the write is false. The tidy-up has its own try: a failed remove after a good read still
 * means saving works.
 */
export function probeStorage(get: () => ProbeStore | null | undefined): boolean {
  try {
    const store = get();
    if (!store) return false;
    const value = `${Date.now()}.${Math.random()}`;
    store.setItem(PROBE_KEY, value);
    const kept = store.getItem(PROBE_KEY) === value;
    try {
      store.removeItem(PROBE_KEY);
    } catch {
      // The write was read back, so saving works. A leftover probe key holds nothing.
    }
    return kept;
  } catch {
    return false;
  }
}

/** A probe that runs the first time it is asked, and gives that answer for the rest of the page load. */
export function blockedOnce(get: () => ProbeStore | null | undefined): () => boolean {
  let blocked: boolean | undefined;
  return () => {
    if (blocked === undefined) blocked = !probeStorage(get);
    return blocked;
  };
}

const blockedHere = blockedOnce(() => window.localStorage);

/** True when this browser keeps nothing. Probed once per page load. With no window at all there is no browser to ask. */
export function webStorageBlocked(): boolean {
  return typeof window !== 'undefined' && blockedHere();
}

/**
 * The site the line names, as `{site}`: the page's own host without a leading "www.", so it reads doubledone.app in
 * production and stays true on doubledone.pages.dev, which is live too. doubledone.app when there is no host to read.
 */
export function siteName(hostname: string | null | undefined): string {
  const host = (hostname ?? '').trim().replace(/^www\./i, '');
  return host || 'doubledone.app';
}

/** The `{site}` for today.storageBlocked, from this page's address. */
export function storageSite(): string {
  try {
    return siteName(typeof window === 'undefined' ? null : window.location?.hostname);
  } catch {
    return siteName(null);
  }
}

// "Got it" hides the line until the page reloads. Held here, in module scope, and never saved, because nothing can
// be: leaving Today and coming back keeps it hidden, and a reload, which really does start from nothing, brings it
// back.
let hiddenThisPage = false;

/** Whether Today's line is due: this browser keeps nothing, and "Got it" has not been pressed on this page load. */
export function storageLineDue(): boolean {
  return !hiddenThisPage && webStorageBlocked();
}

/** "Got it": the line stays hidden until the page reloads. */
export function hideStorageLine(): void {
  hiddenThisPage = true;
}
