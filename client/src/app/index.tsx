import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { t } from '@/lib/locale';
import { loadOnboarded } from '@/lib/storage';
import { useThemedStyles } from '@/lib/theme-provider';

// The web first-touch front door (the completeness audit's Tier-1 conversion gap). The app itself lives at
// /today; this page leads with the feeling, shows a calm half-finished day, states the never-shame promise, then
// the loop and the payoff, and hands off with "Begin". Native users (already installed) and returning web users
// (already onboarded) skip straight to Today, so only a fresh web visitor, or a crawler, sees the marketing page.
// Design: the Claude Design "Dusk" landing, re-implemented on the live theme tokens so it follows light/dark and
// the completion tick matches the app's (a dark ink on sage, the AA-correct one, not the mock's white check).
const STEPS = [
  // Step 1's title deliberately reuses the launcher shortcut's words ("Empty your head"), so they share a key.
  { n: '1', title: t('widget.quickActionDumpSubtitle'), body: t('welcome.step1Body') },
  { n: '2', title: t('welcome.step2Title'), body: t('welcome.step2Body') },
  { n: '3', title: t('welcome.step3Title'), body: t('welcome.step3Body') },
];

type Styles = ReturnType<typeof makeStyles>;

// The wordmark glyph: two overlapping ticks, sage then mauve (DoubleDone). Decorative, hidden from the reader.
function Mark({ styles }: { styles: Styles }) {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.markC1}>✓</Text>
      <Text style={styles.markC2}>✓</Text>
    </View>
  );
}

