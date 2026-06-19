import { AtkinsonHyperlegible_400Regular } from '@expo-google-fonts/atkinson-hyperlegible';
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
    Platform.OS === 'web' ? {} : { Newsreader_600SemiBold, AtkinsonHyperlegible_400Regular },
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

function RootStack() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      />
    </>
  );
}
