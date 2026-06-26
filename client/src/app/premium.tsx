import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PrimaryButton } from '@/components/PrimaryButton';
import { fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { weeklyAllowance } from '@/lib/entitlement';
import { usePremium } from '@/lib/premium-provider';
import { startCheckout, startPortal } from '@/lib/stripe';
import { track } from '@/lib/telemetry';
import { useThemedStyles } from '@/lib/theme-provider';

// Format an epoch-seconds period end as a short date ("20 Jul 2026"), or null.
function formatPeriod(epochSec: number | null): string | null {
  if (!epochSec) return null;
  try {
    return new Date(epochSec * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

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
  const { premium, effectiveEntitlement, loading, refresh } = usePremium();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Premium status and the period/allowance copy come from the provider, the single source the dev
  // override drives too. Derived, not stored. The gate-ready entitlement keeps the real tenure.
  // `now` is captured once on mount (like Lookback's today): the allowance is tenure-based and
  // changes by the month, so a per-render clock read is both unnecessary and impure in render.
  const now = useMemo(() => new Date().getTime(), []);
  const allowance = weeklyAllowance(effectiveEntitlement.since, now);
  const periodLabel = formatPeriod(effectiveEntitlement.currentPeriodEnd);

  // Re-check the entitlement when the screen gains focus, e.g. after returning from checkout.
  useFocusEffect(
    useCallback(() => {
      track('premium.viewed', { status: status ?? 'open' });
      refresh();
    }, [status, refresh]),
  );

  // The Stripe webhook can lag a few seconds after a successful checkout, so poll the provider
  // until premium flips, or we give up. Watching `premium` clears the timer as soon as it lands.
  useEffect(() => {
    if (status !== 'success' || premium) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      refresh();
      if (tries >= 10) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [status, premium, refresh]);

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

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    track('premium.manage_opened');
    const res = await startPortal();
    if (!res.ok) {
      setError(res.error === 'sign_in' ? 'Please sign in again.' : 'Could not open the billing portal. Please try again.');
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
        <BackLink />
        <Text style={styles.title}>Premium</Text>

        {loading ? (
          <ActivityIndicator color={styles.spinner.color} style={styles.loadingPad} />
        ) : premium ? (
          <View style={styles.panel}>
            <Text style={styles.panelHead}>You&apos;re Premium ✓</Text>
            <Text style={styles.body}>
              Everything is unlocked: Scan, Chart a course, Plan my day, Your patterns, and {allowance} weekly scrapbook{allowance === 1 ? '' : 's'}
              {allowance < 4 ? ', more the longer you stay.' : '.'} Thank you for keeping DoubleDone independent.
            </Text>
            {effectiveEntitlement.cancelAtPeriodEnd && periodLabel ? (
              <Text style={styles.subStatus}>Premium until {periodLabel}, then back to the free monthly scrapbook.</Text>
            ) : periodLabel ? (
              <Text style={styles.subStatus}>Renews {periodLabel}.</Text>
            ) : null}
            <Text style={styles.foot}>The free monthly scrapbook is always yours, even if you cancel.</Text>
            <PrimaryButton
              label={busy ? 'Opening…' : 'Manage subscription'}
              onPress={manage}
              disabled={busy}
              accessibilityLabel="Manage or cancel your subscription"
              style={styles.ctaSpace}
            />
            <Pressable onPress={() => router.replace('/')} accessibilityRole="button" accessibilityLabel="Back to Today" hitSlop={8} style={styles.backLink}>
              <Text style={styles.backLinkText}>Back to Today</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.panel}>
            {status === 'success' ? (
              <Text style={styles.note}>Thanks. Setting up your Premium, this updates in a moment.</Text>
            ) : status === 'cancelled' ? (
              <Text style={styles.note}>That&apos;s alright. Your free monthly scrapbook is always here.</Text>
            ) : null}

            <Text style={styles.panelHead}>More of what you love.</Text>
            <Text style={styles.body}>
              The whole calm daily loop stays free, forever, all the relief and your Lookback. Premium is the extras, never anything you need.
            </Text>

            <View style={styles.featureList}>
              {[
                'Scan a photo of a list straight into tasks',
                "Pin the day's one thing",
                'A weekly AI scrapbook of everything you finished',
                'Your patterns, gentle stats and a warm weekly reflection',
                'Chart a course, turn a goal into calm next steps',
                'Plan my day, a calm order for today',
              ].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.feature}>{f}</Text>
                </View>
              ))}
              <Text style={styles.featureMore}>and more on the way…</Text>
            </View>

            <Text style={styles.keepsakeNote}>The weekly scrapbook grows the longer you stay:</Text>
            <View style={styles.tiers}>
              <Text style={styles.tier}>1 a week</Text>
              <Text style={styles.tierArrow}>→</Text>
              <Text style={styles.tier}>2 after two months</Text>
              <Text style={styles.tierArrow}>→</Text>
              <Text style={styles.tier}>4 after six months</Text>
            </View>

            <Text style={styles.price}>A$5 / month. Cancel anytime. No ads, ever.</Text>

            {session ? (
              <PrimaryButton
                label={busy ? 'Opening checkout…' : 'Go Premium'}
                onPress={subscribe}
                disabled={busy}
                accessibilityLabel="Subscribe to Premium, five dollars a month"
                style={styles.ctaSpace}
              />
            ) : (
              <PrimaryButton
                label="Sign in to go Premium"
                onPress={() => router.push('/sign-in')}
                accessibilityLabel="Sign in to go Premium"
                style={styles.ctaSpace}
              />
            )}
            <Text style={styles.foot}>
              {session
                ? 'The free monthly scrapbook is always yours, even if you never upgrade.'
                : 'Premium attaches to your account, so it follows you across devices. The free monthly scrapbook is always yours.'}
            </Text>
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
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.six, maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center' },
    title: { ...t.type.title, color: t.colors.ink, marginTop: spacing.three },
    spinner: { color: t.colors.accent },
    loadingPad: { marginTop: spacing.six },
    panel: { marginTop: spacing.five, gap: spacing.three },
    panelHead: { color: t.colors.ink, fontSize: 24 * t.scale, fontFamily: fonts.sans, fontWeight: '400' },
    body: { color: t.colors.inkSoft, fontSize: 16 * t.scale, fontFamily: fonts.body, lineHeight: 24 * t.scale },
    featureList: { gap: spacing.two, marginTop: spacing.one },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
    featureDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: t.colors.accent },
    feature: { color: t.colors.ink, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale, flex: 1 },
    featureMore: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.one, marginLeft: spacing.four },
    keepsakeNote: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
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
    ctaSpace: { marginTop: spacing.two },
    foot: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale },
    subStatus: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale },
    error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
    backLink: { alignSelf: 'center', marginTop: spacing.one },
    backLinkText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  });
