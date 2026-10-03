import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackLink } from '@/components/BackLink';
import { RoomBackRow } from '@/components/RoomTop';
import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, layout, radius, spacing, type Theme } from '@/constants/theme';
import { useSession } from '@/lib/auth';
import { weeklyAllowance } from '@/lib/entitlement';
import { buyCheck, needsBillingFix, purchaseGate } from '@/lib/iap';
import { t } from '@/lib/locale';
import { usePremium } from '@/lib/premium-provider';
import { manageRoute, premiumPrimaryAction, showsCancelReassurance, storeCopyKeys, trialSlot } from '@/lib/premium-ui';
import { buy, IAP_AVAILABLE, loadOffers, openStoreSubscriptions, restore, STORE_SOURCE, type StoreOffer } from '@/lib/purchases';
import { loadTrialUsed, saveTrialUsed } from '@/lib/storage';
import { PLAY_COPY, SELLS_HERE, STRIPE_HERE } from '@/lib/storefront';
import { loadEntitlementChecked, startCheckout, startPortal, startTrial } from '@/lib/stripe';
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

// The store's buy button shows only where this build sells at all. SELLS_HERE is true everywhere since Path A;
// reading it here too is what makes `SELLS_HERE = false` in storefront.android.ts a one-line Path C rollback.
const IAP = IAP_AVAILABLE && SELLS_HERE;
// The catalogue keys for every store-dependent line, chosen in one tested place (lib/premium-ui): Google
// Play's wording on Android, Apple's elsewhere. Never a fixed price, a discount or a dollar word on Android.
const COPY = storeCopyKeys(PLAY_COPY);
// Android sells only to a signed-in account, checked against RevenueCat before any charge (lib/iap
// purchaseGate, lib/purchases.android.ts). iOS must allow an anonymous purchase (App Review 5.1.1).
const REQUIRE_ACCOUNT = STORE_SOURCE === 'google';

