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

import { useSessionState } from '@/lib/auth';
import { setInbound } from '@/lib/inbound';
import { t } from '@/lib/locale';
import { PremiumProvider } from '@/lib/premium-provider';
import { configurePurchases, forgetPurchaser, IAP_AVAILABLE, identifyPurchaser } from '@/lib/purchases';
import { reconcileApple } from '@/lib/stripe';
import { rescheduleAllNudges, resyncHold } from '@/lib/reminders';
import { useShareInbound } from '@/lib/share-intent';
import { loadHold, loadReminderHour, loadReminderOn, loadRoutines } from '@/lib/storage';
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
        <PremiumProvider>
          <RootStack />
        </PremiumProvider>
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
  const { session, known: sessionKnown } = useSessionState();

  // Catch a share from another app (text or a URL) and queue it for Today's capture box.
  useShareInbound();

  // In-app purchases (Apple on iOS, Google Play on Android, both through RevenueCat). Both calls are
  // compile-time no-ops on the web: they come from lib/purchases.ts (the inert stub), so the native
  // module is never in that bundle. configure once, early; then attach the RevenueCat customer to the
  // signed-in Supabase id so a purchase belongs to the account. We deliberately do NOT configure a web
  // RevenueCat app (web sells via Stripe), so there is nothing to "fix" here for web. On Android the
  // identify waits for configure to finish (lib/purchases.android.ts), and buying checks it again.
  useEffect(() => {
    void configurePurchases();
  }, []);
  useEffect(() => {
    // Wait until the session is KNOWN. On the first render a signed-in person reads as null while the
    // session hydrates, and "null" here used to mean "forget the purchaser". On iOS that was a no-op only
    // because configure had not finished yet; on Android, which waits for configure, it was a real
    // RevenueCat logOut on every launch, swapping the account for a fresh anonymous id until sign-in
    // caught up. A Play purchase RevenueCat synced inside that window would have landed on the anonymous
    // id, which our webhook drops (the 2026-10-01 review). So: forget only a session known to be absent.
    if (!sessionKnown) return;
    const id = session?.user?.id;
    if (!id) {
      void forgetPurchaser();
      return;
    }
    // ORDER MATTERS. identifyPurchaser calls Purchases.logIn, which is what puts this Supabase id in
    // RevenueCat's alias group. Only after that can the server ask RevenueCat about the id and find
    // an anonymous purchase to attach, so the reconcile has to await the identify rather than race
    // it. Store builds only: on the web there is no logIn, so there is never an alias and the call could
    // only ever answer "nothing", which is not worth a request on every sign-in. Android keeps it as the
    // safety net for a missed webhook (the server reads the store and grants only a real one).
    void identifyPurchaser(id).then(() => {
      if (IAP_AVAILABLE) void reconcileApple();
    });
  }, [sessionKnown, session?.user?.id]);

  // The nudge resilience sweep (native): once per app open, quietly re-schedule every
  // active Rhythm, checklist nudge, and the daily reminder from their stored config.
  // Heals OEM alarm wipes and migrates Rhythms onto their HIGH-importance channel;
  // quiet, so it can never surprise anyone with a permission prompt. Best effort.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const [routines, reminderOn, reminderHour] = await Promise.all([loadRoutines(), loadReminderOn(), loadReminderHour()]);
      await rescheduleAllNudges(routines, reminderOn ? reminderHour : null);
      // The Hold-me-to-it contract heals here too: re-asserted from storage, or its orphaned
      // knocks cancelled if the contract is gone.
      await resyncHold(await loadHold());
    })();
  }, []);

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
      { id: 'dump', title: t('widget.quickActionDumpTitle'), subtitle: t('widget.quickActionDumpSubtitle') },
      { id: 'focus', title: t('today.focusOne'), subtitle: t('widget.quickActionFocusSubtitle') },
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
      >
        {/* The Menu's contents page does its own fade-and-rise (a 90ms fade under reduced motion), and
            Ours is the other half of Today's heading, so both skip the platform's sideways slide: switching
            between Today and Ours reads as a tab changing, not a page arriving. */}
        <Stack.Screen name="rooms" options={{ animation: 'fade' }} />
        <Stack.Screen name="ours-list" options={{ animation: 'fade', animationDuration: 200 }} />
        {/* The rooms themselves fade in (and rise, inside the screen); the platform's sideways slide would
            fight that, and reads as a new page rather than walking into the room you just saw. */}
        <Stack.Screen name="lookback" options={{ animation: 'fade', animationDuration: 180 }} />
        <Stack.Screen name="routines" options={{ animation: 'fade', animationDuration: 180 }} />
        <Stack.Screen name="repeating" options={{ animation: 'fade', animationDuration: 180 }} />
        <Stack.Screen name="chart" options={{ animation: 'fade', animationDuration: 180 }} />
        <Stack.Screen name="ours" options={{ animation: 'fade', animationDuration: 180 }} />
      </Stack>
    </View>
  );
}
