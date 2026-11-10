import type { Task } from '@/lib/tasks';

// No Android home-screen widget on web; Metro resolves this no-op so the widget library
// never enters the web bundle. Signatures mirror update.tsx so the call sites are platform-
// agnostic (held to it by lib/platform-split.contract.ts). See update.tsx for the native half.

/** No-op on web. */
export function updateWidget(tasks: Task[], closedISO: string | null, heldId: string | null = null): Promise<void> {
  return Promise.resolve();
}

/** No-op on web: there is no widget to refresh. */
export function refreshWidget(): Promise<void> {
  return Promise.resolve();
}

/** No-op on web: nothing to keep in step, so nothing is subscribed. Returns a no-op unsubscribe. */
export function watchStorageForWidget(): () => void {
  return () => {};
}
