import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { PrimaryButton } from '@/components/PrimaryButton';
import { fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { weeklyAllowance } from '@/lib/entitlement';
import { t } from '@/lib/locale';
import { usePremium } from '@/lib/premium-provider';
import { startCheckout, startPortal, startTrial } from '@/lib/stripe';
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

  // After a successful checkout the Stripe webhook can lag. Poll the provider until premium flips, then give
  // up after ~20s, but DON'T strand the user on "setting up": set `stuck` so the UI offers a Refresh and a
  // reassurance ("your payment went through"). The worst place to dead-end is right after taking money.
  const [stuck, setStuck] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly'); // which price the checkout opens
  const [trialNote, setTrialNote] = useState<string | null>(null); // gentle note after a trial tap (e.g. already used)
  useEffect(() => {
    if (status !== 'success' || premium) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      refresh();
      if (tries >= 10) {
        clearInterval(timer);
        setStuck(true);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [status, premium, refresh]);

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    track('premium.checkout_started', { plan });
    const res = await startCheckout(plan);
    if (!res.ok) {
      setError(
        res.error === 'sign_in'
          ? t('premium.errorCheckoutSignIn')
          : res.error === 'already'
            ? t('premium.errorAlreadyPremium')
            : t('premium.errorCheckoutFailed'),
      );
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

  // The card-free one-month trial: no checkout, the server grants 30 days of Premium to this account once.
  // 'already' is gentle (never shame), and on success we refresh so the page flips to the Premium state.
  async function startFreeTrial() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setTrialNote(null);
    track('premium.trial_tapped');
    const res = await startTrial();
    setBusy(false);
    if (!res.ok) {
      setError(res.error === 'sign_in' ? t('premium.errorTrialSignIn') : t('premium.errorTrialFailed'));
      return;
    }
    if (res.result === 'already') {
      setTrialNote(t('premium.trialAlreadyUsed'));
      return;
    }
    track('premium.trial_started');
    refresh();
  }

  async function manage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    track('premium.manage_opened');
    const res = await startPortal();
    if (!res.ok) {
      setError(res.error === 'sign_in' ? t('premium.errorPortalSignIn') : t('premium.errorPortalFailed'));
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
        <Text style={styles.title}>{t('common.premium')}</Text>

        {loading ? (
          <ActivityIndicator color={styles.spinner.color} style={styles.loadingPad} />
        ) : premium ? (
          <View style={styles.panel}>
            <Text style={styles.panelHead}>{status === 'trial' ? t('premium.headTrialActive') : t('premium.headPremiumActive')}</Text>
            <Text style={styles.body}>
              {allowance === 1
                ? t('premium.unlockedBodyOneGrowing', { allowance })
                : allowance < 4
                  ? t('premium.unlockedBodyGrowing', { allowance })
                  : t('premium.unlockedBodyFull', { allowance })}
            </Text>
            {status === 'trial' && periodLabel ? (
              <Text style={styles.subStatus}>{t('premium.trialUntil', { periodLabel })}</Text>
            ) : effectiveEntitlement.cancelAtPeriodEnd && periodLabel ? (
              <Text style={styles.subStatus}>{t('premium.premiumUntil', { periodLabel })}</Text>
            ) : periodLabel ? (
              <Text style={styles.subStatus}>{t('premium.renews', { periodLabel })}</Text>
            ) : null}
            <Text style={styles.foot}>{t('premium.freeScrapbookEvenIfCancel')}</Text>
            {status === 'trial' ? (
              <PrimaryButton
                label={busy ? t('premium.openingCheckout') : t('premium.goPremiumKeepIt')}
                onPress={subscribe}
                disabled={busy}
                accessibilityLabel={t('premium.goPremiumKeepItA11y')}
                style={styles.ctaSpace}
              />
            ) : (
              <PrimaryButton
                label={busy ? t('premium.opening') : t('premium.manageSubscription')}
                onPress={manage}
                disabled={busy}
                accessibilityLabel={t('premium.manageSubscriptionA11y')}
                style={styles.ctaSpace}
              />
            )}
            <Pressable onPress={() => router.replace('/today')} accessibilityRole="button" accessibilityLabel={t('common.backToToday')} hitSlop={8} style={styles.backLink}>
              <Text style={styles.backLinkText}>{t('common.backToToday')}</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.panel}>
            {status === 'success' ? (
              stuck ? (
                <>
                  <Text style={styles.note}>{t('premium.stuckNote')}</Text>
                  <PrimaryButton label={t('common.refresh')} onPress={refresh} accessibilityLabel={t('premium.refreshA11y')} style={styles.ctaSpace} />
                  <Text style={styles.foot}>{t('premium.stuckFoot')}</Text>
                </>
              ) : (
                <Text style={styles.note}>{t('premium.settingUp')}</Text>
              )
            ) : status === 'cancelled' ? (
              <Text style={styles.note}>{t('premium.checkoutCancelled')}</Text>
            ) : null}

            <Text style={styles.panelHead}>{t('premium.upsellHead')}</Text>
            <Text style={styles.body}>
              {t('premium.upsellBody')}
            </Text>

            <View style={styles.featureList}>
              {[
                t('premium.featureScan'),
                t('premium.featurePin'),
                t('premium.featureQuiet'),
                t('premium.featureThemes'),
                t('premium.featureScrapbook'),
                t('premium.featurePatterns'),
                t('premium.featureChart'),
                t('premium.featurePlanMyDay'),
              ].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.feature}>{f}</Text>
                </View>
              ))}
              <Text style={styles.featureMore}>{t('premium.featureMore')}</Text>
            </View>

            <Text style={styles.keepsakeNote}>{t('premium.scrapbookGrows')}</Text>
            <View style={styles.tiers}>
              <Text style={styles.tier}>{t('premium.tierOneAWeek')}</Text>
              <Text style={styles.tierArrow}>→</Text>
              <Text style={styles.tier}>{t('premium.tierTwoAfterTwoMonths')}</Text>
              <Text style={styles.tierArrow}>→</Text>
              <Text style={styles.tier}>{t('premium.tierFourAfterSixMonths')}</Text>
            </View>

            {session && (
              <View style={styles.planToggle}>
                <Pressable
                  onPress={() => setPlan('monthly')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: plan === 'monthly' }}
                  accessibilityLabel={t('premium.planMonthlyA11y')}
                  style={[styles.planPill, plan === 'monthly' && styles.planPillOn]}
                >
                  <Text style={[styles.planPillText, plan === 'monthly' && styles.planPillTextOn]}>{t('premium.planMonthly')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPlan('annual')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: plan === 'annual' }}
                  accessibilityLabel={t('premium.planAnnualA11y')}
                  style={[styles.planPill, plan === 'annual' && styles.planPillOn]}
                >
                  <Text style={[styles.planPillText, plan === 'annual' && styles.planPillTextOn]}>{t('premium.planAnnual')}</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.price}>
              {plan === 'annual' ? t('premium.priceAnnual') : t('premium.priceMonthly')}
            </Text>

            {session ? (
              <PrimaryButton
                label={busy ? t('premium.openingCheckout') : t('premium.goPremium')}
                onPress={subscribe}
                disabled={busy}
                accessibilityLabel={plan === 'annual' ? t('premium.subscribeAnnualA11y') : t('premium.subscribeMonthlyA11y')}
                style={styles.ctaSpace}
              />
            ) : (
              <PrimaryButton
                label={t('premium.signInToGoPremium')}
                onPress={() => router.push('/sign-in')}
                accessibilityLabel={t('premium.signInToGoPremium')}
                style={styles.ctaSpace}
              />
            )}
            {session && (
              <Pressable
                onPress={startFreeTrial}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('premium.trialLinkA11y')}
                hitSlop={6}
                style={styles.trialLink}
              >
                <Text style={styles.trialLinkText}>{t('premium.trialLink')}</Text>
              </Pressable>
            )}
            {trialNote ? <Text style={styles.trialNoteText}>{trialNote}</Text> : null}
            <Text style={styles.foot}>
              {session ? t('premium.footSignedIn') : t('premium.footSignedOut')}
            </Text>
            <Pressable
              onPress={() => router.push('/terms')}
              accessibilityRole="button"
              accessibilityLabel={t('premium.termsLinkA11y')}
              hitSlop={6}
            >
              <Text style={styles.foot}>{t('premium.billedViaStripe')}</Text>
            </Pressable>
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
    planToggle: { flexDirection: 'row', gap: spacing.two, marginTop: spacing.four, alignSelf: 'center' },
    planPill: { paddingVertical: spacing.two, paddingHorizontal: spacing.four, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.line },
    planPillOn: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    planPillText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body },
    planPillTextOn: { color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '700' },
    trialLink: { marginTop: spacing.three, alignSelf: 'center' },
    trialLinkText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    trialNoteText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.two },
    ctaSpace: { marginTop: spacing.two },
    foot: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale },
    subStatus: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale },
    error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
    backLink: { alignSelf: 'center', marginTop: spacing.one },
    backLinkText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  });
