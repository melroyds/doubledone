import type { Task } from '@/lib/tasks';

// The Android home-screen widget is DISABLED (see decision-log 2026-06-24: the
// react-native-android-widget 0.20.3 / RN 0.85 incompatibility left it rendering nothing).
// updateWidget is still called from commit() on every task change, so it stays a no-op rather
// than firing a native requestWidgetUpdate against a widget that is no longer registered. The
// render call (see git history) comes back here when the widget is re-enabled. Signature mirrors
// update.web.ts so the call site stays platform-agnostic.

/** No-op while the widget is disabled. */
export function updateWidget(tasks: Task[], closedISO: string | null): Promise<void> {
  return Promise.resolve();
}
