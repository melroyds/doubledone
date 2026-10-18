// The app's side of the static landing page (lib/landing-page.ts has the whole contract). Web only: on native
// there is no document, and every function here is a no-op.
//
// The exported index.html carries the landing page as plain HTML for crawlers and first visits. Once the app's
// bundle runs, the index route (app/index.tsx) uses these to own it: show it while a fresh visitor is on "/",
// turn its Begin links into a client-side navigation (no reload), and hide it again the moment the app moves on.

const LANDING_ID = 'dd-landing';

type Doc = {
  documentElement: { classList: { add(c: string): void; remove(c: string): void } };
  getElementById(id: string): { querySelectorAll(sel: string): ArrayLike<Link> } | null;
};
type Link = {
  addEventListener(type: 'click', fn: (e: Click) => void): void;
  removeEventListener(type: 'click', fn: (e: Click) => void): void;
};
type Click = {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
  preventDefault(): void;
};

function currentDocument(): Doc | null {
  return typeof document === 'undefined' ? null : (document as unknown as Doc);
}

/** True when this page load carries the static landing (a production export, not the dev server). */
export function hasStaticLanding(doc: Doc | null = currentDocument()): boolean {
  return !!doc?.getElementById(LANDING_ID);
}

/** Show the static landing in place of the app and route its Begin links through `onBegin`. Returns the undo:
 *  call it when the index route leaves, and the app is visible again. A modified click (new tab, new window)
 *  is left to the browser. */
export function showStaticLanding(onBegin: () => void, doc: Doc | null = currentDocument()): () => void {
  const landing = doc?.getElementById(LANDING_ID);
  if (!doc || !landing) return () => {};
  const root = doc.documentElement.classList;
  root.remove('dd-app');
  root.add('dd-landing');
  const links = Array.from(landing.querySelectorAll('[data-dd-begin]'));
  const onClick = (e: Click) => {
    if (e.defaultPrevented || (e.button ?? 0) !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onBegin();
  };
  for (const a of links) a.addEventListener('click', onClick);
  return () => {
    for (const a of links) a.removeEventListener('click', onClick);
    root.remove('dd-landing');
    root.add('dd-app');
  };
}

/** Hide the static landing (a returning visitor, or the app moving on). Safe to call when there is none. */
export function hideStaticLanding(doc: Doc | null = currentDocument()): void {
  if (!doc) return;
  doc.documentElement.classList.remove('dd-landing');
  doc.documentElement.classList.add('dd-app');
}
