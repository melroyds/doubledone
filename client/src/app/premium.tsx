import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { type Entitlement, FREE_ENTITLEMENT, weeklyAllowance } from '@/lib/entitlement';
import { loadEntitlement, startCheckout } from '@/lib/stripe';
import { track } from '@/lib/telemetry';
import { useThemedStyles } from '@/lib/theme-provider';

// The Premium surface. Calm, never a hard wall: the free monthly keepsake is always
// honoured, and Premium is framed as "keep every week", not "unlock or lose". The
// server is the source of truth for premium status; this screen only reads it and
// starts Checkout. Returns from Stripe with ?status=success|cancelled.
export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const [ent, setEnt] = useState<Entitlement>(FREE_ENTITLEMENT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState(1);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setInterval> | undefined;
      let tries = 0;
      track('premium.viewed', { status: status ?? 'open' });

      const load = async () => {
        const e = await loadEntitlement();
        if (!active) return false;
        setEnt(e);
        setAllowance(weeklyAllowance(e.since, Date.now()));
        setLoading(false);
        return e.premium;
      };

      void load().then((isPremium) => {
        // The webhook can lag a few seconds after returning from checkout, so poll
        // briefly rather than leaving the screen on "updates in a moment" forever.
        if (active && status === 'success' && !isPremium) {
          timer = setInterval(() => {
            tries += 1;
            void load().then((ok) => {
              if ((ok || tries >= 10) && timer) clearInterval(timer);
            });
          }, 2000);
        }
      });

      return () => {
        active = false;
        if (timer) clearInterval(timer);
      };
    }, [status]),
  );

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    track('premium.checkout_started');
    const res = await startCheckout();
    if (!res.ok) {
      setError(res.error === 'sign_in' ? 'Sign in first, so Premium attaches to your account.' : 'Could not start checkout. Please try again.');
      setBusy(false);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(res.url);
    } else {
      void Linking.openURL(res.url);
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.three }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Premium</Text>

        {loading ? (
          <ActivityIndicator color={styles.spinner.color} style={styles.loadingPad} />
        ) : ent.premium ? (
          <View style={styles.panel}>
            <Text style={styles.panelHead}>You’re Premium ✓</Text>
            <Text style={styles.body}>
              You get {allowance} keepsake{allowance === 1 ? '' : 's'} a week{allowance < 4 ? ', and more the longer you stay.' : '.'} Thank you for keeping
              DoubleDone independent.
            </Text>
            <Text style={styles.foot}>Manage or cancel anytime from your Stripe receipt email. The free monthly keepsake is always yours regardless.</Text>
          </View>
        ) : (
          <View style={styles.panel}>
            {status === 'success' ? (
              <Text style={styles.note}>Thanks! Setting up your Premium, this updates in a moment.</Text>
            ) : status === 'cancelled' ? (
              <Text style={styles.note}>No worries. Your free monthly keepsake is always here.</Text>
            ) : null}

            <Text style={styles.panelHead}>Keep every week.</Text>
            <Text style={styles.body}>
              Premium turns each finished week into a calm AI keepsake, a still-life of everything you actually did. Free makes one a month; Premium makes it
              weekly, and more often the longer you stay.
            </Text>

            <View style={styles.tiers}>
              <Text style={styles.tier}>1 a week now</Text>
              <Text style={styles.tierArrow}>→</Text>
              <Text style={styles.tier}>2 after two months</Text>
              <Text style={styles.tierArrow}>→</Text>
              <Text style={styles.tier}>4 after six</Text>
            </View>

            <Text style={styles.price}>A$5 / month. Cancel anytime. No ads, ever.</Text>

            {session ? (
              <Pressable
                onPress={subscribe}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Subscribe to Premium, five dollars a month"
                style={({ pressed }) => [styles.cta, pressed && styles.pressed, busy && styles.ctaBusy]}
              >
                <Text style={styles.ctaText}>{busy ? 'Opening checkout…' : 'Go Premium'}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/sign-in')}
                accessibilityRole="button"
                accessibilityLabel="Sign in to go Premium"
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              >
                <Text style={styles.ctaText}>Sign in to go Premium</Text>
              </Pressable>
            )}
            {!session ? <Text style={styles.foot}>Premium attaches to your account, so it follows you across devices.</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.six, maxWidth: 560, width: '100%', alignSelf: 'center' },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    title: { color: t.colors.ink, fontSize: 42 * t.scale, fontWeight: '400', fontFamily: fonts.sans, marginTop: spacing.three },
    spinner: { color: t.colors.accent },
    loadingPad: { marginTop: spacing.six },
    panel: { marginTop: spacing.five, gap: spacing.three },
    panelHead: { color: t.colors.ink, fontSize: 24 * t.scale, fontFamily: fonts.sans, fontWeight: '400' },
    body: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 24 },
    note: {
      color: t.colors.accent,
      fontSize: 15 * t.scale,
      fontFamily: fonts.body,
      backgroundColor: t.colors.accentSoft,
      borderRadius: radius.md,
      padding: spacing.three,
      overflow: 'hidden',
    },
    tiers: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.two, marginTop: spacing.one },
    tier: {
      color: t.colors.accent,
      fontSize: 13 * t.scale,
      fontFamily: fonts.bodyBold,
      fontWeight: '700',
      backgroundColor: t.colors.accentSoft,
      borderRadius: radius.sm,
      paddingVertical: spacing.one,
      paddingHorizontal: spacing.two,
      overflow: 'hidden',
    },
    tierArrow: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body },
    price: { color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', marginTop: spacing.two },
    cta: { backgroundColor: t.colors.accent, borderRadius: radius.lg, paddingVertical: spacing.four, alignItems: 'center', marginTop: spacing.two },
    ctaBusy: { opacity: 0.7 },
    ctaText: { color: '#FFFFFF', fontSize: 17 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    pressed: { opacity: 0.8 },
    foot: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 20 },
    error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
  });
