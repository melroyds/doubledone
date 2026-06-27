import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { fonts, radius, spacing, type Theme } from '@/constants/theme';
import { loadOnboarded } from '@/lib/storage';
import { useThemedStyles } from '@/lib/theme-provider';

// The web first-touch front door (the completeness audit's Tier-1 conversion gap). The app itself lives at
// /today; this page states the spine, the audience, the never-shame promise, and the loop, then hands off with
// "Begin". Native users (already installed) and returning web users (already onboarded) skip straight to Today,
// so only a fresh web visitor, or a crawler, sees the marketing page.
const LOOP = [
  {
    title: 'Empty your head',
    body: 'Type or speak everything weighing on you. The AI sorts it into a doable today, and tucks the rest away for later.',
  },
  {
    title: 'Work the day',
    body: 'Stuck on something big? Break it into first steps. Drowning? Lighten the day in one tap. The tools meet you where you are.',
  },
  {
    title: 'Close it gently',
    body: "Each evening, close the day. It honours what you did, never what you didn't. Tomorrow opens fresh.",
  },
];

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
          <Text style={styles.wordmark}>DoubleDone</Text>
          <Text style={styles.domain}>doubledone.app</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.h1}>Today is finite and achievable.</Text>
          <Text style={styles.sub}>
            A calm, never-shame daily to-do app. It shows you only what today needs, and quietly keeps everything you finish.
          </Text>
          <PrimaryButton label="Begin" onPress={begin} accessibilityLabel="Begin, open DoubleDone" style={styles.cta} />
          <Text style={styles.fine}>Free. No account needed. Works offline.</Text>
          <Text style={styles.audience}>Made for ADHD, autism, OCD, and anyone whose list has ever felt like too much.</Text>
        </View>

        <View style={styles.promise}>
          <Text style={styles.promiseText}>
            Nothing is ever overdue. It just waits. And nothing here will ever shame you for a task simply existing.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>How a day goes</Text>
          {LOOP.map((s) => (
            <View key={s.title} style={styles.step}>
              <View style={styles.dot} />
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepBody}>{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.payoffTitle}>What you finish, you keep.</Text>
          <Text style={styles.stepBody}>
            Everything you complete gathers in your Lookback, even a task you dreaded for weeks. Your brain can&apos;t tell you that you
            did nothing.
          </Text>
        </View>

        <View style={styles.closing}>
          <PrimaryButton label="Begin" onPress={begin} accessibilityLabel="Begin, open DoubleDone" />
          <Text style={styles.foot}>today is finite and achievable</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    blank: { flex: 1, backgroundColor: t.colors.bg },
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { alignItems: 'center', paddingBottom: spacing.seven },
    content: { width: '100%', maxWidth: 640, paddingHorizontal: spacing.five },
    topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.seven },
    wordmark: { color: t.colors.ink, fontSize: 21 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    domain: { color: t.colors.inkFaint, fontSize: 14 * t.scale, fontFamily: fonts.body },
    hero: { marginBottom: spacing.six },
    h1: { color: t.colors.ink, fontSize: 38 * t.scale, lineHeight: 44 * t.scale, fontFamily: fonts.sans, fontWeight: '600', letterSpacing: -0.5 },
    sub: { color: t.colors.inkSoft, fontSize: 18 * t.scale, lineHeight: 27 * t.scale, fontFamily: fonts.body, marginTop: spacing.four, maxWidth: 460 },
    cta: { marginTop: spacing.five },
    fine: { color: t.colors.inkFaint, fontSize: 14 * t.scale, fontFamily: fonts.body, marginTop: spacing.three },
    audience: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 22 * t.scale, fontFamily: fonts.body, marginTop: spacing.five },
    promise: { backgroundColor: t.colors.accentSoft, borderRadius: radius.lg, padding: spacing.six, marginBottom: spacing.six },
    promiseText: { color: t.colors.accent, fontSize: 21 * t.scale, lineHeight: 30 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic' },
    section: { marginBottom: spacing.six },
    eyebrow: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.four },
    step: { flexDirection: 'row', gap: spacing.four, marginBottom: spacing.five },
    dot: { width: 11, height: 11, borderRadius: radius.pill, backgroundColor: t.colors.accent, marginTop: 7 },
    stepText: { flex: 1 },
    stepTitle: { color: t.colors.ink, fontSize: 20 * t.scale, fontFamily: fonts.sans, fontWeight: '600' },
    stepBody: { color: t.colors.inkSoft, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, fontFamily: fonts.body, marginTop: spacing.one },
    payoffTitle: { color: t.colors.ink, fontSize: 22 * t.scale, fontFamily: fonts.sans, fontWeight: '600', marginBottom: spacing.two },
    closing: { alignItems: 'center', marginTop: spacing.two, gap: spacing.four },
    foot: { color: t.colors.accent, fontSize: 16 * t.scale, fontFamily: fonts.sans, fontStyle: 'italic' },
  });
