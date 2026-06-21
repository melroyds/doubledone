import type { Task } from '@/lib/tasks';

// No Android home-screen widget on web; Metro resolves this no-op so the widget library
// never enters the web bundle. Signature mirrors update.tsx so the call site is platform-
// agnostic. See update.tsx for the native implementation.

/** No-op on web. */
export function updateWidget(tasks: Task[], closedISO: string | null): Promise<void> {
  return Promise.resolve();
}