export default function Landing() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    if (Platform.OS !== 'web') {
      router.replace('/today');
      return;
    }
    void loadOnboarded().then((done) => {
      if (!active) return;
      if (done) router.replace('/today');
      else setShow(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  // Blank (not the page) until we know whether to redirect, so a returning user never sees a flash of marketing.
  if (!show) return <View style={styles.blank} />;

  const begin = () => router.push('/today');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <View style={[styles.content, { paddingTop: insets.top + spacing.five }]}>
        <View style={styles.topbar}>
          <Mark styles={styles} />
          <Text style={styles.wordmark}>DoubleDone</Text>
        </View>

        {/* hero */}
        <View style={styles.hero}>
          <Text style={styles.kicker}>{t('welcome.kicker')}</Text>
          <Text style={styles.h1}>{t('welcome.heroHeadline')}</Text>
          <Text style={styles.sub}>{t('welcome.heroSub')}</Text>
          <PrimaryButton label={t('common.begin')} onPress={begin} accessibilityLabel={t('welcome.beginA11y')} style={styles.cta} />
          <Text style={styles.trust}>{t('welcome.trustLine')}</Text>

          {/* the Today screen, calm and half-finished */}
          <View
            style={styles.today}
            accessibilityRole="image"
            accessibilityLabel={t('welcome.todayMockA11y')}
          >
            <View style={styles.todayHead}>
              <Text style={styles.todayTitle}>{t('common.today')}</Text>
              <Text style={styles.todayDate}>{t('welcome.mockTodayDate')}</Text>
            </View>
            <View style={[styles.row, { marginTop: spacing.three }]}>
              <View style={[styles.check, styles.checkDone]}>
                <Text style={styles.checkTick}>✓</Text>
              </View>
              <Text style={[styles.task, styles.taskDone]}>{t('welcome.mockTask1')}</Text>
            </View>
            <View style={styles.ruleSoft} />
            <View style={styles.row}>
              <View style={[styles.check, styles.checkDone]}>
                <Text style={styles.checkTick}>✓</Text>
              </View>
              <Text style={[styles.task, styles.taskDone]}>{t('welcome.mockTask2')}</Text>
            </View>
            <View style={styles.ruleSoft} />
            <View style={styles.row}>
              <View style={[styles.check, styles.checkOpen]} />
              <Text style={styles.task}>{t('welcome.mockTask3')}</Text>
            </View>
            <View style={styles.rule} />
            <Text style={styles.todayFoot}>{t('welcome.revealRestWaiting')}</Text>
          </View>

          {/* the promise, given weight */}
          <View style={styles.promise}>
            <Text style={styles.promiseH}>{t('welcome.lead2')}</Text>
            <Text style={styles.promiseP}>{t('welcome.promiseBody')}</Text>
          </View>
        </View>

        {/* how a day goes */}
        <View style={styles.section}>
          <Text style={styles.secLabel}>{t('welcome.howLabel')}</Text>
          <Text style={styles.secH}>{t('welcome.howHeadline')}</Text>
          <View style={styles.steps}>
            {STEPS.map((s, i) => (
              <View key={s.n} style={[styles.step, i === 0 && styles.stepFirst]}>
                <Text style={styles.stepN}>{s.n}</Text>
                <View style={styles.stepText}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepBody}>{s.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* payoff */}
        <View style={styles.payoff}>
          <View style={styles.payoffDot}>
            <Text style={styles.checkTick}>✓</Text>
          </View>
          <Text style={styles.payoffH}>{t('welcome.keepHeading')}</Text>
          <Text style={styles.payoffP}>{t('welcome.payoffBody')}</Text>
        </View>

        {/* closing */}
        <View style={styles.closing}>
          <Text style={styles.closingLine}>{t('welcome.closingLine')}</Text>
          <PrimaryButton label={t('common.begin')} onPress={begin} accessibilityLabel={t('welcome.beginA11y')} />
          <Text style={styles.trust}>{t('welcome.trustLine')}</Text>
          {/* The stores (launched worldwide 2026-07-31). Official badge artwork, per both brand
              guidelines; the country-less links open each visitor's own storefront in their own
              language. This page is unreachable on native (the redirect above), so the Play badge
              can never appear inside the iOS app, which App Review would reject. */}
          <View style={styles.storeRow}>
            <Pressable
              onPress={() => Linking.openURL('https://apps.apple.com/app/doubledone/id6790136615')}
              accessibilityRole="link"
              accessibilityLabel={t('welcome.appStoreBadgeA11y')}
              style={({ pressed }) => [pressed && styles.badgePressed]}
            >
              <Image source={require('../../assets/store/app-store-badge.svg')} style={styles.appStoreBadge} resizeMode="contain" />
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL('https://play.google.com/store/apps/details?id=app.doubledone')}
              accessibilityRole="link"
              accessibilityLabel={t('welcome.playBadgeA11y')}
              style={({ pressed }) => [pressed && styles.badgePressed]}
            >
              <Image source={require('../../assets/store/google-play-badge.png')} style={styles.playBadge} resizeMode="contain" />
            </Pressable>
          </View>
          {/* Google's badge licence requires this attribution; it stays English in every locale
              (a trademark statement, like the legal pages, not UI copy). */}
          <Text style={styles.storeFine}>Google Play and the Google Play logo are trademarks of Google LLC.</Text>
        </View>

        {/* footer */}
        <View style={styles.footer}>
          <Text style={styles.footWho}>{t('welcome.footerWho')}</Text>
          <View style={styles.footMeta}>
            <Mark styles={styles} />
            <Text style={styles.wordmark}>DoubleDone</Text>
          </View>
          <Text style={styles.footFine}>{t('welcome.footerFine')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) => {
  // The design softens body copy below the primary ink (calmer long-form read); the rest maps to live tokens.
  const inkBody = t.scheme === 'dark' ? '#D8CEC0' : '#5F564C';
  const cardShadow = t.scheme === 'dark' ? '0px 24px 50px -28px rgba(0,0,0,0.55)' : '0px 24px 50px -28px rgba(43,39,34,0.30)';
  return StyleSheet.create({
    blank: { flex: 1, backgroundColor: t.colors.bg },
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { alignItems: 'center', paddingBottom: spacing.seven },
    content: { width: '100%', maxWidth: 600, paddingHorizontal: spacing.five },

    // top bar
    topbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, marginBottom: spacing.five },
    mark: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    markC1: { fontSize: 15 * t.scale, color: t.colors.done, fontFamily: fonts.bodyBold, fontWeight: '700' },
    markC2: { fontSize: 15 * t.scale, color: t.colors.accent, fontFamily: fonts.bodyBold, fontWeight: '700', marginLeft: -5 },
    wordmark: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', letterSpacing: 0.3 },

    // hero
    hero: { paddingTop: spacing.five, paddingBottom: spacing.six },
    kicker: { color: t.colors.accent, fontSize: 19 * t.scale, lineHeight: 25 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic', marginBottom: spacing.three },
    h1: { color: t.colors.ink, fontSize: 42 * t.scale, lineHeight: 46 * t.scale, fontFamily: fonts.sans, fontWeight: '600', letterSpacing: -0.6 },
    sub: { color: inkBody, fontSize: 19 * t.scale, lineHeight: 30 * t.scale, fontFamily: fonts.body, marginTop: spacing.four, maxWidth: 440 },
    cta: { marginTop: spacing.five },
    trust: { color: t.colors.inkSoft, fontSize: 14 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.three },

    // the Today mock
    today: {
      marginTop: spacing.six,
      backgroundColor: t.colors.surface,
      borderWidth: border.hair,
      borderColor: t.colors.line,
      borderRadius: radius.lg,
      padding: spacing.five,
      boxShadow: cardShadow,
    },
    todayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    todayTitle: { color: t.colors.ink, fontSize: 26 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    todayDate: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.body },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.three },
    check: { width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    checkDone: { backgroundColor: t.colors.done },
    checkOpen: { borderWidth: 2, borderColor: t.colors.inkFaint },
    checkTick: { color: t.colors.onDone, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', lineHeight: 15 * t.scale },
    task: { flex: 1, color: t.colors.ink, fontSize: 16 * t.scale, fontFamily: fonts.body },
    taskDone: { color: t.colors.inkSoft, textDecorationLine: 'line-through' },
    rule: { height: 1, backgroundColor: t.colors.line, marginVertical: spacing.three },
    ruleSoft: { height: 1, backgroundColor: t.colors.line, opacity: 0.5, marginVertical: spacing.three },
    todayFoot: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic', marginTop: spacing.four },

    // the promise
    promise: { marginTop: spacing.six, borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.five },
    promiseH: { color: t.colors.ink, fontSize: 32 * t.scale, lineHeight: 38 * t.scale, fontFamily: fonts.sans, fontWeight: '600', letterSpacing: -0.3 },
    promiseP: { color: inkBody, fontSize: 18 * t.scale, lineHeight: 28 * t.scale, fontFamily: fonts.body, marginTop: spacing.four, maxWidth: 460 },

    // how a day goes
    section: { marginTop: spacing.six },
    secLabel: { color: t.colors.inkSoft, fontSize: 13 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
    secH: { color: t.colors.ink, fontSize: 32 * t.scale, lineHeight: 38 * t.scale, fontFamily: fonts.sans, fontWeight: '600', marginTop: spacing.two },
    steps: { marginTop: spacing.four },
    step: { flexDirection: 'row', gap: spacing.four, paddingVertical: spacing.five, borderTopWidth: border.hair, borderTopColor: t.colors.line, alignItems: 'flex-start' },
    stepFirst: { borderTopWidth: 0 },
    stepN: { color: t.colors.inkFaint, fontSize: 40 * t.scale, lineHeight: 42 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    stepText: { flex: 1 },
    stepTitle: { color: t.colors.ink, fontSize: 23 * t.scale, lineHeight: 28 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    stepBody: { color: inkBody, fontSize: 17 * t.scale, lineHeight: 27 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },

    // payoff
    payoff: { marginTop: spacing.seven, alignItems: 'center' },
    payoffDot: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: t.colors.done, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.four },
    payoffH: { color: t.colors.ink, fontSize: 38 * t.scale, lineHeight: 42 * t.scale, fontFamily: fonts.sans, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
    payoffP: { color: inkBody, fontSize: 18 * t.scale, lineHeight: 29 * t.scale, fontFamily: fonts.body, marginTop: spacing.four, maxWidth: 420, textAlign: 'center' },

    // closing
    closing: { marginTop: spacing.six, marginBottom: spacing.six },
    // The store badges: Apple's SVG is exactly its artwork; Google's generic PNG carries
    // built-in padding, so it renders slightly taller for equal VISUAL height in the row.
    storeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.three, alignItems: 'center', justifyContent: 'center', marginTop: spacing.five },
    appStoreBadge: { width: 144, height: 48 },
    playBadge: { width: 140, height: 54 },
    badgePressed: { opacity: 0.7 },
    storeFine: { color: t.colors.inkFaint, fontSize: 11 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.three },
    closingLine: { color: t.colors.ink, fontSize: 30 * t.scale, lineHeight: 36 * t.scale, fontFamily: fonts.sans, fontWeight: '600', textAlign: 'center', marginBottom: spacing.five },

    // footer
    footer: { borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.five },
    footWho: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, maxWidth: 420 },
    footMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, marginTop: spacing.four },
    footFine: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
  });
};
