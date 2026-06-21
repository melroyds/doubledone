// Custom entry: bootstrap expo-router, then register the headless Android widget task
// handler so the home-screen widget can render while the app is closed. The widget modules
// are platform-split, so `registerWidget` is a no-op import on web (register.web.ts) and
// the widget library never enters the web bundle.
import 'expo-router/entry';

import { registerWidget } from './src/widget/register';

registerWidget();
