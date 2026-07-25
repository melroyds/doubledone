import { requestWidgetUpdate } from 'react-native-android-widget';

import type { Task } from '@/lib/tasks';
import { buildWidgetModel, widgetLineCapacity } from '@/lib/widget-model';

import { LIGHT_WIDGET, WIDGET_NAMES } from './names';
import { TodayWidget } from './TodayWidget';

// Push a fresh render to any placed Today widget for an instant refresh when tasks change (the
// 30-minute periodic update is only the fallback). Called from commit() on every task change.
// This runs in the APP's JS context (not the headless one), so it is not the diagnostic path; its
// job is only to never disturb the task save that triggered it, hence the swallow. A missing widget
// is the common case (widgetNotFound), never an error.
//
// Fans out over EVERY registered widget name: a user can have the default and the always-light card
// on their home screen at once, and both must move together. The scheme rule mirrors the headless
// handler (see task-handler): the light widget is light in both slots, so the system theme cannot
// darken it.
export async function updateWidget(tasks: Task[], closedISO: string | null): Promise<void> {
  try {
    const now = new Date();
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          // Built per widget, INSIDE the callback, because the line count depends on the height of
          // the placed widget (`info.height`) and two widgets can be sized differently on the same
          // home screen. Mirrors the headless handler, so an in-app edit and an OS refresh agree.
          renderWidget: (info) => {
            const model = buildWidgetModel(tasks, now, closedISO, widgetLineCapacity(info.height));
            return {
              light: <TodayWidget model={model} scheme="light" />,
              dark: <TodayWidget model={model} scheme={widgetName === LIGHT_WIDGET ? 'light' : 'dark'} />,
            };
          },
          widgetNotFound: () => {},
        }),
      ),
    );
  } catch {
    // A widget refresh must never break the task save that triggered it.
  }
}
