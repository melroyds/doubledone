import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlexWidget, type HexColor, TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';

// Runs headless when Android updates the widget (added, periodic, resized). It reads the same
// AsyncStorage the app writes and reuses the app's pure model, so the widget shows exactly what
// Today shows even with the app closed. A tap is OPEN_APP (handled natively), so WIDGET_CLICK /
// WIDGET_DELETED need no work here.
//
// SELF-DIAGNOSING (2026-07-25). The original widget rendered BLANK on device and the cause was
// never proven (adb was unavailable, so nothing was ever read). The one confirmed culprit was a
// module that touched app-only globals AT IMPORT TIME (constants/theme's global.css + Appearance).
// So the app modules are imported INSIDE the try below: a module-load throw of that exact class is
// caught and its message is drawn ON the widget instead of vanishing into a silent blank. The next
// device test needs no adb: tasks render (fixed), an error string renders (we have the cause), or
// the widget stays fully blank (the headless task is not firing at all -> a registration issue).
const TASKS_KEY = 'doubledone.tasks.v1';
const CLOSED_KEY = 'doubledone.closed.v1';

// A bulletproof fallback: depends ONLY on the widget library + inline hex, never on an app module,
// so it still renders even if an app import (model / locale / TodayWidget) is exactly what threw.
function diagnosticWidget(message: string) {
  // Same two-layer shape as TodayWidget: a transparent outer filling the slot, and a content-sized
  // card inset 2dp so all four corners round symmetrically inside the clip (see TodayWidget's note).
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', padding: 2 }}>
      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          height: 'wrap_content',
          flexDirection: 'column',
          backgroundColor: '#1B1917' as HexColor,
          borderRadius: 24,
          padding: 16,
        }}
      >
        <TextWidget text="DoubleDone" style={{ fontSize: 13, color: '#C68BA0' as HexColor, fontWeight: '700' }} />
        <TextWidget text={message} maxLines={4} truncate="END" style={{ fontSize: 12, color: '#F2EBE0' as HexColor, marginTop: 6 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  console.log(`[widget] task fired: ${props.widgetAction}`);
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;
  try {
    // Imported here, not at module top, so a headless-context load throw is caught (see header).
    const [{ deserialize }, { buildWidgetModel }, { TodayWidget }] = await Promise.all([
      import('@/lib/tasks'),
      import('@/lib/widget-model'),
      import('./TodayWidget'),
    ]);
    const [rawTasks, closedISO] = await Promise.all([
      AsyncStorage.getItem(TASKS_KEY),
      AsyncStorage.getItem(CLOSED_KEY),
    ]);
    const model = buildWidgetModel(rawTasks ? deserialize(rawTasks) : [], new Date(), closedISO);
    props.renderWidget({
      light: <TodayWidget model={model} scheme="light" />,
      dark: <TodayWidget model={model} scheme="dark" />,
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[widget] render failed', e);
    props.renderWidget(diagnosticWidget(msg));
  }
}
