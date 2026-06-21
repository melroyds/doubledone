import { requestWidgetUpdate } from 'react-native-android-widget';

import type { Task } from '@/lib/tasks';
import { buildWidgetModel } from '@/lib/widget-model';

import { TodayWidget } from './TodayWidget';

const WIDGET_NAME = 'Today';

// Push a fresh render to any placed Today widget, for an instant refresh when tasks change
// (the 30-minute periodic update is only the fallback). Fire-and-forget; a no-op if the
// user has no widget on the home screen.
export async function updateWidget(tasks: Task[], closedISO: string | null): Promise<void> {
  const model = buildWidgetModel(tasks, new Date(), closedISO);
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: () => ({
      light: <TodayWidget model={model} scheme="light" />,
      dark: <TodayWidget model={model} scheme="dark" />,
    }),
    widgetNotFound: () => {},
  });
}
