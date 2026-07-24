// Custom entry: bootstrap expo-router, then register the headless Android widget task handler so
// the home-screen widget renders while the app is closed. Platform-split: registerWidget is a no-op
// on web (register.web.ts), so the widget library never enters the web bundle.
//
// Re-enabled 2026-07-25. The widget was disabled 2026-06-24 on an unproven "library doesn't support
// the new architecture" theory (the library has supported it since 0.16.0; we were on 0.20.3). The
// headless task is now self-diagnosing (see src/widget/task-handler), so the next device build tells
// us on the widget's own face whether it renders, errors, or never fires.
import 'expo-router/entry';

import { registerWidget } from './src/widget/register';

registerWidget();
