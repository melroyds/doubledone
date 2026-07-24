import { requestWidgetUpdate } from 'react-native-android-widget';

import type { Task } from '@/lib/tasks';
import { buildWidgetModel } from '@/lib/widget-model';

import { TodayWidget } from './TodayWidget';

const WIDGET_NAME = 'Today';

// Push a fresh render to any placed Today widget for an instant refresh when tasks change (the
// 30-minute periodic update is only the fallback). Called from commit() on every task change.
// This runs in the APP's JS context (not the headless one), so it is not the diagnostic path; its
// job is only to never disturb the task save that triggered it, hence the swallow. A missing widget
// is the common case (widgetNotFound), never an error.
export async function updateWidget(tasks: Task[], closedISO: string | null): Promise<void> {
  try {
    const model = buildWidgetModel(tasks, new Date(), closedISO);
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => ({
        light: <TodayWidget model={model} scheme="light" />,
        dark: <TodayWidget model={model} scheme="dark" />,
      }),
      widgetNotFound: () => {},
    });
  } catch {
    // A widget refresh must never break the task save that triggered it.
  }
}
