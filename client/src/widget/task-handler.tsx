import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { deserialize } from '@/lib/tasks';
import { buildWidgetModel } from '@/lib/widget-model';

import { TodayWidget } from './TodayWidget';

// Runs headless when Android updates the widget (added, periodic, resized). It reads the
// same AsyncStorage the app writes and reuses the app's pure model, so the widget shows
// exactly what Today shows, even with the app closed. A tap is OPEN_APP (handled natively),
// so WIDGET_CLICK and WIDGET_DELETED need no work here.
const TASKS_KEY = 'doubledone.tasks.v1';
const CLOSED_KEY = 'doubledone.closed.v1';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  const [rawTasks, closedISO] = await Promise.all([
    AsyncStorage.getItem(TASKS_KEY),
    AsyncStorage.getItem(CLOSED_KEY),
  ]);
  const model = buildWidgetModel(rawTasks ? deserialize(rawTasks) : [], new Date(), closedISO);
  props.renderWidget({
    light: <TodayWidget model={model} scheme="light" />,
    dark: <TodayWidget model={model} scheme="dark" />,
  });
}
