import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import * as QuickActions from 'expo-quick-actions';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setInbound } from '@/lib/inbound';
import { useShareInbound } from '@/lib/share-intent';
import { ThemeProvider, useTheme } from '@/lib/theme-provider';

// Hold the native splash until the Dusk fonts load. On web the families come from
// the global.css @import, so we never block the first paint there.
if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync();

// One calm screen for now (Today), plus Settings. No tab bar, because surfacing
// every feature at once is exactly the overwhelm DoubleDone exists to prevent.
// The ThemeProvider wraps the router so a theme / text-size change re-paints the
// whole app live.
export default function RootLayout() {
  // Load the real Newsreader + Atkinson families on native so they render instead
  // of System. On web they are already provided by CSS, so pass nothing and never
  // block (useFonts({}) resolves immediately).
  const [fontsLoaded] = useFonts(
    Platform.OS === 'web'
      ? {}
      : { Newsreader_600SemiBold, AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold },
  );

  useEffect(() => {
    if (fontsLoaded && Platform.OS !== 'web') void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null; // native only; web is always loaded

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Map a tapped launcher shortcut to an inbound intent for the Today screen to consume.
function routeQuickAction(action: QuickActions.Action) {
  if (action.id === 'dump') setInbound({ kind: 'dump' });
  else if (action.id === 'focus') setInbound({ kind: 'focus' });
}

function RootStack() {
  const theme = useTheme();
  const isDark = theme.scheme === 'dark';

  // Catch a share from another app (text or a URL) and queue it for Today's capture box.
  useShareInbound();

  // Paint the native window background to match the theme so launch, transitions, and
  // overscroll never flash the wrong colour. Native only; web has its own page background.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SystemUI.setBackgroundColorAsync(theme.colors.bg);
  }, [theme.colors.bg]);

  // Register the launcher long-press shortcuts once, and route a tapped one into the app.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void QuickActions.setItems([
      { id: 'dump', title: 'Brain dump', subtitle: 'Empty your head' },
      { id: 'focus', title: 'Focus on one thing', subtitle: 'Just the next thing' },
    ]);
    if (QuickActions.initial) routeQuickAction(QuickActions.initial);
    const sub = QuickActions.addListener(routeQuickAction);
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Android nav-bar icons follow the IN-APP theme (which can differ from the system
          theme); the plugin's enforceContrast:false lets this style take effect under
          SDK 56 edge-to-edge. Renders null off Android. */}
      {Platform.OS === 'android' && <NavigationBar style={isDark ? 'dark' : 'light'} />}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </View>
  );
}
