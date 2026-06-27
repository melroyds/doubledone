import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { border, fonts, radius, spacing, type Theme } from '@/constants/theme';
import { loadOnboarded } from '@/lib/storage';
import { useThemedStyles } from '@/lib/theme-provider';

// The web first-touch front door (the completeness audit's Tier-1 conversion gap). The app itself lives at
// /today; this page leads with the feeling, shows a calm half-finished day, states the never-shame promise, then
// the loop and the payoff, and hands off with "Begin". Native users (already installed) and returning web users
// (already onboarded) skip straight to Today, so only a fresh web visitor, or a crawler, sees the marketing page.
// Design: the Claude Design "Dusk" landing, re-implemented on the live theme tokens so it follows light/dark and
// the completion tick matches the app's (a dark ink on sage, the AA-correct one, not the mock's white check).
const STEPS = [
  { n: '1', title: 'Empty your head', body: 'Type or speak everything weighing on you. The AI sorts it into a doable today and tucks the rest away.' },
  { n: '2', title: 'Work the day', body: 'Stuck on something big? Break it into first steps. Drowning? Lighten the day in one tap.' },
  { n: '3', title: 'Close it gently', body: "Each evening, close the day. It honours what you did, never what you didn't. Tomorrow opens fresh." },
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
          <Text style={styles.kicker}>for when the list is too much</Text>
          <Text style={styles.h1}>Today is finite and achievable.</Text>
          <Text style={styles.sub}>
            If a to-do list has ever felt like too much, you can put it down here. DoubleDone shows you only what today needs, and
            quietly keeps everything you finish.
          </Text>
          <PrimaryButton label="Begin" onPress={begin} accessibilityLabel="Begin, open DoubleDone" style={styles.cta} />
          <Text style={styles.trust}>Free. No account needed. Works offline.</Text>

          {/* the Today screen, calm and half-finished */}
          <View
            style={styles.today}
            accessibilityRole="image"
            accessibilityLabel="The Today screen: two finished tasks, Call the pharmacy and Reply to Dana, and one still to do, Start the tax folder. The rest is waiting calmly for later."
          >
            <View style={styles.todayHead}>
              <Text style={styles.todayTitle}>Today</Text>
              <Text style={styles.todayDate}>Thursday 27</Text>
            </View>
            <View style={[styles.row, { marginTop: spacing.three }]}>
              <View style={[styles.check, styles.checkDone]}>
                <Text style={styles.checkTick}>✓</Text>
              </View>
              <Text style={[styles.task, styles.taskDone]}>Call the pharmacy</Text>
            </View>
            <View style={styles.ruleSoft} />
            <View style={styles.row}>
              <View style={[styles.check, styles.checkDone]}>
                <Text style={styles.checkTick}>✓</Text>
              </View>
              <Text style={[styles.task, styles.taskDone]}>Reply to Dana about the lease</Text>
            </View>
            <View style={styles.ruleSoft} />
            <View style={styles.row}>
              <View style={[styles.check, styles.checkOpen]} />
              <Text style={styles.task}>Start the tax folder</Text>
            </View>
            <View style={styles.rule} />
            <Text style={styles.todayFoot}>The rest is waiting calmly for later.</Text>
          </View>

          {/* the promise, given weight */}
          <View style={styles.promise}>
            <Text style={styles.promiseH}>Nothing is ever overdue. It just waits.</Text>
            <Text style={styles.promiseP}>And nothing here will ever shame you for a task simply existing. No streaks, no guilt, no red.</Text>
          </View>
        </View>

        {/* how a day goes */}
        <View style={styles.section}>
          <Text style={styles.secLabel}>How a day goes</Text>
          <Text style={styles.secH}>Three calm steps, start to rest.</Text>
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
          <Text style={styles.payoffH}>What you finish, you keep.</Text>
          <Text style={styles.payoffP}>
            Everything you complete gathers in your Lookback, even a task you dreaded for weeks. Your brain can&apos;t tell you that you did
            nothing.
          </Text>
        </View>

        {/* closing */}
        <View style={styles.closing}>
          <Text style={styles.closingLine}>When you&apos;re ready, start with today.</Text>
          <PrimaryButton label="Begin" onPress={begin} accessibilityLabel="Begin, open DoubleDone" />
          <Text style={styles.trust}>Free. No account needed. Works offline.</Text>
        </View>

        {/* footer */}
        <View style={styles.footer}>
          <Text style={styles.footWho}>Made for ADHD, autism, OCD, and anyone whose list has ever felt like too much.</Text>
          <View style={styles.footMeta}>
            <Mark styles={styles} />
            <Text style={styles.wordmark}>DoubleDone</Text>
          </View>
          <Text style={styles.footFine}>An installable app that works offline. Today is finite and achievable.</Text>
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
    closingLine: { color: t.colors.ink, fontSize: 30 * t.scale, lineHeight: 36 * t.scale, fontFamily: fonts.sans, fontWeight: '600', textAlign: 'center', marginBottom: spacing.five },

    // footer
    footer: { borderTopWidth: border.hair, borderTopColor: t.colors.line, paddingTop: spacing.five },
    footWho: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, maxWidth: 420 },
    footMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.two, marginTop: spacing.four },
    footFine: { color: t.colors.inkFaint, fontSize: 13 * t.scale, lineHeight: 20 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
  });
};
