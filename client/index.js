// Custom entry: bootstrap expo-router. The Android home-screen widget is DISABLED (see
// decision-log 2026-06-24): react-native-android-widget 0.20.3 does not support RN 0.85's new
// architecture, so its headless render task never fired and the widget drew nothing. The widget/
// source is kept (unused) for an easy re-enable when the library catches up to RN 0.85.
import 'expo-router/entry';
