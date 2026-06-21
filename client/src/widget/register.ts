import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './task-handler';

/** Register the headless widget task handler. Called once from the app entry (native). */
export function registerWidget(): void {
  registerWidgetTaskHandler(widgetTaskHandler);
}