// The Premium surface. Calm, never a hard wall: the free monthly keepsake is always
// honoured, and Premium is framed as "keep every week", not "unlock or lose". The
// server is the source of truth for premium status; this screen only reads it and
// starts a purchase: Stripe Checkout on the web (returns with ?status=success|cancelled),
// the App Store on iOS, Google Play on Android.
export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const { status, from } = useLocalSearchParams<{ status?: string; from?: string }>();
  // Which gate sent the reader here, said in one line under the title. Every gate passes its
  // reason (the flow audit, 2026-09-21: four different gates landed on an identical page that
  // never said why). Unknown or absent: no line, the page stands on its own.
  const fromFeature: string | null =
    from === 'sequence' ? t('actions.planMyDay')
    : from === 'chart' ? t('actions.chartACourse')
    : from === 'pin' ? t('today.pin')
    : from === 'insights' ? t('welcome.premiumPatternsName')
    : from === 'theme' ? t('premium.reasonTheme')
    : from === 'energy' ? t('premium.reasonEnergy')
    : from === 'ocr' || from === 'ocr_ours' ? t('premium.reasonScan')
    : from === 'free_monthly' ? t('premium.reasonScrapbook')
    : null;
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

  // --- In-app purchases (Apple on iOS, Google Play on Android). Every line below is inert on the web:
  // IAP_AVAILABLE is a compile-time false there (it comes from lib/purchases.ts, not a platform file), so
  // the Stripe path the web has always run is untouched by construction. Declared HERE, above the focus
  // effect that fills it, because that effect calls setOffers. ---
  const [offers, setOffers] = useState<StoreOffer[]>([]); // from the store's offering; empty on the web
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null); // the honest, visible outcome of a Restore tap

  // Re-check the entitlement when the screen gains focus, e.g. after returning from checkout.
  useFocusEffect(
    useCallback(() => {
      track('premium.viewed', { status: status ?? 'open' });
      refresh();
      // Re-read the store prices too, not just the entitlement. buy() fetches the offering AGAIN at
      // tap time, so a price read once on mount can drift from the price actually charged (a store
      // price change, or a storefront that resolved late). Refreshing here keeps the number on
      // screen and the number on the store's sheet the same read. No-op on the web.
      if (IAP) void loadOffers().then(setOffers);
    }, [status, refresh]),
  );

  // After a successful checkout the Stripe webhook can lag. Poll the provider until premium flips, then give
  // up after ~20s, but DON'T strand the user on "setting up": set `stuck` so the UI offers a Refresh and a
  // reassurance ("your payment went through"). The worst place to dead-end is right after taking money.
  const [stuck, setStuck] = useState(false);
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly'); // which price the checkout opens
  const [trialNote, setTrialNote] = useState<string | null>(null); // gentle note after a trial tap (e.g. already used)

  // Offers are loaded in the focus effect above (not once on mount), so the displayed price is a
  // fresh read every time the screen is seen.
  const offer = offers.find((o) => o.plan === plan);
  // What a screen reader hears for each plan and for the buy button. In a store build it is the store's
  // own price string, the same one on screen, never our "five dollars" (a spoken A$ figure is still an A$
  // figure to Play, and wrong for anyone outside Australia). Before the store answers, just the plan's name.
  // On the web, our own price, which is the price Stripe charges.
  function planA11y(p: 'monthly' | 'annual'): string {
    if (!IAP) return p === 'annual' ? t('premium.planAnnualA11y') : t('premium.planMonthlyA11y');
    const o = offers.find((x) => x.plan === p);
    if (!o) return p === 'annual' ? t(COPY.planAnnualNoPrice) : t(COPY.planMonthly);
    return t(p === 'annual' ? COPY.planAnnualA11y : COPY.planMonthlyA11y, { price: o.priceString });
  }
  function subscribeA11y(p: 'monthly' | 'annual'): string {
    if (!IAP) return p === 'annual' ? t('premium.subscribeAnnualA11y') : t('premium.subscribeMonthlyA11y');
    const o = offers.find((x) => x.plan === p);
    if (!o) return t('premium.goPremium');
    return t(p === 'annual' ? COPY.subscribeAnnualA11y : COPY.subscribeMonthlyA11y, { price: o.priceString });
  }
  // Which primary control the entitled panel shows. Pure and tested (lib/premium-ui): trial
  // converts where Stripe can (the web), comp gets a calm no-portal line, everyone else manages. On
  // Android only a Google Play subscription gets a button (it opens the Play Store); a Stripe or Apple
  // one gets a plain line, never a link to another biller (Play's Payments policy).
  const primaryAction = premiumPrimaryAction(effectiveEntitlement.status, IAP, SELLS_HERE, STRIPE_HERE, effectiveEntitlement.source);
  // The ?status= a Stripe checkout returns with, which a store purchase also sets to reuse the "setting up"
  // poll. A build that sells nothing (the Path C rollback) never starts either, so it never reads one.
  const payStatus = SELLS_HERE ? status : undefined;
  // What the store's buy button should do, given sign-in + entitlement state. On the web this is
  // always 'hidden' (IAP off), so the existing Stripe CTA renders instead.
  const gate = purchaseGate({
    iapAvailable: IAP,
    signedIn: Boolean(session),
    loading,
    premium,
    requireAccount: REQUIRE_ACCOUNT,
    status: effectiveEntitlement.status,
  });
  // Where the free month goes. Pure and tested (lib/premium-ui): in a store build it moves out from
  // under the buy button rather than disappearing.
  const slot = trialSlot({ signedIn: Boolean(session), iapAvailable: IAP });
  // In a build that sells nothing (the Path C rollback), the free month is the one thing this page offers, and
  // once this account has used it the link could only ever answer "already had it". Remembered per account (lib/storage), it
  // stops being offered: our own rule is never a control whose only outcome is a no. Web and iOS unchanged.
  const uid = session?.user?.id ?? null;
  const [trialUsed, setTrialUsed] = useState(false);
  useEffect(() => {
    if (SELLS_HERE || !uid) return;
    let live = true;
    void loadTrialUsed(uid).then((used) => {
      if (live) setTrialUsed(used);
    });
    return () => {
      live = false;
    };
  }, [uid]);
  // Seen mid-trial on this device: it has been used, whatever happens next.
  useEffect(() => {
    if (!SELLS_HERE && uid && effectiveEntitlement.status === 'trial') void saveTrialUsed(uid);
  }, [uid, effectiveEntitlement.status]);
  // A member whose payment is failing is not offered a free month right under the notice that their
  // subscription is paused (confusing, and the server would refuse it anyway). lib/iap needsBillingFix.
  const dunning = needsBillingFix(effectiveEntitlement.status);
  const offerTrial = slot === 'inline' && (SELLS_HERE || !trialUsed) && !dunning;
  useEffect(() => {
    if (payStatus !== 'success' || premium) return;
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
  }, [payStatus, premium, refresh]);

  // What to say to someone whose existing subscription has a payment failing, by who bills it. Google Play
  // retries on its own and the fix lives in the Play Store. A Stripe one is fixed in the portal where Stripe
  // may appear, and by writing to us where it may not (Android).
  function fixBillingLine(source: 'stripe' | 'apple' | 'google' | null): string {
    if (source === 'google') return t('premium.googlePaymentAttention');
    return STRIPE_HERE ? t('premium.errorBillingIssue') : t('premium.paymentAttentionPlain');
  }

  // A purchase through the store (RevenueCat: StoreKit on iOS, Play Billing on Android). The RevenueCat
  // webhook flips D1, then the existing success-poll below picks it up. The DOUBLE-CHARGE GUARD is the
  // fresh entitlement read right before buy(): a user who bought on the web (Stripe) and opens the app
  // reads as free until the server answers, and the store cannot know about that Stripe sub. The
  // provider's refresh() does not block the UI, so we re-read HERE, in this flow, before any charge, and
  // the read FAILS CLOSED (lib/iap buyCheck): if it cannot be read, nothing is started.
  async function subscribeStore() {
    const offer = offers.find((o) => o.plan === plan);
    if (!offer) {
      setError(t(COPY.unavailable));
      return;
    }
    const read = await loadEntitlementChecked();
    const check = buyCheck(read, Boolean(session));
    if (check === 'cant_check') {
      setError(t('premium.buyCouldNotCheck'));
      return;
    }
    if (check === 'already') {
      refresh(); // already entitled (Stripe, Apple, Google, trial, comp): never charge a second time
      return;
    }
    if (check === 'fix_billing') {
      refresh();
      setError(fixBillingLine(read.ok ? read.entitlement.source : null));
      return;
    }
    track('premium.checkout_started', { plan, store: STORE_SOURCE ?? 'none' });
    const res = await buy(offer.packageId, uid);
    if (res.ok) {
      router.setParams({ status: 'success' }); // reuse the existing "setting up" poll for the webhook lag
      refresh();
      return;
    }
    // A cancel shows nothing at all (the user backed out). Everything else gets a calm, specific line,
    // in the words of the store this build buys through.
    switch (res.code) {
      case 'cancelled':
        break;
      case 'pending':
        setError(t(COPY.pending));
        break;
      case 'already_owned':
        setError(t(COPY.alreadyOwned));
        break;
      case 'owned_elsewhere':
        setError(t(COPY.ownedElsewhere));
        break;
      case 'not_allowed':
        setError(t(COPY.notAllowed));
        break;
      case 'store_down':
        setError(t(COPY.storeDown));
        break;
      case 'unavailable':
        setError(t(COPY.unavailable));
        break;
      case 'sign_in':
        setError(t('premium.errorCheckoutSignIn'));
        break;
      case 'identity':
        setError(t('premium.purchaseIdentity'));
        break;
      case 'fix_billing':
        // Android: an Apple subscription still in Apple's billing retry, which our server reads as ended.
        // Apple charges the moment the card works, so a Google Play one now would charge twice. (Google's own
        // hold is never refused: buying again replaces it. purchaseHeldGoogle stays for that day's fallback.)
        setError(res.heldBy === 'apple' ? t('premium.purchaseHeldApple') : res.heldBy === 'google' ? t('premium.purchaseHeldGoogle') : t('premium.paymentAttentionPlain'));
        break;
      case 'network':
        // after the store took a payment, a network failure is the commonest way this ends: never "nothing was charged"
        setError(t(COPY.couldNotFinish));
        break;
      case 'already_premium':
        // the store already sees Premium on this account (a webhook still on its way, or an Apple
        // subscription on it): no charge, and the screen re-reads
        refresh();
        setError(t('premium.purchaseAlreadyActive'));
        break;
      default:
        setError(t(COPY.couldNotFinish));
    }
  }

  async function subscribe() {
    if (busy || !SELLS_HERE) return;
    setBusy(true);
    setError(null);
    if (IAP) {
      await subscribeStore();
      setBusy(false);
      return;
    }
    track('premium.checkout_started', { plan });
    const res = await startCheckout(plan);
    if (!res.ok) {
      setError(
        res.error === 'sign_in'
          ? t('premium.errorCheckoutSignIn')
          : res.error === 'already'
            ? t('premium.errorAlreadyPremium')
            : res.error === 'billing_issue'
              ? t('premium.errorBillingIssue') // dunning: the fix is the card, never a second subscription
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

  // Restore a purchase already made on this Apple ID or Google account. On iOS no sign-in is required
  // (App Review 5.1.1, same rule as Buy): the receipt lives with the Apple ID, and since the provider
  // merges the DEVICE's entitlement (localPremium), an anonymous restore genuinely unlocks Premium here
  // and now. On Android it needs the account it will belong to, so the link shows only when signed in.
  // Always shows a visible, honest outcome (a store rejects a Restore that appears to do nothing), and it
  // reads the code: a purchase that belongs to another DoubleDone account says so, rather than "failed".
  async function restorePurchases() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRestoreMsg(t('premium.restoring'));
    track('premium.restore_tapped');
    const res = await restore(uid);
    setBusy(false);
    if (res.ok && res.premium) {
      setRestoreMsg(t('premium.restoreRestored'));
      refresh();
    } else if (res.ok) {
      setRestoreMsg(t(COPY.restoreNothing));
    } else if (res.code === 'owned_elsewhere') {
      setRestoreMsg(t(COPY.ownedElsewhere));
    } else if (res.code === 'identity') {
      setRestoreMsg(t('premium.purchaseIdentity'));
    } else {
      setRestoreMsg(t('premium.restoreFailed'));
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
      setTrialNote(SELLS_HERE ? t(COPY.trialAlreadyUsed) : t('premium.trialAlreadyUsedPlain'));
      if (!SELLS_HERE && uid) {
        void saveTrialUsed(uid);
        setTrialUsed(true); // the link goes; its answer stays on screen for this visit
      }
      return;
    }
    if (!SELLS_HERE && uid) void saveTrialUsed(uid);
    track('premium.trial_started');
    refresh();
  }

  async function manage() {
    if (busy || !SELLS_HERE) return;
    track('premium.manage_opened');
    // Each store's subscription is managed only in that store (lib/premium-ui manageRoute): opened where
    // it can open, and named, with no link, everywhere else, rather than 404ing Stripe's portal.
    const route = manageRoute(effectiveEntitlement.source, Platform.OS);
    if (route === 'apple-sheet') {
      if (IAP) void openStoreSubscriptions(); // Apple's own Manage Subscriptions sheet
      else setError(t('premium.appleManageElsewhere'));
      return;
    }
    if (route === 'apple-elsewhere') {
      setError(t('premium.appleManageElsewhere'));
      return;
    }
    if (route === 'google-play') {
      // The Play Store's own subscription screen, where Google lets them change or cancel it. It opens
      // even if the store SDK never configured, from Google's own page for this app.
      void openStoreSubscriptions();
      return;
    }
    if (route === 'google-elsewhere') {
      setError(t('premium.googleManageElsewhere'));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await startPortal();
    if (!res.ok) {
      // 'no_subscription' means premium with no Stripe customer (a comp, or the dev override):
      // there is genuinely nothing to manage, so never show a retry-implying error for it.
      setError(
        res.error === 'sign_in'
          ? t('premium.errorPortalSignIn')
          : res.error === 'no_subscription'
            ? t('premium.nothingToManage')
            : t('premium.errorPortalFailed'),
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.three }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {from === 'menu' ? <RoomBackRow origin="menu" bare /> : <BackLink />}
        <Text style={styles.title}>{t('common.premium')}</Text>
        {fromFeature ? <Text style={styles.fromLine}>{t('premium.fromLine', { feature: fromFeature })}</Text> : null}

        {loading ? (
          <ActivityIndicator color={styles.spinner.color} style={styles.loadingPad} />
        ) : premium ? (
          <View style={styles.panel}>
            {/* The heading, sub-status and primary control key on the ENTITLEMENT status, never on
                `status` (which is the URL's ?status= param and only ever 'success'/'cancelled').
                Reading the URL here is the bug that told trial users they were fully Premium and
                offered them a Manage button that could only 404. */}
            <Text style={styles.panelHead}>{effectiveEntitlement.status === 'trial' ? t('premium.headTrialActive') : t('premium.headPremiumActive')}</Text>
            <Text style={styles.body}>
              {/* Android's free month: no "more the longer you stay" and no thanks for keeping DoubleDone
                  independent, both of which lean on a subscription this app cannot sell. */}
              {!SELLS_HERE && effectiveEntitlement.status === 'trial'
                ? t('premium.unlockedBodyTrialPlain')
                : allowance === 1
                ? t('premium.unlockedBodyOneGrowing', { allowance })
                : allowance < 4
                  ? t('premium.unlockedBodyGrowing', { allowance })
                  : t('premium.unlockedBodyFull', { allowance })}
            </Text>
            {effectiveEntitlement.status === 'trial' && periodLabel ? (
              <Text style={styles.subStatus}>{SELLS_HERE ? t(COPY.trialUntil, { periodLabel }) : t('premium.trialUntilPlain', { periodLabel })}</Text>
            ) : effectiveEntitlement.cancelAtPeriodEnd && periodLabel ? (
              <Text style={styles.subStatus}>{t('premium.premiumUntil', { periodLabel })}</Text>
            ) : periodLabel ? (
              <Text style={styles.subStatus}>{t('premium.renews', { periodLabel })}</Text>
            ) : null}
            {/* A Google Play payment that has not gone through: Premium stays on while Google retries (the
                server keeps it on through the grace period), and the fix is in the Play Store. Said here,
                because nobody in that state ever sees the free panel's dunning box. */}
            {effectiveEntitlement.source === 'google' && needsBillingFix(effectiveEntitlement.status) ? (
              <View style={styles.attentionBox}>
                <Text style={styles.attentionText}>{t('premium.googlePaymentAttention')}</Text>
              </View>
            ) : null}
            <Text style={styles.foot}>
              {showsCancelReassurance(effectiveEntitlement.status, effectiveEntitlement.cancelAtPeriodEnd)
                ? t('premium.freeScrapbookEvenIfCancel')
                : t('premium.footPlain')}
            </Text>
            {primaryAction === 'convert' ? (
              // The card-free trial converts via Stripe checkout (the server's already-subscribed
              // guard deliberately lets a trial through), at EITHER cadence: the annual was
              // structurally unreachable here (the toggle lived only on the free paywall while
              // `plan` sat on its monthly default), and a trial member reporting they could not
              // BUY the year (2026-08-01) is what surfaced it. Web and Android only: on iOS
              // StoreKit refuses a second purchase while premium and the trial never auto-charges,
              // so there is nothing actionable mid-trial and the "Free until {date}" line carries it.
              <>
                <View style={styles.planToggle}>
                  <Pressable
                    onPress={() => setPlan('monthly')}
                    accessibilityRole="button"
                    aria-selected={plan === 'monthly'}
                    accessibilityLabel={t('premium.planMonthlyA11y')}
                    style={[styles.planPill, plan === 'monthly' && styles.planPillOn]}
                  >
                    <Text style={[styles.planPillText, plan === 'monthly' && styles.planPillTextOn]}>{t('premium.planMonthly')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPlan('annual')}
                    accessibilityRole="button"
                    aria-selected={plan === 'annual'}
                    accessibilityLabel={t('premium.planAnnualA11y')}
                    style={[styles.planPill, plan === 'annual' && styles.planPillOn]}
                  >
                    <Text style={[styles.planPillText, plan === 'annual' && styles.planPillTextOn]}>{t('premium.planAnnual')}</Text>
                  </Pressable>
                </View>
                <Text style={styles.price}>{plan === 'annual' ? t('premium.priceAnnual') : t('premium.priceMonthly')}</Text>
                <PrimaryButton
                  label={busy ? t('premium.openingCheckout') : t('premium.goPremiumKeepIt')}
                  onPress={subscribe}
                  disabled={busy}
                  accessibilityLabel={plan === 'annual' ? t('premium.subscribeAnnualA11y') : t('premium.subscribeMonthlyA11y')}
                  style={styles.ctaSpace}
                />
              </>
            ) : primaryAction === 'nothing' ? (
              // A comp / allowlisted account is premium with no Stripe customer, so no portal
              // exists. Never render a Manage button whose only outcome is a 404: say so calmly.
              <Text style={styles.subStatus}>{t('premium.nothingToManage')}</Text>
            ) : primaryAction === 'elsewhere' ? (
              // On Android, a subscription another biller owns: a plain line saying where it lives, never a
              // link (Play's Payments policy). Already set to end (the "Premium until" line says when):
              // nothing left to manage, so nothing. A Google one only lands here in the Path C rollback.
              effectiveEntitlement.source === 'apple' ? (
                <Text style={styles.subStatus}>{t('premium.appleManageElsewhere')}</Text>
              ) : effectiveEntitlement.source === 'google' ? (
                <Text style={styles.subStatus}>{t('premium.googleManageElsewhere')}</Text>
              ) : effectiveEntitlement.cancelAtPeriodEnd ? null : (
                <Text style={styles.subStatus}>{t('premium.manageWhereBought')}</Text>
              )
            ) : primaryAction === 'manage' ? (
              <PrimaryButton
                label={busy ? t('premium.opening') : t('premium.manageSubscription')}
                onPress={manage}
                disabled={busy}
                accessibilityLabel={t('premium.manageSubscriptionA11y')}
                style={styles.ctaSpace}
              />
            ) : null}
            {from === 'chart' && router.canGoBack() ? (
              <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.goBack')} hitSlop={8} style={styles.backLink}>
                <Text style={styles.backLinkText}>‹ {t('actions.chartACourse')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.dismissTo('/today')} accessibilityRole="button" accessibilityLabel={t('common.backToToday')} hitSlop={8} style={styles.backLink}>
                <Text style={styles.backLinkText}>{t('common.backToToday')}</Text>
              </Pressable>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.panel}>
            {payStatus === 'success' ? (
              stuck ? (
                <>
                  <Text style={styles.note}>{t('premium.stuckNote')}</Text>
                  <PrimaryButton label={t('common.refresh')} onPress={refresh} accessibilityLabel={t('premium.refreshA11y')} style={styles.ctaSpace} />
                  <Text style={styles.foot}>{t('premium.stuckFoot')}</Text>
                </>
              ) : (
                <Text style={styles.note}>{t('premium.settingUp')}</Text>
              )
            ) : payStatus === 'cancelled' ? (
              <Text style={styles.note}>{t('premium.checkoutCancelled')}</Text>
            ) : null}

            {/* Dunning: the subscription still exists at Stripe but a payment is failing, so
                premium reads false and this user lands on the upsell. Without this block they
                would have NO path to fix their card from here (the server now refuses them a
                second checkout, correctly). The fix lives in the portal; manage() routes there
                for a Stripe source, and the customer id exists in this state so it opens. */}
            {dunning ? (
              <View style={styles.attentionBox}>
                {STRIPE_HERE ? (
                  <>
                    <Text style={styles.attentionText}>{t('premium.paymentAttention')}</Text>
                    <Pressable onPress={manage} disabled={busy} accessibilityRole="button" accessibilityLabel={t('premium.paymentAttentionLinkA11y')} hitSlop={6}>
                      <Text style={styles.attentionLink}>{t('premium.paymentAttentionLink')}</Text>
                    </Pressable>
                  </>
                ) : (
                  // Android: the same news, and a person to write to, but no link to Stripe's card form.
                  <Text style={styles.attentionText}>{t('premium.paymentAttentionPlain')}</Text>
                )}
              </View>
            ) : null}

            <Text style={styles.panelHead}>{t('premium.upsellHead')}</Text>
            <Text style={styles.body}>
              {t('premium.upsellBody')}
            </Text>

            <View style={styles.featureList}>
              {[
                t('premium.featureScan'),
                t('premium.featurePin'),
                t('premium.featureThemes'),
                t('premium.featureScrapbook'),
                t('premium.featurePatterns'),
                t('premium.featureChart'),
                t('premium.featurePlanMyDay'),
                t('premium.featureEnergy'),
              ].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <View style={styles.featureDot} />
                  <Text style={styles.feature}>{f}</Text>
                </View>
              ))}
              <Text style={styles.featureMore}>{t('premium.featureMore')}</Text>
            </View>

            {/* "Grows the longer you stay" means staying subscribed, which the Android app cannot offer:
                longing with no path for the person, a loyalty pitch to a reviewer. The feature list above
                already names the weekly scrapbook. */}
            {SELLS_HERE ? (
              <>
                <Text style={styles.keepsakeNote}>{t('premium.scrapbookGrows')}</Text>
                <View style={styles.tiers}>
                  <Text style={styles.tier}>{t('premium.tierOneAWeek')}</Text>
                  <Text style={styles.tierArrow}>→</Text>
                  <Text style={styles.tier}>{t('premium.tierTwoAfterTwoMonths')}</Text>
                  <Text style={styles.tierArrow}>→</Text>
                  <Text style={styles.tier}>{t('premium.tierFourAfterSixMonths')}</Text>
                </View>
              </>
            ) : null}

            {/* The plans are information, so a signed-out visitor sees them too (the flow audit:
                the page ended at "A$5 / month" and never mentioned annual existed). Only the
                purchase itself needs a session. None of it in a build that sells nothing (the Path C
                rollback): a price, a discount or a spoken dollar amount is exactly what Play rejected. */}
            {SELLS_HERE ? (
            <>
            <View style={styles.planToggle}>
                <Pressable
                  onPress={() => setPlan('monthly')}
                  accessibilityRole="button"
                  aria-selected={plan === 'monthly'}
                  accessibilityLabel={planA11y('monthly')}
                  style={[styles.planPill, plan === 'monthly' && styles.planPillOn]}
                >
                  <Text style={[styles.planPillText, plan === 'monthly' && styles.planPillTextOn]}>{t(COPY.planMonthly)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPlan('annual')}
                  accessibilityRole="button"
                  aria-selected={plan === 'annual'}
                  accessibilityLabel={planA11y('annual')}
                  style={[styles.planPill, plan === 'annual' && styles.planPillOn]}
                >
                  <Text style={[styles.planPillText, plan === 'annual' && styles.planPillTextOn]}>{t(COPY.planAnnual)}</Text>
                </Pressable>
            </View>
            {/* In a store build the price MUST come from the store, so it is currency-correct for the
                viewer's country (A$5.00 in Australia, Play's or Apple's own price elsewhere). The annual
                plan is shown as a yearly price, never dressed up as a monthly one. On the web, our own. */}
            <Text style={styles.price}>
              {IAP
                ? offer
                  ? plan === 'annual'
                    ? t(COPY.perYear, { price: offer.priceString })
                    : t(COPY.perMonth, { price: offer.priceString })
                  : t(COPY.unavailable)
                : plan === 'annual'
                  ? t('premium.priceAnnual')
                  : t('premium.priceMonthly')}
            </Text>
            </>
            ) : null}

            {/* The buy button never requires an account on iOS (App Review 5.1.1(v), 2026-07-28:
                forced registration before a non-account IAP was rejected). 'buy' and 'wait' both
                render the purchase button (wait = the signed-in double-charge window, disabled).
                Android requires an account ('sign_in'), and a failing payment on an existing
                subscription shows no buy button at all ('fix_billing': the box above says what to
                do). The web keeps its sign-in-first Stripe flow, which Stripe genuinely needs. */}
            {gate === 'buy' || gate === 'wait' ? (
              <PrimaryButton
                label={busy ? t('premium.openingCheckout') : t('premium.goPremium')}
                onPress={subscribe}
                disabled={busy || gate === 'wait' || !offer}
                accessibilityLabel={subscribeA11y(plan)}
                style={styles.ctaSpace}
              />
            ) : gate === 'sign_in' ? (
              <PrimaryButton
                label={t('premium.signInToGoPremium')}
                onPress={() => router.push('/sign-in')}
                accessibilityLabel={t('premium.signInToGoPremium')}
                style={styles.ctaSpace}
              />
            ) : gate === 'fix_billing' ? null : !SELLS_HERE ? (
              // A build that sells nothing (the Path C rollback): no buy button. Signed out, the one thing to take is the free month,
              // which needs an account; the foot line tells an existing member they get theirs by signing in
              // too. Signed in, the free month sits below and there is nothing to buy.
              session ? null : (
                <PrimaryButton
                  label={t('premium.signInForTrial')}
                  onPress={() => router.push('/sign-in')}
                  accessibilityLabel={t('premium.signInForTrial')}
                  style={styles.ctaSpace}
                />
              )
            ) : session ? (
              <PrimaryButton
                label={busy ? t('premium.openingCheckout') : t('premium.goPremium')}
                onPress={subscribe}
                disabled={busy}
                accessibilityLabel={subscribeA11y(plan)}
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
            {offerTrial && (
              <Pressable
                onPress={startFreeTrial}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={SELLS_HERE ? t('premium.trialLinkA11y') : t('premium.trialLinkPlainA11y')}
                hitSlop={6}
                style={styles.trialLink}
              >
                <Text style={styles.trialLinkText}>{SELLS_HERE ? t('premium.trialLink') : t('premium.trialLinkPlain')}</Text>
              </Pressable>
            )}
            {/* Android: the free month is the one thing on this page you can take, so it says what it is
                (no card, never a subscription), which is also the reviewer's first question. */}
            {offerTrial && !SELLS_HERE ? <Text style={styles.foot}>{t('premium.trialNoCardPlain')}</Text> : null}
            {slot === 'inline' && trialNote ? <Text style={styles.trialNoteText}>{trialNote}</Text> : null}
            {/* Signed-out on iOS gets Apple's suggested explanation instead of the account
                pitch: no account is needed, signing in extends Premium to other devices, and
                an existing web subscriber is pointed to sign in BEFORE buying (the double-charge
                guard as information, now that 5.1.1 forbids it as a wall). Android needs the
                account, so it gets the account line. */}
            <Text style={styles.foot}>
              {session
                ? SELLS_HERE
                  ? t('premium.footSignedIn')
                  : t('premium.footPlain')
                : IAP
                  ? REQUIRE_ACCOUNT
                    ? t('premium.footSignedOut')
                    : t('premium.footAnonymousIap')
                  : SELLS_HERE
                    ? t('premium.footSignedOut')
                    : t('premium.footSignedOutPlain')}
            </Text>

            {IAP ? (
              // Both stores want the paywall itself to carry how it renews and how to cancel, and Apple
              // wants functional Terms + Privacy links (Schedule 2 §3.8(b)). Price + period are shown above,
              // from the store. Google's line says "charged every month (or year)" and names Google Play, on
              // this localised screen, because the Terms page is English only. A visible Restore is here too
              // (Apple rejects a paywall with no restore path). No Stripe, ever, in this block.
              <>
                <Text style={styles.foot}>{t(plan === 'annual' ? COPY.renewsAnnual : COPY.renewsMonthly)}</Text>
                <Text style={styles.foot}>{t(COPY.storeNote)}</Text>
                {PLAY_COPY ? (
                  // Google Play's own subscriptions screen, where a subscription is managed or cancelled.
                  <Pressable onPress={() => void openStoreSubscriptions()} accessibilityRole="button" accessibilityLabel={t('premium.googleSubscriptionsLinkA11y')} hitSlop={6}>
                    <Text style={styles.legalLink}>{t('premium.googleSubscriptionsLink')}</Text>
                  </Pressable>
                ) : null}
                <View style={styles.legalRow}>
                  <Pressable onPress={() => router.push('/terms')} accessibilityRole="button" accessibilityLabel={t('premium.termsLinkA11y')} hitSlop={6}>
                    <Text style={styles.legalLink}>{t('premium.termsLink')}</Text>
                  </Pressable>
                  <Text style={styles.foot}>·</Text>
                  <Pressable onPress={() => router.push('/privacy')} accessibilityRole="button" accessibilityLabel={t('premium.privacyLinkA11y')} hitSlop={6}>
                    <Text style={styles.legalLink}>{t('premium.privacyLink')}</Text>
                  </Pressable>
                </View>
                {/* On Android a restore needs the account it will belong to, so signed out it is not
                    offered: a control whose only outcome is "sign in first" is not a control. */}
                {REQUIRE_ACCOUNT && !session ? null : (
                  <Pressable
                    onPress={restorePurchases}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('premium.restorePurchasesA11y')}
                    hitSlop={6}
                    style={styles.restoreLink}
                  >
                    <Text style={styles.restoreLinkText}>{t('premium.restorePurchases')}</Text>
                  </Pressable>
                )}
                {restoreMsg ? <Text style={styles.trialNoteText}>{restoreMsg}</Text> : null}
                {/* The free month, in its OWN zone rather than twelve pixels under a button that
                    takes real money. Same offer, same tap, just not sitting where a thumb reaching
                    for one thing lands on the other. */}
                {slot === 'separated' && !dunning && (
                  <View style={styles.trialZone}>
                    <Pressable
                      onPress={startFreeTrial}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={t(COPY.trialLinkA11y)}
                      hitSlop={6}
                    >
                      <Text style={styles.trialLinkText}>{t(COPY.trialLink)}</Text>
                    </Pressable>
                    <Text style={styles.foot}>{t(COPY.trialNoCard)}</Text>
                    {trialNote ? <Text style={styles.trialNoteText}>{trialNote}</Text> : null}
                  </View>
                )}
              </>
            ) : SELLS_HERE && STRIPE_HERE ? (
              <Pressable
                onPress={() => router.push('/terms')}
                accessibilityRole="button"
                accessibilityLabel={t('premium.termsLinkA11y')}
                hitSlop={6}
              >
                <Text style={styles.foot}>{t('premium.billedViaStripe')}</Text>
              </Pressable>
            ) : null}
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
    fromLine: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', marginTop: spacing.two },
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
    // The dunning notice (same calm accent wash as `note`, but a container: a line + a link).
    attentionBox: { backgroundColor: t.colors.accentSoft, borderRadius: radius.md, padding: spacing.three, gap: spacing.two },
    attentionText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale },
    attentionLink: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', textDecorationLine: 'underline' },
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
    // Its own zone: a rule above it and real space, so it reads as a separate offer rather than a
    // footnote to the buy button.
    trialZone: {
      marginTop: spacing.six,
      paddingTop: spacing.five,
      borderTopWidth: border.hair,
      borderTopColor: t.colors.line,
      alignItems: 'center',
      gap: spacing.one,
    },
    trialLinkText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    trialNoteText: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.two },
    // iOS Apple-disclosure block: the Terms · Privacy row (required, functional links) and the
    // visible Restore control.
    legalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, marginTop: spacing.one },
    legalLink: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600', textDecorationLine: 'underline' },
    restoreLink: { marginTop: spacing.three, alignSelf: 'center' },
    restoreLinkText: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
    ctaSpace: { marginTop: spacing.two },
    foot: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, lineHeight: 20 * t.scale },
    subStatus: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.body, lineHeight: 22 * t.scale },
    error: { color: t.colors.accent, fontSize: 14 * t.scale, fontFamily: fonts.body },
    backLink: { alignSelf: 'center', marginTop: spacing.one },
    backLinkText: { color: t.colors.inkSoft, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '600' },
  });
