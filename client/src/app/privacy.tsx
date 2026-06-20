import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, spacing, type Theme } from '@/constants/theme';
import { useThemedStyles } from '@/lib/theme-provider';

// The plain-English privacy policy, also the public policy URL (doubledone.app/
// privacy) for a store listing. Kept honest and calm, no legalese walls: it
// states the real posture (local-first, email-only PII, AI egress + pseudonymous
// retention, no selling) the way the rest of the app talks.
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.six }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Privacy</Text>
        <Text style={styles.updated}>Last updated 19 June 2026.</Text>

        <Text style={styles.lead}>
          DoubleDone is built to need almost nothing from you. It runs on your device, and nothing leaves it unless you
          choose to sync across devices or use an AI feature. This is the plain version of what that means.
        </Text>

        <Section styles={styles} heading="On your device by default">
          Your tasks live on your device. You can use the whole app, capture, break things down, the Lookback, all of
          it, with no account and nothing sent anywhere.
        </Section>

        <Section styles={styles} heading="If you choose to sync">
          Syncing across devices is optional. If you turn it on, the only personal information held is your email
          address, used to send a one-time sign-in code. There is no password. Your tasks are stored in rows only you
          can read (row-level security scopes every row to your account). You can sign out, or stop syncing, any time.
        </Section>

        <Section styles={styles} heading="The AI features">
          Break it down, Strategise, and Sort for me send the text you typed to our server, which passes it to
          Anthropic&apos;s Claude to do the work. That text and the response are kept, without your name, account, or IP
          address, to improve how the app breaks tasks down for everyone. It is pseudonymous and aggregate, never tied
          to you and never sold. Prefer not to? Just don&apos;t use those features; the rest of the app works fully
          without them.
        </Section>

        <Section styles={styles} heading="What we never do">
          No ads. No third-party trackers or analytics identities. No selling or sharing your data. We never ask for
          your name, phone number, location, or contacts.
        </Section>

        <Section styles={styles} heading="Your control">
          Work entirely offline and anonymous if you like. Sign out whenever you want, which stops syncing. You can
          export all your data as a file at any time. And if you sync, you can permanently delete your account and
          everything synced to it from Settings.
        </Section>

        <Section styles={styles} heading="Questions">
          DoubleDone is an independent project by Melroy D&apos;Souza. Questions or requests can go through the project
          on GitHub: github.com/melroyds/doubledone.
        </Section>

        <Text style={styles.footnote}>Privacy by architecture, not by promises.</Text>
      </ScrollView>
    </View>
  );
}

function Section({ styles, heading, children }: { styles: ReturnType<typeof makeStyles>; heading: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: spacing.five, paddingBottom: spacing.seven, maxWidth: 640, width: '100%', alignSelf: 'center' },
    back: { color: t.colors.accent, fontSize: 15 * t.scale, fontFamily: fonts.bodyBold, fontWeight: '700' },
    title: { color: t.colors.ink, fontSize: 42 * t.scale, fontWeight: '400', fontFamily: fonts.sans, marginTop: spacing.three },
    updated: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, marginTop: spacing.two },
    lead: { color: t.colors.ink, fontSize: 16 * t.scale, lineHeight: 24, fontFamily: fonts.body, marginTop: spacing.five },
    section: { marginTop: spacing.five, gap: spacing.two },
    heading: { color: t.colors.ink, fontSize: 18 * t.scale, fontWeight: '700', fontFamily: fonts.bodyBold },
    body: { color: t.colors.inkSoft, fontSize: 15 * t.scale, lineHeight: 23, fontFamily: fonts.body },
    footnote: { color: t.colors.inkFaint, fontSize: 13 * t.scale, fontFamily: fonts.body, textAlign: 'center', marginTop: spacing.seven },
  });
