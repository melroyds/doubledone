import { PixelRatio } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { coalesceRuns } from '@/lib/coalesce';
import { loadClosedDate, loadHold, peekTasks, subscribeStorageChange } from '@/lib/storage';
import type { Task } from '@/lib/tasks';
import { buildWidgetModel, widgetLineCapacity } from '@/lib/widget-model';

import { LIGHT_WIDGET, WIDGET_NAMES } from './names';
import { WIDGETS_SUPPORTED } from './presence';
import { TodayWidget } from './TodayWidget';

// Push a fresh render to any placed Today widget for an instant refresh when the day changes (the
// 30-minute periodic update is only the fallback). Since 2026-11-10 this follows the STORAGE CHANGE
// NOTICE (lib/storage), not Today's commit: every write path ends in saveTasks or saveClosedDate, so
// Goodnight, Reopen, a sync, the sweeps and Chart reach the widget at once, where before only
// Today's own commits did and a closed day could sit on the home screen as open.
// This runs in the APP's JS context (not the headless one), so it is not the diagnostic path; its
// job is only to never disturb the save that triggered it, hence the swallow. A missing widget is
// the common case (widgetNotFound), never an error.
//
// Fans out over EVERY registered widget name: a user can have the default and the always-light card
// on their home screen at once, and both must move together. The scheme rule mirrors the headless
// handler (see task-handler): the light widget is light in both slots, so the system theme cannot
// darken it.
export async function updateWidget(tasks: Task[], closedISO: string | null, heldId: string | null = null): Promise<void> {
  try {
    const now = new Date();
    // The device's font scale, as the headless handler reads it: titles grow with it and the card's
    // padding does not, so a budget worked out at 1.0 overflows the slot on a phone set larger (the
    // clipped "tombstone"). An unreadable value keeps 1, and widgetLineCapacity's margin still holds.
    let fontScale = 1;
    try {
      const read = PixelRatio.getFontScale();
      if (Number.isFinite(read) && read > 0) fontScale = read;
    } catch {
      // keep 1
    }
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          // Built per widget, INSIDE the callback, because the line count depends on the height of
          // the placed widget (`info.height`) and two widgets can be sized differently on the same
          // home screen. Mirrors the headless handler, so an in-app change and an OS refresh agree.
          renderWidget: (info) => {
            const model = buildWidgetModel(tasks, now, closedISO, widgetLineCapacity(info.height, fontScale), heldId);
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
    // A widget refresh must never break the save that triggered it.
  }
}

/**
 * Render every placed widget from what is STORED now: the tasks, the closed day and the held task
 * (its contract's taskId, which seats it under the pin, as on Today). A failed read of the tasks
 * keeps what the widget shows rather than drawing an empty day it does not know is empty.
 */
export async function refreshWidget(): Promise<void> {
  try {
    const [tasks, closedISO, hold] = await Promise.all([peekTasks(), loadClosedDate(), loadHold()]);
    if (tasks === null) return;
    await updateWidget(tasks, closedISO, hold?.taskId ?? null);
  } catch {
    // never thrown at whatever saved
  }
}

/**
 * Keep every placed widget in step with every saved change: one subscription to the storage change
 * notice, made once by the root layout, which returns the unsubscribe. Refreshes never overlap and
 * the last one always reads the newest save (coalesceRuns), so a burst of saves on a cold open costs
 * at most two renders and can never leave an older picture on screen. Android only: nothing to do
 * where no widget can be placed. The daily reminder's settings ('reminder') change nothing the widget
 * shows, so they are skipped: the hour stepper saves on every tap.
 */
export function watchStorageForWidget(): () => void {
  if (!WIDGETS_SUPPORTED) return () => {};
  const refresh = coalesceRuns(refreshWidget);
  return subscribeStorageChange((change) => {
    if (change !== 'reminder') void refresh();
  });
}
